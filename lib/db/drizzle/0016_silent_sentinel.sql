UPDATE "audit_logs"
SET
  "before_data" = CASE WHEN "before_data" IS NULL THEN NULL ELSE "before_data" - 'passwordHash' - 'password_hash' - 'resetToken' - 'reset_token' - 'accessToken' - 'access_token' - 'sessionSecret' - 'session_secret' END,
  "after_data" = CASE WHEN "after_data" IS NULL THEN NULL ELSE "after_data" - 'passwordHash' - 'password_hash' - 'resetToken' - 'reset_token' - 'accessToken' - 'access_token' - 'sessionSecret' - 'session_secret' END
WHERE
  ("before_data" IS NOT NULL AND "before_data" ?| ARRAY['passwordHash', 'password_hash', 'resetToken', 'reset_token', 'accessToken', 'access_token', 'sessionSecret', 'session_secret'])
  OR ("after_data" IS NOT NULL AND "after_data" ?| ARRAY['passwordHash', 'password_hash', 'resetToken', 'reset_token', 'accessToken', 'access_token', 'sessionSecret', 'session_secret']);
