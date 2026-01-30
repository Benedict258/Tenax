const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com/v2';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadAudio(buffer) {
  const response = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      authorization: ASSEMBLYAI_API_KEY
    },
    body: buffer
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AssemblyAI upload failed: ${errorText}`);
  }

  const payload = await response.json();
  return payload.upload_url;
}

async function requestTranscript(uploadUrl) {
  const response = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      punctuate: true,
      format_text: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AssemblyAI transcript request failed: ${errorText}`);
  }

  return response.json();
}

async function waitForTranscript(transcriptId, maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
      headers: { authorization: ASSEMBLYAI_API_KEY }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AssemblyAI transcript status failed: ${errorText}`);
    }

    const payload = await response.json();
    if (payload.status === 'completed') {
      return payload.text || '';
    }
    if (payload.status === 'error') {
      throw new Error(payload.error || 'AssemblyAI transcription failed');
    }
    await sleep(2000);
  }
  throw new Error('AssemblyAI transcription timed out');
}

async function transcribeAudio(buffer) {
  if (!ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY not configured');
  }

  const uploadUrl = await uploadAudio(buffer);
  const transcript = await requestTranscript(uploadUrl);
  return waitForTranscript(transcript.id);
}

module.exports = {
  transcribeAudio
};
