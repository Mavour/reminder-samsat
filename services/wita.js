const WITA_OFFSET_HOURS = 8;

function witaNow() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + WITA_OFFSET_HOURS * 3600000);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function witaDateString(offsetDays = 0) {
  const d = witaNow();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diffDaysFromToday(dateStr) {
  const parts = String(dateStr).split('T')[0].split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return NaN;

  const today = witaNow();
  const targetUTC = Date.UTC(y, m - 1, d);
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUTC - todayUTC) / 86400000);
}

module.exports = { witaNow, witaDateString, diffDaysFromToday };