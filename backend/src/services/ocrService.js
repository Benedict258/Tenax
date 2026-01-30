const scheduleService = require('./scheduleService');
const { parseDinoPrediction } = require('./ocrParser');

const replicateApiKey = process.env.REPLICATE_API_KEY;
const replicateModelVersion = process.env.REPLICATE_DINO_VERSION || process.env.DINO_MODEL_ID;
const replicateBaseUrl = 'https://api.replicate.com/v1/predictions';
const pollingIntervalMs = 2000;

const huggingfaceToken =
  process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACE_WRITE_TOKEN;
const huggingfaceModelId =
  process.env.HUGGINGFACE_MODEL_ID || process.env.HF_MODEL_ID || 'facebook/dinov3-vitl16-pretrain-lvd1689m';
const huggingfaceBaseUrl = process.env.HUGGINGFACE_API_BASE_URL || 'https://api-inference.huggingface.co/models';
const huggingfaceMaxRetries = Number(process.env.HUGGINGFACE_MAX_RETRIES || 3);
const fetchTimeoutMs = Number(process.env.OCR_FETCH_TIMEOUT_MS || 20000);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error;
      const delay = (attempt + 1) * 800;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

class OcrService {
  async processUpload(uploadId) {
    const upload = await scheduleService.getUploadById(uploadId);
    if (!upload) {
      throw new Error(`Upload ${uploadId} not found`);
    }

    await scheduleService.updateUploadStatus(uploadId, 'processing');

    try {
      const rows = await this.extractRowsWithDino(upload);
      if (rows.length) {
        await scheduleService.recordExtractionRows(rows.map((row) => ({
          ...row,
          upload_id: upload.id,
          user_id: upload.user_id
        })));
      }

      await scheduleService.updateUploadStatus(uploadId, 'done');
      return rows.length;
    } catch (error) {
      await scheduleService.updateUploadStatus(uploadId, 'failed', error.message);
      console.error('[OCR] Extraction failed:', error.message);
      throw error;
    }
  }

  async extractRowsWithDino(upload) {
    const signedUrl = await scheduleService.getSignedUploadUrl(upload.storage_path, 600);
    if (!signedUrl) {
      throw new Error('Failed to generate signed URL for upload');
    }

    const { prediction, provider, modelVersion } = await this.runAvailableProvider(signedUrl);
    await scheduleService.saveOcrPayload(upload.id, { provider, prediction });

    const rows = parseDinoPrediction(prediction, { uploadId: upload.id });
    console.log(
      `[OCR] Inference complete via ${provider} for upload ${upload.id}. Status: ${prediction.status}. Parsed rows: ${rows.length}`
    );

    await scheduleService.logTrace('schedule_ocr_prediction', {
      upload_id: upload.id,
      user_id: upload.user_id,
      status: prediction?.status,
      model_version: modelVersion,
      provider,
      parsed_rows: rows.length
    });

    return rows;
  }

  async runAvailableProvider(signedUrl) {
    let lastError = null;

    if (replicateApiKey && replicateModelVersion) {
      try {
        const prediction = await this.runReplicatePrediction({ image: signedUrl });
        return { prediction, provider: 'replicate', modelVersion: replicateModelVersion };
      } catch (error) {
        lastError = error;
        console.warn('[OCR] Replicate call failed, attempting Hugging Face fallback:', error.message);
      }
    }

    if (huggingfaceToken && huggingfaceModelId) {
      const prediction = await this.runHuggingFacePrediction({ signedUrl });
      return { prediction, provider: 'huggingface', modelVersion: huggingfaceModelId };
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('No OCR provider configured. Set Replicate or Hugging Face credentials.');
  }

  async runReplicatePrediction(input) {
    const startResponse = await fetch(replicateBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${replicateApiKey}`
      },
      body: JSON.stringify({
        version: replicateModelVersion,
        input
      })
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      throw new Error(`Replicate prediction start failed: ${errorText}`);
    }

    const startPayload = await startResponse.json();
    return this.waitForPrediction(startPayload.id);
  }

  async waitForPrediction(predictionId) {
    while (true) {
      const response = await fetch(`${replicateBaseUrl}/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${replicateApiKey}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Replicate polling failed: ${errorText}`);
      }

      const payload = await response.json();
      if (payload.status === 'succeeded') {
        return payload;
      }
      if (payload.status === 'failed' || payload.status === 'canceled') {
        throw new Error(payload.error || `Replicate prediction ${payload.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
    }
  }

  async runHuggingFacePrediction({ signedUrl }) {
    const imageResponse = await fetchWithRetry(signedUrl, {}, 2);
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      throw new Error(`Failed to download upload for Hugging Face OCR: ${errorText}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    for (let attempt = 0; attempt < huggingfaceMaxRetries; attempt += 1) {
      const hfResponse = await fetchWithRetry(`${huggingfaceBaseUrl}/${huggingfaceModelId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${huggingfaceToken}`,
          'Content-Type': 'application/octet-stream'
        },
        body: imageBuffer
      }, 2);

      if (hfResponse.status === 503) {
        const delay = (attempt + 1) * 1000;
        console.info(`[OCR] Hugging Face model warming up (attempt ${attempt + 1}); retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        throw new Error(`Hugging Face prediction failed: ${errorText}`);
      }

      const payload = await hfResponse.json();
      if (payload?.error) {
        throw new Error(`Hugging Face prediction error: ${payload.error}`);
      }

      return {
        id: payload?.id || null,
        status: payload?.status || 'succeeded',
        output: payload?.output || payload
      };
    }

    throw new Error('Hugging Face model did not become available in time');
  }
}

module.exports = new OcrService();
