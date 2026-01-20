const scheduleService = require('./scheduleService');
const { parseDinoPrediction } = require('./ocrParser');
const replicateApiKey = process.env.REPLICATE_API_KEY;
const replicateModelVersion = process.env.REPLICATE_DINO_VERSION || process.env.DINO_MODEL_ID;
const replicateBaseUrl = 'https://api.replicate.com/v1/predictions';
const pollingIntervalMs = 2000;

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
    if (!replicateApiKey || !replicateModelVersion) {
      console.warn('[OCR] Replicate credentials or model version missing; skipping extraction');
      return [];
    }

    const signedUrl = await scheduleService.getSignedUploadUrl(upload.storage_path, 600);
    if (!signedUrl) {
      throw new Error('Failed to generate signed URL for upload');
    }

    const prediction = await this.runReplicatePrediction({ image: signedUrl });
    await scheduleService.saveOcrPayload(upload.id, prediction);

    const rows = parseDinoPrediction(prediction, { uploadId: upload.id });
    console.log(
      `[OCR] DINO inference complete for upload ${upload.id}. Status: ${prediction.status}. Parsed rows: ${rows.length}`
    );

    await scheduleService.logTrace('schedule_ocr_prediction', {
      upload_id: upload.id,
      user_id: upload.user_id,
      status: prediction?.status,
      model_version: replicateModelVersion,
      parsed_rows: rows.length
    });

    return rows;
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
}

module.exports = new OcrService();
