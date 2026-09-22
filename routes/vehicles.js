const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');
const { enrichVehicle } = require('../services/gantiPlat');
const { witaNow, witaDateString, diffDaysFromToday } = require('../services/wita');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  let vehicles = db.prepare(`
    SELECT * FROM vehicles
    WHERE status_aktif = 1
    ORDER BY tanggal_pajak ASC
  `).all();

  const now = witaNow();
  const currentYear = now.getFullYear();
  vehicles = vehicles.map(v => {
    const diffDays = diffDaysFromToday(v.tanggal_pajak);

    const enriched = enrichVehicle(v, currentYear);

    let status = 'aman';
    let status_label = 'Aman';

    if (diffDays < 0) {
      status = 'lewat';
      status_label = 'Lewat Tempo';
    } else if (diffDays <= 3) {
      status = 'kritis';
      status_label = 'Kritis (H-' + diffDays + ')';
    } else if (diffDays <= 7) {
      status = 'mendesak';
      status_label = 'Mendesak (H-' + diffDays + ')';
    } else if (diffDays <= 30) {
      status = 'warning';
      status_label = 'Perlu Perhatian (H-' + diffDays + ')';
    }

    return { ...enriched, status, status_label, days_remaining: diffDays };
  });

  res.json(vehicles);
});

router.get('/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const todayStr = witaDateString();
  const in30Str = witaDateString(30);

  const total = db.prepare(`SELECT COUNT(*) as count FROM vehicles WHERE status_aktif = 1`).get().count;
  const expiring = db.prepare(`SELECT COUNT(*) as count FROM vehicles WHERE status_aktif = 1 AND tanggal_pajak >= ? AND tanggal_pajak <= ?`).get(todayStr, in30Str).count;
  const expired = db.prepare(`SELECT COUNT(*) as count FROM vehicles WHERE status_aktif = 1 AND tanggal_pajak < ?`).get(todayStr).count;

  const currentYear = witaNow().getFullYear();
  const in30Vehicles = db.prepare(`SELECT * FROM vehicles WHERE status_aktif = 1 AND tanggal_pajak >= ? AND tanggal_pajak <= ?`).all(todayStr, in30Str);
  const totalBiaya = in30Vehicles.reduce((sum, v) => sum + enrichVehicle(v, currentYear).total_estimasi_lengkap, 0);

  res.json({
    total_kendaraan: total,
    pajak_30_hari: expiring,
    pajak_lewat: expired,
    estimasi_biaya_30_hari: totalBiaya
  });
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  res.json(enrichVehicle(vehicle, witaNow().getFullYear()));
});

