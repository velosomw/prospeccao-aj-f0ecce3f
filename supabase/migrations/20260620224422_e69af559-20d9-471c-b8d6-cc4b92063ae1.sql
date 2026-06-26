
UPDATE processing_queue
SET attempts=0, max_attempts=3, next_attempt_at=now(), status='pending', picked_at=NULL, lock_until=NULL, locked_by=NULL
WHERE status='pending'
  AND file_id IN (SELECT file_id FROM onedrive_files WHERE ano=2025 AND mes=11 AND status='queued');
