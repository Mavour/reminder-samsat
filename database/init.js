const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'samsat.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      nama TEXT,
      no_hp TEXT,
      jabatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      nopol TEXT NOT NULL,
      jenis_kendaraan TEXT NOT NULL,
      merk TEXT,
      tahun INTEGER,
      warna TEXT,
      tanggal_pajak DATE NOT NULL,
      estimasi_pkb DECIMAL(12,2) DEFAULT 0,
      estimasi_swdkllj DECIMAL(12,2) DEFAULT 0,
      estimasi_biaya_lain DECIMAL(12,2) DEFAULT 0,
      total_estimasi DECIMAL(12,2) DEFAULT 0,
      no_hp_penerima TEXT,
      status_aktif INTEGER DEFAULT 1,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      type TEXT,
      message TEXT,
      status TEXT,
      error_msg TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      google_event_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      no_hp TEXT NOT NULL,
      jabatan TEXT,
      status_aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role, nama, jabatan) VALUES (?, ?, ?, ?, ?)').run(
      'admin', hash, 'admin', 'Administrator', 'Admin Sistem'
    );
    console.log('[DB] Akun admin default dibuat (admin/admin123)');
  }

  console.log('[DB] Database berhasil diinisialisasi');
  return db;
}

module.exports = { getDb, initDatabase };
