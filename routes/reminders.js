const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendWhatsAppBroadcast, buildReminderMessage } = require('../services/fonnte');
const { checkAndSendReminders } = require('../services/scheduler');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  let notifs;

  if (req.user.role === 'admin') {
    notifs = db.prepare(`
      SELECT n.*, v.nopol, v.jenis_kendaraan, v.merk
      FROM notifications n
      LEFT JOIN vehicles v ON n.vehicle_id = v.id
      ORDER BY n.sent_at DESC
      LIMIT 100
    `).all();
  } else {
    notifs = db.prepare(`
      SELECT n.*, v.nopol, v.jenis_kendaraan, v.merk
      FROM notifications n
      LEFT JOIN vehicles v ON n.vehicle_id = v.id
      WHERE v.user_id = ?
      ORDER BY n.sent_at DESC
      LIMIT 100
    `).all(req.user.id);
  }

  res.json(notifs);
});

router.post('/send/:vehicleId', authMiddleware, async (req, res) => {
  const db = getDb();
  const vehicle = db.prepare(`
    SELECT v.*, u.no_hp as user_hp
    FROM vehicles v
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
  `).get(req.params.vehicleId);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  if (req.user.role !== 'admin' && vehicle.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  const recipients = db.prepare(`
    SELECT nama, no_hp FROM recipients
    WHERE status_aktif = 1
  `).all();
  const phones = recipients.map(r => r.no_hp);

  if (vehicle.no_hp_penerima) {
    phones.push(vehicle.no_hp_penerima);
  }

  if (phones.length === 0) {
    return res.status(400).json({ error: 'Tidak ada nomor HP penerima. Tambahkan penerima di menu Penerima.' });
  }

  const pajakDate = new Date(vehicle.tanggal_pajak);
  const now = new Date();
  const diffDays = Math.ceil((pajakDate - now) / (1000 * 60 * 60 * 24));

  const row = db.prepare("SELECT value FROM settings WHERE key = 'reminder_days'").get();
  let configDays = row && row.value
    ? row.value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x) && x > 0)
    : [3, 7];
  configDays = [...new Set(configDays)].sort((a, b) => a - b);

  const lastDay = Math.min(...configDays);
  const candidates = configDays.filter(d => d <= diffDays);
  const days = candidates.length > 0 ? candidates[candidates.length - 1] : lastDay;
  const isLast = days === lastDay;

  const message = buildReminderMessage(vehicle, days, process.env.KANTOR_NAMA, isLast);
  const result = await sendWhatsAppBroadcast(phones, message);

  db.prepare(`INSERT INTO notifications (vehicle_id, type, message, status, error_msg) VALUES (?, ?, ?, ?, ?)`)
    .run(vehicle.id, 'whatsapp_manual', message, result.success ? 'sent' : 'failed', result.error || null);

  if (result.success) {
    res.json({ message: `Pesan berhasil dikirim ke ${phones.length} nomor.`, phones });
  } else {
    res.status(500).json({ error: 'Gagal mengirim pesan.', detail: result.error });
  }
});

router.post('/test-cron', authMiddleware, adminOnly, async (req, res) => {
  await checkAndSendReminders();
  res.json({ message: 'Cron job dijalankan secara manual.' });
});

module.exports = router;
