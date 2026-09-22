const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendWhatsAppBroadcast, buildReminderMessage } = require('../services/fonnte');
const { checkAndSendReminders } = require('../services/scheduler');
const { computeGantiPlat } = require('../services/gantiPlat');
const { witaNow, diffDaysFromToday } = require('../services/wita');

const router = express.Router();

function buildReminderData(vehicle) {
  const db = getDb();

  const recipients = db.prepare(`
    SELECT nama, no_hp FROM recipients
    WHERE status_aktif = 1
  `).all();
  const phones = recipients.map(r => r.no_hp);

  const diffDays = diffDaysFromToday(vehicle.tanggal_pajak);

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

  return { message, recipients, phones, days, isLast, diffDays };
}

function getVehicleOr404(req, res) {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.vehicleId);

  if (!vehicle) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
    return null;
  }

  return vehicle;
}

router.post('/preview/:vehicleId', authMiddleware, (req, res) => {
  const vehicle = getVehicleOr404(req, res);
  if (!vehicle) return;

  const data = buildReminderData(vehicle);

  res.json({
    message: data.message,
    recipients: data.recipients,
    phones: data.phones,
    days: data.days,
    isLast: data.isLast,
    diffDays: data.diffDays,
    noRecipients: data.phones.length === 0
  });
});

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const notifs = db.prepare(`
    SELECT n.*, v.nopol, v.jenis_kendaraan, v.merk, v.tahun
    FROM notifications n
    LEFT JOIN vehicles v ON n.vehicle_id = v.id
    ORDER BY n.sent_at DESC
    LIMIT 100
  `).all();

  const currentYear = witaNow().getFullYear();
  notifs = notifs.map(n => ({ ...n, ...computeGantiPlat(n.tahun, currentYear) }));

  res.json(notifs);
});

router.post('/send/:vehicleId', authMiddleware, async (req, res) => {
  const db = getDb();
  const vehicle = getVehicleOr404(req, res);
  if (!vehicle) return;

  const data = buildReminderData(vehicle);

  if (data.phones.length === 0) {
    return res.status(400).json({ error: 'Tidak ada nomor HP penerima. Tambahkan penerima di menu Penerima.' });
  }

  const result = await sendWhatsAppBroadcast(data.phones, data.message);

  db.prepare(`INSERT INTO notifications (vehicle_id, type, message, status, error_msg) VALUES (?, ?, ?, ?, ?)`)
    .run(vehicle.id, 'whatsapp_manual', data.message, result.success ? 'sent' : 'failed', result.error || null);

  if (result.success) {
    res.json({ message: `Pesan berhasil dikirim ke ${data.phones.length} penerima.`, phones: data.phones, count: data.phones.length });
  } else {
    res.status(500).json({ error: 'Gagal mengirim pesan.', detail: result.error });
  }
});

router.post('/test-cron', authMiddleware, adminOnly, async (req, res) => {
  await checkAndSendReminders();
  res.json({ message: 'Cron job dijalankan secara manual.' });
});

module.exports = router;
