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

module.exports = { computeGantiPlat };