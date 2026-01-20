ALTER TABLE timetable_uploads
  ADD COLUMN IF NOT EXISTS ocr_payload JSONB;
