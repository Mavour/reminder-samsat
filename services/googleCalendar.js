const { google } = require('googleapis');
const { getDb } = require('../database/init');

let oauth2Client = null;

function getOAuth2Client() {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }
  return oauth2Client;
}

function getStoredTokens() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'google_tokens'").get();
  if (!row || !row.value) return null;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return null;
  }
}

function storeTokens(tokens) {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('google_tokens', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(tokens));
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/calendar'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

async function setCredentials(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  storeTokens(tokens);
  return tokens;
}

function loadStoredCredentials() {
  const oauth2Client = getOAuth2Client();
  const tokens = getStoredTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);
    return true;
  }
  return false;
}

function isConfigured() {
  return getStoredTokens() !== null;
}

async function createCalendarEvent(vehicle) {
  try {
    const oauth2Client = getOAuth2Client();
    const tokens = getStoredTokens();

    if (!tokens) {
      console.log('[GCalendar] Belum terotorisasi. Event tidak dibuat.');
      return null;
    }

    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const pajakDate = new Date(vehicle.tanggal_pajak);

    const event = {
      summary: `Pajak ${vehicle.nopol} Jatuh Tempo`,
      description: `Pajak kendaraan dinas ${vehicle.nopol} (${vehicle.jenis_kendaraan}) akan jatuh tempo.\nEstimasi biaya: Rp ${vehicle.total_estimasi.toLocaleString('id-ID')}`,
      start: {
        date: pajakDate.toISOString().split('T')[0],
        timeZone: 'Asia/Jakarta',
      },
      end: {
        date: new Date(pajakDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        timeZone: 'Asia/Jakarta',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 7 * 24 * 60 },
          { method: 'email', minutes: 3 * 24 * 60 },
          { method: 'popup', minutes: 1 * 24 * 60 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log(`[GCalendar] Event dibuat: ${response.data.htmlLink}`);
    return response.data.id;
  } catch (err) {
    console.error('[GCalendar] Error buat event:', err.message);
    return null;
  }
}

async function deleteCalendarEvent(eventId) {
  try {
    const oauth2Client = getOAuth2Client();
    const tokens = getStoredTokens();

    if (!tokens) {
      return;
    }

    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log(`[GCalendar] Event ${eventId} dihapus`);
  } catch (err) {
    console.error('[GCalendar] Error hapus event:', err.message);
  }
}

module.exports = { getAuthUrl, setCredentials, createCalendarEvent, deleteCalendarEvent, isConfigured, loadStoredCredentials };