router.post('/', authMiddleware, (req, res) => {
  const {
    nopol, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, estimasi_pkb, estimasi_opsen_pkb, estimasi_swdkllj,
    catatan
  } = req.body;

  if (!nopol || !jenis_kendaraan || !tanggal_pajak) {
    return res.status(400).json({ error: 'Nopol, jenis kendaraan, dan tanggal pajak wajib diisi.' });
  }

  const pkb = parseFloat(estimasi_pkb) || 0;
  const opsen = parseFloat(estimasi_opsen_pkb) || 0;
  const swdkllj = parseFloat(estimasi_swdkllj) || 0;
  const total = pkb + opsen + swdkllj;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO vehicles (nopol, jenis_kendaraan, merk, tahun, warna, tanggal_pajak, estimasi_pkb, estimasi_opsen_pkb, estimasi_swdkllj, total_estimasi, catatan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nopol.toUpperCase().trim(), jenis_kendaraan, merk || null, tahun || null, warna || null, tanggal_pajak, pkb, opsen, swdkllj, total, catatan || null);

  res.status(201).json({
    message: 'Kendaraan berhasil ditambahkan.',
    vehicle: { id: result.lastInsertRowid, nopol: nopol.toUpperCase() }
  });
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  const {
    nopol, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, estimasi_pkb, estimasi_opsen_pkb, estimasi_swdkllj,
    catatan, status_aktif
  } = req.body;

  const numOrKeep = (val, old) => (val === undefined || val === null || val === '' ? (parseFloat(old) || 0) : (parseFloat(val) || 0));
  const pkb = numOrKeep(estimasi_pkb, vehicle.estimasi_pkb);
  const opsen = numOrKeep(estimasi_opsen_pkb, vehicle.estimasi_opsen_pkb);
  const swdkllj = numOrKeep(estimasi_swdkllj, vehicle.estimasi_swdkllj);
  const total = pkb + opsen + swdkllj;

  db.prepare(`
    UPDATE vehicles SET
      nopol = COALESCE(?, nopol),
      jenis_kendaraan = COALESCE(?, jenis_kendaraan),
      merk = COALESCE(?, merk),
      tahun = COALESCE(?, tahun),
      warna = COALESCE(?, warna),
      tanggal_pajak = COALESCE(?, tanggal_pajak),
      estimasi_pkb = ?,
      estimasi_opsen_pkb = ?,
      estimasi_swdkllj = ?,
      total_estimasi = ?,
      catatan = COALESCE(?, catatan),
      status_aktif = COALESCE(?, status_aktif),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nopol ? nopol.toUpperCase().trim() : null, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, pkb, opsen, swdkllj, total,
    catatan, status_aktif, req.params.id
  );

  res.json({ message: 'Data kendaraan berhasil diperbarui.' });
});

function addOneYear(dateStr) {
  const parts = String(dateStr).split('T')[0].split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  // Tangani 29 Feb -> 28 Feb tahun berikutnya
  const dt = new Date(Date.UTC(y + 1, m - 1, d));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

router.post('/:id/mark-paid', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  let { tanggal_bayar, tanggal_pajak_baru, catatan } = req.body || {};
  const todayStr = witaDateString();
  if (!tanggal_bayar || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal_bayar)) {
    tanggal_bayar = todayStr;
  }
  if (!tanggal_pajak_baru || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal_pajak_baru)) {
    tanggal_pajak_baru = addOneYear(vehicle.tanggal_pajak);
  }
  if (!tanggal_pajak_baru) {
    return res.status(400).json({ error: 'Tanggal pajak lama tidak valid, isi tanggal pajak baru manual.' });
  }

  db.prepare(`
    UPDATE vehicles SET tanggal_pajak = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(tanggal_pajak_baru, vehicle.id);

  db.prepare(`
    INSERT INTO payment_history (vehicle_id, nopol_snapshot, tanggal_pajak_lama, tanggal_pajak_baru, tanggal_bayar, dibayar_oleh_user_id, catatan)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(vehicle.id, vehicle.nopol, vehicle.tanggal_pajak, tanggal_pajak_baru, tanggal_bayar, req.user.id, catatan || null);

  db.prepare(`
    INSERT INTO notifications (vehicle_id, type, message, status) VALUES (?, ?, ?, ?)
  `).run(vehicle.id, 'pembayaran', `Pajak ${vehicle.nopol} ditandai SUDAH BAYAR pada ${tanggal_bayar}. Jatuh tempo ${vehicle.tanggal_pajak} -> ${tanggal_pajak_baru}.`, 'sent');

  res.json({
    message: `Pajak ${vehicle.nopol} ditandai sudah bayar. Jatuh tempo baru: ${tanggal_pajak_baru}.`,
    vehicle_id: vehicle.id,
    nopol: vehicle.nopol,
    tanggal_pajak_lama: vehicle.tanggal_pajak,
    tanggal_pajak_baru,
    tanggal_bayar
  });
});

router.get('/:id/payments', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  const rows = db.prepare(`
    SELECT h.*, u.nama as dibayar_oleh_nama
    FROM payment_history h
    LEFT JOIN users u ON h.dibayar_oleh_user_id = u.id
    WHERE h.vehicle_id = ?
    ORDER BY h.created_at DESC, h.id DESC
  `).all(req.params.id);

  res.json(rows);
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  db.prepare('UPDATE vehicles SET status_aktif = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ message: 'Kendaraan berhasil dihapus.' });
});

module.exports = router;
