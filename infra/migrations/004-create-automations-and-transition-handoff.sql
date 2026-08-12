CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  enabled boolean NOT NULL DEFAULT true,
  current_revision integer NOT NULL CHECK (current_revision > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_revisions (
  id uuid PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES automations(id),
  revision integer NOT NULL CHECK (revision > 0),
  capability text NOT NULL CHECK (capability = 'contact'),
  device_address varchar(17),
  previous_state text CHECK (previous_state IN ('open', 'closed')),
  current_state text NOT NULL CHECK (current_state IN ('open', 'closed')),
  created_at timestamptz NOT NULL,
  UNIQUE (automation_id, revision)
);

CREATE TABLE IF NOT EXISTS transition_handoff (
  transition_id uuid PRIMARY KEY REFERENCES state_transitions(id),
  available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  claimed_by text,
  lease_until timestamptz,
  acknowledged_at timestamptz,
  last_error text
);

INSERT INTO transition_handoff (transition_id, available_at)
SELECT id, occurred_at FROM state_transitions
ON CONFLICT (transition_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS transition_handoff_available_idx
  ON transition_handoff (available_at, acknowledged_at, lease_until);
CREATE INDEX IF NOT EXISTS automation_revisions_lookup_idx
  ON automation_revisions (automation_id, revision);

CREATE TABLE IF NOT EXISTS automation_executions (
  id uuid PRIMARY KEY,
  transition_id uuid NOT NULL REFERENCES state_transitions(id),
  automation_id uuid NOT NULL REFERENCES automations(id),
  automation_revision_id uuid NOT NULL REFERENCES automation_revisions(id),
  mode text NOT NULL CHECK (mode IN ('live', 'replay')),
  status text NOT NULL CHECK (status IN ('recorded', 'failed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  failure_reason text,
  UNIQUE (transition_id, automation_revision_id, mode)
);

CREATE TABLE IF NOT EXISTS logical_notification_actions (
  id uuid PRIMARY KEY,
  execution_id uuid NOT NULL REFERENCES automation_executions(id),
  action_type text NOT NULL CHECK (action_type = 'telegram_notification'),
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'delivered', 'suppressed', 'failed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  failure_reason text,
  UNIQUE (execution_id, action_type)
);
CREATE INDEX IF NOT EXISTS automation_executions_transition_idx ON automation_executions (transition_id);

CREATE TABLE IF NOT EXISTS notification_attempts (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES logical_notification_actions(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('sending', 'delivered', 'retryable', 'permanent')),
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  failure_reason text,
  UNIQUE (action_id, attempt_number)
);
