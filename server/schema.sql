CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES roles(id)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role_id TEXT REFERENCES roles(id),
  profile TEXT NOT NULL DEFAULT 'standard' CHECK (profile IN ('admin', 'standard')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS objects (
  name TEXT PRIMARY KEY, label TEXT NOT NULL, plural TEXT NOT NULL, prefix TEXT NOT NULL UNIQUE,
  custom INTEGER NOT NULL DEFAULT 0, name_field TEXT NOT NULL DEFAULT 'name',
  sharing TEXT NOT NULL DEFAULT 'public_rw' CHECK (sharing IN ('public_rw', 'public_ro', 'private')),
  path_field TEXT, icon TEXT, description TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fields (
  object TEXT NOT NULL REFERENCES objects(name), name TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0, is_unique INTEGER NOT NULL DEFAULT 0, picklist TEXT,
  reference_to TEXT, cascade INTEGER NOT NULL DEFAULT 0, formula TEXT, rollup TEXT, autonumber TEXT,
  default_value TEXT, searchable INTEGER NOT NULL DEFAULT 0, custom INTEGER NOT NULL DEFAULT 0,
  readonly INTEGER NOT NULL DEFAULT 0, return_type TEXT, help TEXT, sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object, name)
);
CREATE TABLE IF NOT EXISTS layouts (
  object TEXT PRIMARY KEY REFERENCES objects(name), sections TEXT NOT NULL, related TEXT NOT NULL,
  highlights TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_views (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT,
  shared INTEGER NOT NULL DEFAULT 1, scope TEXT NOT NULL DEFAULT 'all', filters TEXT NOT NULL DEFAULT '[]',
  columns TEXT NOT NULL DEFAULT '[]', sort TEXT, kanban_field TEXT
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT, owner_id TEXT, data TEXT NOT NULL,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT, deleted_at TEXT,
  deleted_by TEXT, deleted_parent TEXT
);
CREATE INDEX IF NOT EXISTS records_object ON records (object, deleted_at);
CREATE INDEX IF NOT EXISTS records_owner ON records (owner_id);
CREATE TABLE IF NOT EXISTS field_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, object TEXT NOT NULL, field TEXT NOT NULL,
  old_value TEXT, new_value TEXT, user_id TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_history_record ON field_history (record_id);
CREATE TABLE IF NOT EXISTS validation_rules (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT NOT NULL, condition TEXT NOT NULL,
  message TEXT NOT NULL, field TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('create', 'update', 'create_or_update')),
  criteria TEXT NOT NULL, actions TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, owner_id TEXT, def TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, owner_id TEXT, components TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recent_items (
  user_id TEXT NOT NULL, record_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (user_id, record_id)
);
CREATE TABLE IF NOT EXISTS org_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS currencies (
  iso_code TEXT PRIMARY KEY, name TEXT NOT NULL, rate REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, record_id TEXT NOT NULL, object TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  size INTEGER NOT NULL, owner_id TEXT, created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS files_record ON files (record_id, deleted_at);
CREATE TABLE IF NOT EXISTS feed_items (
  id TEXT PRIMARY KEY, record_id TEXT NOT NULL, object TEXT NOT NULL, type TEXT NOT NULL, body TEXT, changes TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS feed_items_record ON feed_items (record_id, created_at);
CREATE TABLE IF NOT EXISTS feed_comments (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, body TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS feed_comments_item ON feed_comments (item_id);
CREATE TABLE IF NOT EXISTS feed_likes (item_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (item_id, user_id));
CREATE TABLE IF NOT EXISTS feed_mentions (item_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (item_id, user_id));
CREATE TABLE IF NOT EXISTS follows (user_id TEXT NOT NULL, record_id TEXT NOT NULL, PRIMARY KEY (user_id, record_id));
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT,
  created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at);
CREATE TABLE IF NOT EXISTS approval_processes (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT NOT NULL, criteria TEXT NOT NULL,
  approver_type TEXT NOT NULL CHECK (approver_type IN ('manager', 'user')), approver_id TEXT,
  lock_record INTEGER NOT NULL DEFAULT 1, approve_actions TEXT NOT NULL DEFAULT '[]',
  reject_actions TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY, process_id TEXT NOT NULL, object TEXT NOT NULL, record_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'recalled')),
  submitted_by TEXT NOT NULL, approver_id TEXT NOT NULL, submitted_at TEXT NOT NULL, decided_at TEXT
);
CREATE INDEX IF NOT EXISTS approval_requests_record ON approval_requests (record_id, status);
CREATE TABLE IF NOT EXISTS approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, action TEXT NOT NULL, actor_id TEXT NOT NULL,
  comment TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, object TEXT, subject TEXT NOT NULL, body TEXT NOT NULL,
  created_by TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY, record_id TEXT NOT NULL, object TEXT NOT NULL, from_address TEXT NOT NULL, to_addresses TEXT NOT NULL,
  cc_addresses TEXT, bcc_addresses TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
  transport TEXT NOT NULL, error TEXT, sent_by TEXT NOT NULL, sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_messages_record ON email_messages (record_id);
