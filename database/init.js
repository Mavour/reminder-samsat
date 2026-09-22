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
      nopol TEXT NOT NULL,
      jenis_kendaraan TEXT NOT NULL,
      merk TEXT,
      tahun INTEGER,
      warna TEXT,
      tanggal_pajak DATE NOT NULL,
      estimasi_pkb DECIMAL(12,2) DEFAULT 0,
      estimasi_opsen_pkb DECIMAL(12,2) DEFAULT 0,
      estimasi_swdkllj DECIMAL(12,2) DEFAULT 0,
      total_estimasi DECIMAL(12,2) DEFAULT 0,
      status_aktif INTEGER DEFAULT 1,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      nopol_snapshot TEXT,
      tanggal_pajak_lama DATE,
      tanggal_pajak_baru DATE NOT NULL,
      tanggal_bayar DATE,
      dibayar_oleh_user_id INTEGER,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (dibayar_oleh_user_id) REFERENCES users(id)
    );
  `);

  // Migrasi: hapus kolom user_id dari vehicles (kepemilikan tidak dipakai).
  migrateDropVehiclesUserId(db);

  // Migrasi: tambah kolom estimasi_opsen_pkb untuk DB lama yang belum punya
  const cols = db.prepare(`PRAGMA table_info(vehicles)`).all();
  if (!cols.some(c => c.name === 'estimasi_opsen_pkb')) {
    db.exec(`ALTER TABLE vehicles ADD COLUMN estimasi_opsen_pkb DECIMAL(12,2) DEFAULT 0`);
    console.log('[DB] Migrasi: kolom estimasi_opsen_pkb ditambahkan');
  }

  // Migrasi: hapus kolom estimasi_biaya_lain (ambigu dengan biaya ganti plat otomatis).
  // Total dihitung ulang tanpa komponen tersebut.
  if (db.prepare(`PRAGMA table_info(vehicles)`).all().some(c => c.name === 'estimasi_biaya_lain')) {
    db.exec(`UPDATE vehicles SET total_estimasi = COALESCE(estimasi_pkb, 0) + COALESCE(estimasi_opsen_pkb, 0) + COALESCE(estimasi_swdkllj, 0)`);
    try {
      db.exec(`ALTER TABLE vehicles DROP COLUMN estimasi_biaya_lain`);
    } catch (e) {
      db.exec(`UPDATE vehicles SET estimasi_biaya_lain = 0`);
      console.log('[DB] Migrasi: DROP COLUMN tidak didukung, estimasi_biaya_lain di-nol-kan (' + e.message + ')');
    }
    console.log('[DB] Migrasi: kolom estimasi_biaya_lain dihapus');
  }

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

function migrateDropVehiclesUserId(db) {
  const cols = db.prepare(`PRAGMA table_info(vehicles)`).all().map(c => c.name);
  if (!cols.includes('user_id')) return; // sudah skema baru

  // DROP COLUMN tidak bisa dipakai: user_id terikat definisi foreign key.
  // Salin ulang tabel tanpa user_id. PRAGMA foreign_keys harus di luar
  // transaksi (no-op di dalam transaksi).
  console.log('[DB] Migrasi: hapus kolom vehicles.user_id ...');
  db.pragma('foreign_keys = OFF');
  try {
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE vehicles_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nopol TEXT NOT NULL,
          jenis_kendaraan TEXT NOT NULL,
          merk TEXT,
          tahun INTEGER,
          warna TEXT,
          tanggal_pajak DATE NOT NULL,
          estimasi_pkb DECIMAL(12,2) DEFAULT 0,
          estimasi_opsen_pkb DECIMAL(12,2) DEFAULT 0,
          estimasi_swdkllj DECIMAL(12,2) DEFAULT 0,
          total_estimasi DECIMAL(12,2) DEFAULT 0,
          status_aktif INTEGER DEFAULT 1,
          catatan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO vehicles_new
          (id, nopol, jenis_kendaraan, merk, tahun, warna, tanggal_pajak,
           estimasi_pkb, estimasi_opsen_pkb, estimasi_swdkllj, total_estimasi,
           status_aktif, catatan, created_at, updated_at)
        SELECT id, nopol, jenis_kendaraan, merk, tahun, warna, tanggal_pajak,
          estimasi_pkb, estimasi_opsen_pkb, estimasi_swdkllj, total_estimasi,
          status_aktif, catatan, created_at, updated_at
        FROM vehicles;
        DROP TABLE vehicles;
        ALTER TABLE vehicles_new RENAME TO vehicles;
      `);
    });
    migrate();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  console.log('[DB] Migrasi: kolom vehicles.user_id dihapus.');
}

module.exports = { getDb, initDatabase };
