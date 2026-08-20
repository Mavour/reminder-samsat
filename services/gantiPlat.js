const BIAYA_GANTI_PLAT = { mobil: 300000, motor: 150000 };

function computeGantiPlat(tahun, currentYear) {
  const vehicleYear = parseInt(tahun, 10);
  if (isNaN(vehicleYear) || vehicleYear <= 0) {
    return { next_ganti_plat: null, ganti_plat_due_this_year: false };
  }

  let next_ganti_plat;
  if (currentYear <= vehicleYear) {
    next_ganti_plat = vehicleYear + 5;
  } else {
    next_ganti_plat = vehicleYear + 5 * Math.ceil((currentYear - vehicleYear + 1) / 5);
  }

  return {
    next_ganti_plat,
    ganti_plat_due_this_year: currentYear > vehicleYear && (currentYear - vehicleYear) % 5 === 0
  };
}

function computeBiayaGantiPlat(jenisKendaraan, gantiPlatDueThisYear) {
  if (!gantiPlatDueThisYear) return 0;
  const j = String(jenisKendaraan || '').toLowerCase();
  if (j.includes('motor')) return BIAYA_GANTI_PLAT.motor;
  if (j.includes('mobil')) return BIAYA_GANTI_PLAT.mobil;
  return 0;
}

function enrichVehicle(vehicle, currentYear) {
  const { next_ganti_plat, ganti_plat_due_this_year } = computeGantiPlat(vehicle.tahun, currentYear);
  const biayaGantiPlat = computeBiayaGantiPlat(vehicle.jenis_kendaraan, ganti_plat_due_this_year);
  const totalPajak = parseFloat(vehicle.total_estimasi) || 0;

  return {
    ...vehicle,
    next_ganti_plat,
    ganti_plat_due_this_year,
    biaya_ganti_plat: biayaGantiPlat,
    total_estimasi_lengkap: totalPajak + biayaGantiPlat
  };
}

module.exports = { computeGantiPlat, computeBiayaGantiPlat, enrichVehicle };