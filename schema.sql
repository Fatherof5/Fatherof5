CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_prices (
  item_id INTEGER PRIMARY KEY,
  item_name TEXT NOT NULL,
  lowest_bazaar INTEGER,
  buy_price INTEGER,
  pricing_mode TEXT NOT NULL,
  discount_percent REAL,
  fixed_price INTEGER,
  quantity_available INTEGER,
  observed_at TEXT,
  age_s INTEGER,
  reporters INTEGER,
  source TEXT,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor INTEGER NOT NULL DEFAULT 0,
  last_run TEXT
);

INSERT OR IGNORE INTO refresh_state (id, cursor, last_run) VALUES (1, 0, NULL);
