import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new Database(path.join(__dirname, "..", "data.sqlite"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst', -- 'admin' | 'analyst'
  region TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  state TEXT NOT NULL,
  venue TEXT NOT NULL,
  venue_city TEXT,
  event_name TEXT NOT NULL,
  event_category TEXT NOT NULL DEFAULT 'Other',
  event_date TEXT NOT NULL,        -- stored as MM/DD/YYYY text, never reformatted
  listing_date TEXT NOT NULL,      -- MM/DD/YYYY text
  analyst TEXT,
  priority TEXT NOT NULL DEFAULT 'Standard',
  stubhub_lot_name TEXT,
  stubhub_price REAL,              -- NULL = not entered
  spothero_price REAL,             -- NULL means N/A / not entered
  parkwhiz_price REAL,
  parkingcom_price REAL,
  parkmobile_price REAL,
  location_notes TEXT,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Needs Research',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Manually-verified reference prices an analyst has actually checked in the past.
-- This is NEVER auto-generated or derived from another price - it only exists because
-- a human typed in a real number they saw on a real platform on a real date.
CREATE TABLE IF NOT EXISTS saved_lots (
  id TEXT PRIMARY KEY,
  venue TEXT NOT NULL,
  lot_name_or_address TEXT NOT NULL,
  platform TEXT NOT NULL,       -- SpotHero | ParkWhiz | Parking.com | ParkMobile | StubHub
  price_seen REAL NOT NULL,
  date_checked TEXT NOT NULL,   -- MM/DD/YYYY - when the analyst actually looked
  event_context TEXT,           -- e.g. "Rams regular season game" - helps judge relevance later
  analyst TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// seed a first admin user if none exist
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "changeme";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(randomUUID(), email, hash);
  console.log(`Seeded admin user: ${email} (change the password after first login)`);
}
