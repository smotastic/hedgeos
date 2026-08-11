CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY,
  address varchar(17) NOT NULL UNIQUE CHECK (address ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  capability text NOT NULL CHECK (capability = 'contact'),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  state text NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown', 'open', 'closed')),
  registered_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
