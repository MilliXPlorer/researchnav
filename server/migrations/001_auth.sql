CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  google_sub TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN (
    'admin', 'researcher', 'adviser', 'instructor', 'panel',
    'statistician', 'coordinator', 'librarian', 'research-office', 'academics'
  )),
  access_status TEXT NOT NULL DEFAULT 'blocked'
    CHECK (access_status IN ('active', 'invited', 'blocked')),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by UUID REFERENCES app_users(id),
  invitation_sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_admin_consistency CHECK ((role = 'admin') = is_admin)
);

CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users (role);
CREATE INDEX IF NOT EXISTS app_users_access_status_idx ON app_users (access_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_admin_consistency'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_admin_consistency CHECK ((role = 'admin') = is_admin);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
