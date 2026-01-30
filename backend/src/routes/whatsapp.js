const express = require('express');
const User = require('../models/User');
const UserChannel = require('../models/UserChannel');
const whatsappService = require('../services/whatsapp');
const agentPipeline = require('../services/agentPipeline');
const scheduleService = require('../services/scheduleService');
const scheduleQueues = require('../services/scheduleQueues');
const { transcribeAudio } = require('../services/assemblyAi');

async function downloadTwilioMedia(mediaUrl) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials missing for media download');
  }

  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${authHeader}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch media: ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

const router = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
    if (!From) {
      return res.status(400).send('Missing required fields');
    }

    const phoneNumber = From.replace('whatsapp:', '');
    const user = await User.findByPhone(phoneNumber);
    if (!user) {
      return res.status(200).send('User not found');
    }

    await UserChannel.link(user.id, 'whatsapp', phoneNumber, {
      verified: true,
      metadata: { source: 'twilio' }
    });

    let text = Body;
    const hasMedia = Number(NumMedia) > 0 && MediaUrl0;

    if (!text && hasMedia) {
      const mediaType = (MediaContentType0 || '').toLowerCase();
      const isAudio = mediaType.startsWith('audio/');
      const isPdf = mediaType === 'application/pdf';
      const isImage = mediaType.startsWith('image/');

      const { buffer, contentType } = await downloadTwilioMedia(MediaUrl0);

      if (isAudio) {
        try {
          text = await transcribeAudio(buffer);
        } catch (error) {
          console.error('[WhatsApp] Audio transcription failed:', error.message);
          await whatsappService.sendMessage(
            phoneNumber,
            'I had trouble transcribing that voice note. Could you try again or send the text directly?'
          );
          return res.status(200).send('Transcription failed');
        }
      } else if (isImage || isPdf) {
        const extension = isPdf ? '.pdf' : '.jpg';
        const file = {
          originalname: `whatsapp-upload${extension}`,
          mimetype: contentType,
          buffer
        };

        const uploadRecord = await scheduleService.ingestUpload({
          userId: user.id,
          source: 'whatsapp',
          file
        });
        await scheduleQueues.enqueueUploadJob({
          uploadId: uploadRecord.id,
          userId: user.id
        });

        await whatsappService.sendMessage(
          phoneNumber,
          'Got the timetable. I am extracting the schedule now and will ask for confirmation before adding it.'
        );

        return res.status(200).send('Timetable queued');
      }
    }

    if (!text) {
      return res.status(400).send('Missing message content');
    }

    await agentPipeline.handleMessage({
      user,
      channel: 'whatsapp',
      text,
      externalId: phoneNumber,
      transport: {
        send: (message) => whatsappService.sendMessage(phoneNumber, message)
      },
      raw: req.body
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).send('Error processing message');
  }
});

router.get('/webhook', (req, res) => {
  res.send('Tenax WhatsApp webhook is running!');
});

module.exports = router;
