const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function getReminderDays() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'reminder_days'").get();
  if (row && row.value) {
    const days = row.value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x) && x > 0);
    if (days.length > 0) return [...new Set(days)].sort((a, b) => a - b);
  }
  return [3, 7];
}

function getWhatsAppDelay() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_delay'").get();
  const v = parseInt(row && row.value, 10);
  return (!isNaN(v) && v >= 0 && v <= 120) ? v : 15;
}

router.get('/reminder', authMiddleware, (req, res) => {
  const days = getReminderDays();
  const delay = getWhatsAppDelay();
  res.json({
    days,
    delay,
    formatted: days.join(', '),
    message: `Reminder dikirim otomatis pada H-${days.join(', H-')} sebelum jatuh tempo (setiap jam 08:00 WITA), jeda ${delay} detik antar kendaraan.`
  });
});

router.put('/reminder', authMiddleware, (req, res) => {
  const { days, delay } = req.body;

  if (!Array.isArray(days) || days.length === 0) {
    return res.status(400).json({ error: 'Reminder days wajib berupa array minimal 1 angka.' });
  }

  const valid = days.map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x > 0 && x <= 365);
  if (valid.length === 0) {
    return res.status(400).json({ error: 'Angka hari tidak valid (1-365).' });
  }

  const unique = [...new Set(valid)].sort((a, b) => a - b);
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('reminder_days', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(unique.join(','));

  let savedDelay = getWhatsAppDelay();
  if (delay !== undefined && delay !== null && delay !== '') {
    const v = parseInt(delay, 10);
    if (isNaN(v) || v < 0 || v > 120) {
      return res.status(400).json({ error: 'Jeda antar kendaraan harus angka 0-120 detik.' });
    }
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('whatsapp_delay', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(String(v));
    savedDelay = v;
  }

  res.json({
    message: 'Pengaturan reminder berhasil disimpan.',
    days: unique,
    formatted: unique.join(', '),
    delay: savedDelay
  });
});

router.get('/whatsapp-delay', authMiddleware, (req, res) => {
  const delay = getWhatsAppDelay();
  res.json({ delay, message: `Jeda antar kendaraan saat kirim otomatis: ${delay} detik.` });
});

router.get('/fonnte', authMiddleware, (req, res) => {
  const token = process.env.FONNTE_TOKEN;
  const configured = !!(token && token !== 'your_fonnte_token_here');

  res.json({
    configured,
    message: configured ? 'Token Fonnte sudah dikonfigurasi.' : 'Token Fonnte belum dikonfigurasi.'
  });
});

router.get('/google-calendar', authMiddleware, (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const configured = !!(clientId && clientId !== 'your_google_client_id');

  res.json({
    configured,
    message: configured ? 'Google Calendar sudah dikonfigurasi.' : 'Google Calendar belum dikonfigurasi.'
  });
});

module.exports = router;
