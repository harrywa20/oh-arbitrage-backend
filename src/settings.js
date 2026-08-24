import { db } from "./db.js";

const defaults = {
  notify_new_event: process.env.NOTIFY_NEW_EVENT || "true",
  notify_priced_positive: process.env.NOTIFY_PRICED_POSITIVE || "true",
  only_high_priority: process.env.ONLY_HIGH_PRIORITY || "false",
  spread_threshold_percent: process.env.SPREAD_THRESHOLD_PERCENT || "0",
  digest_time: process.env.DIGEST_TIME || "08:00",
  digest_enabled: process.env.DIGEST_ENABLED || "true",
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }
}

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : defaults[key];
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

export function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = { ...defaults };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
