const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { getAuthUrl, setCredentials, createCalendarEvent, deleteCalendarEvent, isConfigured } = require('../services/googleCalendar');

const router = express.Router();

router.get('/auth', authMiddleware, (req, res) => {
  const url = getAuthUrl();
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code tidak ditemukan.');
  }

  try {
    const tokens = await setCredentials(code);
    console.log('[Calendar] OAuth2 berhasil. Token tersimpan.');
    res.redirect('/settings.html?calendar=connected');
  } catch (err) {
    console.error('[Calendar] OAuth error:', err.message);
    res.redirect('/settings.html?calendar=error');
  }
});

router.get('/status', authMiddleware, (req, res) => {
  res.json({ connected: isConfigured() });
});

router.post('/sync/:vehicleId', authMiddleware, async (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.vehicleId);

  if (!vehicle) {
    return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
  }

  try {
    const eventId = await createCalendarEvent(vehicle);

    if (eventId) {
      db.prepare('INSERT INTO calendar_events (vehicle_id, google_event_id) VALUES (?, ?)')
        .run(vehicle.id, eventId);
      res.json({ message: 'Event berhasil dibuat di Google Calendar.', eventId });
    } else {
      res.status(500).json({ error: 'Gagal membuat event. Pastikan sudah terotorisasi.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat event.', detail: err.message });
  }
});

router.delete('/sync/:vehicleId', authMiddleware, async (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM calendar_events WHERE vehicle_id = ?').get(req.params.vehicleId);

  if (event) {
    await deleteCalendarEvent(event.google_event_id);
    db.prepare('DELETE FROM calendar_events WHERE vehicle_id = ?').run(req.params.vehicleId);
  }

  res.json({ message: 'Event berhasil dihapus dari Google Calendar.' });
});

module.exports = router;