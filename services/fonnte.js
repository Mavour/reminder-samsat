const fetch = require('node-fetch');
const { enrichVehicle } = require('./gantiPlat');

const FONNTE_API = 'https://api.fonnte.com/send';

async function sendWhatsApp(phone, message) {
  const token = process.env.FONNTE_TOKEN;

  if (!token || token === 'your_fonnte_token_here') {
    console.log('[FONNTE] Token belum dikonfigurasi. Pesan tidak terkirim.');
    return { success: false, error: 'Token Fonnte belum dikonfigurasi' };
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const target = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');

  const body = new URLSearchParams({
    target: target,
    message: message,
    typing: 'true'
  });

  try {
    const response = await fetch(FONNTE_API, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { raw: await response.text() };
    }

    if (data.status === true || data.success === true) {
      console.log(`[FONNTE] Pesan terkirim ke ${target}`);
      return { success: true, data };
    } else {
      console.log(`[FONNTE] Gagal kirim ke ${target}:`, JSON.stringify(data));
      const raw = data.detail || data.reason || data.error || data.message;
      return {
        success: false,
        error: raw ? `Fonnte: ${raw}` : `Gagal mengirim pesan (${JSON.stringify(data)})`
      };
    }
  } catch (err) {
    console.error(`[FONNTE] Error kirim ke ${target}:`, err.message);
    return { success: false, error: err.message };
  }
}

function normalizePhone(phone) {
  const clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('62')) return clean;
  return '62' + clean.replace(/^0/, '');
}

async function sendWhatsAppBroadcast(phones, message) {
  const token = process.env.FONNTE_TOKEN;

  if (!token || token === 'your_fonnte_token_here') {
    console.log('[FONNTE] Token belum dikonfigurasi. Pesan tidak terkirim.');
    return { success: false, error: 'Token Fonnte belum dikonfigurasi' };
  }

  const validPhones = phones
    .map(normalizePhone)
    .filter(p => p.length >= 10 && p.length <= 15);

  if (validPhones.length === 0) {
    return { success: false, error: 'Tidak ada nomor HP penerima yang valid.' };
  }

  const target = validPhones.join(',');

  const body = new URLSearchParams({
    target: target,
    message: message,
    typing: 'true',
    delay: '2'
  });

  try {
    const response = await fetch(FONNTE_API, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { raw: await response.text() };
    }

    if (data.status === true || data.success === true) {
      console.log(`[FONNTE] Broadcast terkirim ke ${validPhones.length} nomor (${target})`);
      return { success: true, data, phones: validPhones };
    } else {
      console.log(`[FONNTE] Broadcast gagal:`, JSON.stringify(data));
      const raw = data.detail || data.reason || data.error || data.message;
      return {
        success: false,
        error: raw ? `Fonnte: ${raw}` : `Gagal mengirim pesan broadcast (${JSON.stringify(data)})`
      };
    }
  } catch (err) {
    console.error('[FONNTE] Error broadcast:', err.message);
    return { success: false, error: err.message };
  }
}

function formatTanggalIndo(dateStr) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const date = new Date(dateStr);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

function buildReminderMessage(vehicle, daysRemaining, kantorNama, isLast) {
  const action = isLast
    ? 'Dimohon untuk segera mengurus pembayaran guna menghindari denda.'
    : 'Mohon untuk dapat segera diproses pembayarannya.';

  const kantor = kantorNama || process.env.KANTOR_NAMA || 'Bagian Perlengkapan Kejaksaan Negeri Badung';

  const enriched = enrichVehicle(vehicle, new Date().getFullYear());

  const estLines = [
    `▪️ PKB : ${formatRupiah(vehicle.estimasi_pkb)}`,
    `▪️ Opsen PKB : ${formatRupiah(vehicle.estimasi_opsen_pkb || 0)}`,
    `▪️ SWDKLLJ : ${formatRupiah(vehicle.estimasi_swdkllj)}`
  ];

  if (enriched.biaya_ganti_plat > 0) {
    estLines.push(`▪️ Ganti Plat : ${formatRupiah(enriched.biaya_ganti_plat)}`);
  }

  estLines.push(`▪️ *Total* : *${formatRupiah(enriched.total_estimasi_lengkap)}*`);

  return `🚗 *PENGINGAT PAJAK KENDARAAN DINAS*

Yth. Bapak/Ibu,

Dengan hormat, kami mengingatkan bahwa pajak kendaraan dinas berikut akan jatuh tempo dalam *${daysRemaining} hari*:

🚗 Nopol : *${vehicle.nopol}*
🚘 Jenis : *${vehicle.jenis_kendaraan}*
🏷️ Merk/Tipe : *${vehicle.merk || '-'}*
🗓️ Tahun : *${vehicle.tahun || '-'}*
🎨 Warna : *${vehicle.warna || '-'}*
⏰ Jatuh Tempo : *${formatTanggalIndo(vehicle.tanggal_pajak)}*

💰 *Estimasi Biaya:*
${estLines.join('\n')}

${enriched.biaya_ganti_plat > 0 ? '🪪 *Termasuk biaya penggantian plat nomor* (tahun ganti plat).\n\n' : ''}⚠️ *${action}*

Terima kasih atas perhatian dan kerjasamanya.
Salam,
*${kantor}*`;
}

