-- B306: Drop old auth tables — credentials now managed by unified jaskier-auth
-- IMPORTANT: Run ONLY after credentials have been migrated to Vault.

DROP TABLE IF EXISTS gh_oauth_tokens CASCADE;
DROP TABLE IF EXISTS gh_google_auth CASCADE;
DROP TABLE IF EXISTS gh_oauth_github CASCADE;
DROP TABLE IF EXISTS gh_oauth_vercel CASCADE;
DROP TABLE IF EXISTS gh_service_tokens CASCADE;
