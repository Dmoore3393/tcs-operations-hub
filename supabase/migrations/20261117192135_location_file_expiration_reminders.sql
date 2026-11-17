-- Existing pg_cron scheduler; daily at 13:00 UTC (5/6 AM Pacific).
-- Persistent notice keys make repeated scans safe and prevent duplicate reminders.
select cron.schedule('tcs-location-file-expirations','0 13 * * *','select tcs_files_private.scan_file_expirations()');
