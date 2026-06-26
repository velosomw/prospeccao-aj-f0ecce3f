
UPDATE processing_queue
SET status='pending', picked_at=NULL, lock_until=NULL
WHERE status='processing'
  AND lock_until IS NULL
  AND picked_at < now() - interval '30 minutes'
  AND file_id IN (SELECT file_id FROM onedrive_files WHERE ano=2025 AND mes=11 AND status='queued');
