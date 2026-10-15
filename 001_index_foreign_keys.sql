-- Index three foreign keys the API filters on.
--
-- PostgreSQL indexes a primary key automatically but not the columns that point at one,
-- so each of these was a full table scan, and deleting a user had to scan user_tokens to
-- find the rows to cascade.
--
--   support_cases.assignee_id   every support case list filters on it (routers/support.py)
--   checkout_sessions.user_id   a buyer's open checkout sessions
--   user_tokens.user_id         a user's verification and reset tokens; also ON DELETE CASCADE

CREATE INDEX support_cases_assignee_idx ON support_cases (assignee_id);
CREATE INDEX checkout_sessions_user_idx ON checkout_sessions (user_id);
CREATE INDEX user_tokens_user_idx ON user_tokens (user_id);