function buildSummaryReminderMessage(vehicles, daysRemaining, kantorNama, isLast) {
  const action = isLast
    ? 'Dimohon untuk segera mengurus pembayaran guna menghindari denda.'
    : 'Mohon untuk dapat segera diproses pembayarannya.';

  const kantor = kantorNama || process.env.KANTOR_NAMA || 'Bagian Perlengkapan Kejaksaan Negeri Badung';
  const currentYear = new Date().getFullYear();

  const jatuhTempo = vehicles.length > 0 ? formatTanggalIndo(vehicles[0].tanggal_pajak) : '-';
  const adaGantiPlat = vehicles.some(v => enrichVehicle(v, currentYear).biaya_ganti_plat > 0);

  let grandTotal = 0;

  const blocks = vehicles.map((vehicle, idx) => {
    const enriched = enrichVehicle(vehicle, currentYear);
    grandTotal += enriched.total_estimasi_lengkap;

    const rincian = [
      `PKB ${formatRupiah(vehicle.estimasi_pkb)}`,
      `Opsen ${formatRupiah(vehicle.estimasi_opsen_pkb || 0)}`,
      `SWDKLLJ ${formatRupiah(vehicle.estimasi_swdkllj)}`
    ];
    if (enriched.biaya_ganti_plat > 0) {
      rincian.push(`Ganti Plat ${formatRupiah(enriched.biaya_ganti_plat)}`);
    }

    const platNote = enriched.biaya_ganti_plat > 0 ? ' 🪪(termasuk ganti plat)' : '';

    return `${idx + 1}. Nopol : *${vehicle.nopol}*${platNote}\n` +
      `   Jenis : ${vehicle.jenis_kendaraan} | ${vehicle.merk || '-'} | ${vehicle.tahun || '-'} | ${vehicle.warna || '-'}\n` +
      `   Pajak : *${formatRupiah(enriched.total_estimasi_lengkap)}* (${rincian.join(' + ')})`;
  });

  return `🚗 *PENGINGAT PAJAK KENDARAAN DINAS (${vehicles.length} KENDARAAN)*\n` +
    `\n` +
    `Yth. Bapak/Ibu,\n` +
    `\n` +
    `Dengan hormat, kami mengingatkan bahwa *${vehicles.length} kendaraan dinas* berikut akan jatuh tempo dalam *${daysRemaining} hari* (⏰ ${jatuhTempo}):\n` +
    `\n` +
    `${blocks.join('\n\n')}\n` +
    `\n` +
    `💰 *TOTAL KESELURUHAN (${vehicles.length} kendaraan) : *${formatRupiah(grandTotal)}**\n` +
    `\n` +
    `${adaGantiPlat ? '🪪 *Sudah termasuk biaya penggantian plat nomor* untuk kendaraan yang jatuh tempo ganti plat tahun ini.\n\n' : ''}⚠️ *${action}*\n` +
    `\n` +
    `Terima kasih atas perhatian dan kerjasamanya.\n` +
    `Salam,\n` +
    `*${kantor}*`;
}

module.exports = { sendWhatsApp, sendWhatsAppBroadcast, buildReminderMessage, buildSummaryReminderMessage, formatTanggalIndo, formatRupiah };
