const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { enrichVehicle } = require('../services/gantiPlat');
const { witaNow, witaDateString, diffDaysFromToday } = require('../services/wita');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  let vehicles;

  if (req.user.role === 'admin') {
    vehicles = db.prepare(`
      SELECT v.*, u.nama as user_nama
      FROM vehicles v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.status_aktif = 1
      ORDER BY v.tanggal_pajak ASC
    `).all();
  } else {
    vehicles = db.prepare(`
      SELECT v.*, u.nama as user_nama
      FROM vehicles v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.user_id = ? AND v.status_aktif = 1
      ORDER BY v.tanggal_pajak ASC
    `).all(req.user.id);
  }

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

  let whereClause = req.user.role === 'admin' ? '' : 'AND v.user_id = ' + req.user.id;

  const total = db.prepare(`SELECT COUNT(*) as count FROM vehicles v WHERE v.status_aktif = 1 ${whereClause}`).get().count;
  const expiring = db.prepare(`SELECT COUNT(*) as count FROM vehicles v WHERE v.status_aktif = 1 AND v.tanggal_pajak >= ? AND v.tanggal_pajak <= ? ${whereClause}`).get(todayStr, in30Str).count;
  const expired = db.prepare(`SELECT COUNT(*) as count FROM vehicles v WHERE v.status_aktif = 1 AND v.tanggal_pajak < ? ${whereClause}`).get(todayStr).count;

  const currentYear = witaNow().getFullYear();
  const in30Vehicles = db.prepare(`SELECT v.* FROM vehicles v WHERE v.status_aktif = 1 AND v.tanggal_pajak >= ? AND v.tanggal_pajak <= ? ${whereClause}`).all(todayStr, in30Str);
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
  const vehicle = db.prepare(`
    SELECT v.*, u.nama as user_nama
    FROM vehicles v
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
  `).get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  if (req.user.role !== 'admin' && vehicle.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  res.json(enrichVehicle(vehicle, witaNow().getFullYear()));
});

router.post('/', authMiddleware, (req, res) => {
  const {
    nopol, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, estimasi_pkb, estimasi_swdkllj, estimasi_biaya_lain,
    catatan, user_id
  } = req.body;

  if (!nopol || !jenis_kendaraan || !tanggal_pajak) {
    return res.status(400).json({ error: 'Nopol, jenis kendaraan, dan tanggal pajak wajib diisi.' });
  }

  const pkb = parseFloat(estimasi_pkb) || 0;
  const swdkllj = parseFloat(estimasi_swdkllj) || 0;
  const biayaLain = parseFloat(estimasi_biaya_lain) || 0;
  const total = pkb + swdkllj + biayaLain;
  const assignedUserId = req.user.role === 'admin' ? (user_id || req.user.id) : req.user.id;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO vehicles (user_id, nopol, jenis_kendaraan, merk, tahun, warna, tanggal_pajak, estimasi_pkb, estimasi_swdkllj, estimasi_biaya_lain, total_estimasi, catatan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assignedUserId, nopol.toUpperCase(), jenis_kendaraan, merk || null, tahun || null, warna || null, tanggal_pajak, pkb, swdkllj, biayaLain, total, catatan || null);

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

  if (req.user.role !== 'admin' && vehicle.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  const {
    nopol, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, estimasi_pkb, estimasi_swdkllj, estimasi_biaya_lain,
    catatan, status_aktif, user_id
  } = req.body;

  const pkb = parseFloat(estimasi_pkb) || vehicle.estimasi_pkb;
  const swdkllj = parseFloat(estimasi_swdkllj) || vehicle.estimasi_swdkllj;
  const biayaLain = parseFloat(estimasi_biaya_lain) || vehicle.estimasi_biaya_lain;
  const total = pkb + swdkllj + biayaLain;

  db.prepare(`
    UPDATE vehicles SET
      nopol = COALESCE(?, nopol),
      jenis_kendaraan = COALESCE(?, jenis_kendaraan),
      merk = COALESCE(?, merk),
      tahun = COALESCE(?, tahun),
      warna = COALESCE(?, warna),
      tanggal_pajak = COALESCE(?, tanggal_pajak),
      estimasi_pkb = ?,
      estimasi_swdkllj = ?,
      estimasi_biaya_lain = ?,
      total_estimasi = ?,
      catatan = COALESCE(?, catatan),
      status_aktif = COALESCE(?, status_aktif),
      user_id = COALESCE(?, user_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nopol ? nopol.toUpperCase() : null, jenis_kendaraan, merk, tahun, warna,
    tanggal_pajak, pkb, swdkllj, biayaLain, total,
    catatan, status_aktif, user_id, req.params.id
  );

  res.json({ message: 'Data kendaraan berhasil diperbarui.' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  if (req.user.role !== 'admin' && vehicle.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  db.prepare('UPDATE vehicles SET status_aktif = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ message: 'Kendaraan berhasil dihapus.' });
});

module.exports = router;
