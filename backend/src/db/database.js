import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'strava_cache.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
const initSchema = () => {
  db.exec(`
    -- Activities table
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      distance REAL,
      moving_time INTEGER,
      elapsed_time INTEGER,
      total_elevation_gain REAL,
      type TEXT,
      sport_type TEXT,
      start_date TEXT,
      start_date_local TEXT,
      timezone TEXT,
      average_speed REAL,
      max_speed REAL,
      average_cadence REAL,
      average_heartrate REAL,
      max_heartrate REAL,
      average_watts REAL,
      weighted_average_watts REAL,
      description TEXT,
      gear_id TEXT,
      map_summary_polyline TEXT,
      session_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Equipment table
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      brand_name TEXT,
      model_name TEXT,
      description TEXT,
      distance REAL,
      primary_gear INTEGER DEFAULT 0,
      retired INTEGER DEFAULT 0,
      session_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Cache metadata table (tracks last fetch times)
    CREATE TABLE IF NOT EXISTS cache_metadata (
      key TEXT PRIMARY KEY,
      session_id TEXT,
      last_fetched INTEGER NOT NULL,
      expires_at INTEGER,
      metadata TEXT
    );

    -- Athletes table (FTP, weight from Strava profile)
    CREATE TABLE IF NOT EXISTS athletes (
      id TEXT PRIMARY KEY,
      ftp INTEGER,
      max_heartrate INTEGER,
      weight REAL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- FTP history (manually maintained by user)
    CREATE TABLE IF NOT EXISTS ftp_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id TEXT NOT NULL,
      ftp INTEGER NOT NULL,
      lthr INTEGER,
      valid_from TEXT NOT NULL
    );

    -- Whoop OAuth tokens
    CREATE TABLE IF NOT EXISTS whoop_tokens (
      athlete_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Whoop daily recovery data
    CREATE TABLE IF NOT EXISTS whoop_recoveries (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      date TEXT NOT NULL,
      score REAL,
      hrv_rmssd REAL,
      resting_heart_rate REAL,
      spo2 REAL,
      skin_temp REAL
    );

    -- Whoop daily cycles/strain data
    CREATE TABLE IF NOT EXISTS whoop_cycles (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      date TEXT NOT NULL,
      strain REAL,
      kilojoule REAL,
      average_heart_rate REAL,
      max_heart_rate REAL
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_activities_gear_id ON activities(gear_id);
    CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_session_gear ON activities(session_id, gear_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_session ON equipment(session_id);
    CREATE INDEX IF NOT EXISTS idx_cache_session ON cache_metadata(session_id);
    CREATE INDEX IF NOT EXISTS idx_ftp_history_athlete ON ftp_history(athlete_id, valid_from DESC);
    CREATE INDEX IF NOT EXISTS idx_whoop_recoveries_athlete ON whoop_recoveries(athlete_id, date ASC);
    CREATE INDEX IF NOT EXISTS idx_whoop_cycles_athlete ON whoop_cycles(athlete_id, date ASC);
  `);

  // Migrations: add columns that may not exist in older databases
  const migrations = [
    'ALTER TABLE activities ADD COLUMN average_watts REAL',
    'ALTER TABLE activities ADD COLUMN weighted_average_watts REAL',
    'ALTER TABLE activities ADD COLUMN description TEXT',
    'ALTER TABLE activities ADD COLUMN kilojoules REAL',
    'ALTER TABLE activities ADD COLUMN device_watts INTEGER',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  console.log('✅ Database initialized at:', dbPath);
};

// Initialize schema on startup
initSchema();

export default db;
