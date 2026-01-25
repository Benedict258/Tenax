const express = require('express');
const User = require('../models/User');
const UserChannel = require('../models/UserChannel');
const whatsappService = require('../services/whatsapp');
const agentPipeline = require('../services/agentPipeline');

const router = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    const { From, Body } = req.body;
    if (!From || !Body) {
      return res.status(400).send('Missing required fields');
    }

    const phoneNumber = From.replace('whatsapp:', '');
    const user = await User.findByPhone(phoneNumber);
    if (!user) {
      return res.status(200).send('User not found');
    }

    if (!user.phone_verified) {
      await whatsappService.sendMessage(phoneNumber, 'Please verify your phone number first through the app.');
      return res.status(200).send('Phone not verified');
    }

    await UserChannel.link(user.id, 'whatsapp', phoneNumber, {
      verified: true,
      metadata: { source: 'twilio' }
    });

    await agentPipeline.handleMessage({
      user,
      channel: 'whatsapp',
      text: Body,
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
