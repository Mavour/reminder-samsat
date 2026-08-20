const cron = require('node-cron');
const { getDb } = require('../database/init');
const { sendWhatsAppBroadcast, buildReminderMessage } = require('./fonnte');
const { witaDateString } = require('./wita');

const DEFAULT_REMINDER_DAYS = [3, 7];
const DEFAULT_WHATSAPP_DELAY = 15;
const KANTOR_NAMA = process.env.KANTOR_NAMA || 'Bagian Perlengkapan Kejaksaan Negeri Badung';

function getReminderDays() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'reminder_days'").get();
  if (row && row.value) {
    const days = row.value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x) && x > 0);
    if (days.length > 0) return [...new Set(days)].sort((a, b) => a - b);
  }
  return DEFAULT_REMINDER_DAYS;
}

function getWhatsAppDelay() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_delay'").get();
  const v = parseInt(row && row.value, 10);
  return (!isNaN(v) && v >= 0 && v <= 120) ? v : DEFAULT_WHATSAPP_DELAY;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getActiveRecipients() {
  const db = getDb();
  return db.prepare(`
    SELECT nama, no_hp FROM recipients
    WHERE status_aktif = 1
  `).all();
}

async function checkAndSendReminders() {
  console.log('[Scheduler] Menjalankan pengecekan reminder...');

  const db = getDb();
  const allDays = getReminderDays();
  const lastDay = Math.min(...allDays);
  const todayStr = witaDateString();

  for (const days of allDays) {
    const dateStr = witaDateString(days);

    const vehicles = db.prepare(`
      SELECT v.*, u.no_hp as user_hp
      FROM vehicles v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.status_aktif = 1
        AND v.tanggal_pajak = ?
    `).all(dateStr);

    const delaySec = getWhatsAppDelay();

    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i];
      const existingNotif = db.prepare(`
        SELECT id FROM notifications
        WHERE vehicle_id = ? AND type = 'whatsapp_h${days}' AND date(sent_at, '+8 hours') = ?
      `).get(vehicle.id, todayStr);

      if (existingNotif) {
        console.log(`[Scheduler] Reminder H-${days} untuk ${vehicle.nopol} sudah terkirim hari ini.`);
        continue;
      }

      const recipients = getActiveRecipients();
      const phones = recipients.map(r => r.no_hp);

      if (phones.length === 0) {
        console.log(`[Scheduler] Tidak ada penerima untuk ${vehicle.nopol}. Skip.`);
        db.prepare(`INSERT INTO notifications (vehicle_id, type, message, status, error_msg) VALUES (?, ?, ?, ?, ?)`)
          .run(vehicle.id, `whatsapp_h${days}`, '', 'failed', 'Tidak ada nomor HP penerima');
        continue;
      }

      const message = buildReminderMessage(vehicle, days, KANTOR_NAMA, days === lastDay);
      let result;
      try {
        result = await sendWhatsAppBroadcast(phones, message);
      } catch (err) {
        result = { success: false, error: err.message };
      }

      db.prepare(`INSERT INTO notifications (vehicle_id, type, message, status, error_msg) VALUES (?, ?, ?, ?, ?)`)
        .run(vehicle.id, `whatsapp_h${days}`, message, result.success ? 'sent' : 'failed', result.error || null);

      if (result.success) {
        console.log(`[Scheduler] Reminder H-${days} terkirim untuk ${vehicle.nopol} ke ${phones.length} nomor`);
      } else {
        console.log(`[Scheduler] Gagal kirim reminder H-${days} untuk ${vehicle.nopol}: ${result.error}`);
      }

      if (i < vehicles.length - 1 && delaySec > 0) {
        console.log(`[Scheduler] Jeda ${delaySec} detik sebelum kendaraan berikutnya...`);
        await sleep(delaySec * 1000);
      }
    }
  }

  console.log('[Scheduler] Pengecekan reminder selesai.');
}

function startScheduler() {
  console.log('[Scheduler] Scheduler dimulai. Cek setiap hari jam 08:00 WITA');

  cron.schedule('0 8 * * *', async () => {
    console.log(`[Scheduler] Running at ${new Date().toISOString()}`);
    await checkAndSendReminders();
  }, {
    timezone: 'Asia/Makassar'
  });
}

module.exports = { startScheduler, checkAndSendReminders };
