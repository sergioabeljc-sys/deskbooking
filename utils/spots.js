const db = require("../db");

const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Retorna as vagas disponíveis para uma data.
 * Cálculo: MIN(admin_capacity, rotative_desks_for_dow) - confirmed_bookings
 * specific_date em spot_capacity tem prioridade sobre day_of_week.
 */
function getAvailableSpots(date) {
  const dow = db.prepare("SELECT strftime('%w', ?) AS dow").get(date).dow;
  const dayName = DOW_NAMES[parseInt(dow)];

  // Capacidade admin: specific_date > day_of_week
  const specificCap = db
    .prepare("SELECT capacity FROM spot_capacity WHERE specific_date = ? ORDER BY id DESC LIMIT 1")
    .get(date);
  const dowCap = db
    .prepare("SELECT capacity FROM spot_capacity WHERE day_of_week = ? ORDER BY id DESC LIMIT 1")
    .get(dayName);

  const adminCapacity = specificCap?.capacity ?? dowCap?.capacity ?? null;

  // Mesas rotativas disponíveis no dia
  const rotativeCount = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM desks
       WHERE type = 'rotative' AND EXISTS (
         SELECT 1 FROM json_each(rotative_days) WHERE value = ?
       )`
    )
    .get(dayName).cnt;

  const totalSpots =
    adminCapacity !== null ? Math.min(adminCapacity, rotativeCount) : rotativeCount;

  // Reservas confirmadas para a data
  const activeBookings = db
    .prepare("SELECT COUNT(*) AS cnt FROM spot_bookings WHERE date = ? AND status = 'confirmed'")
    .get(date).cnt;

  return {
    date,
    day_name: dayName,
    admin_capacity: adminCapacity,
    rotative_desks: rotativeCount,
    total_spots: totalSpots,
    active_bookings: activeBookings,
    available: Math.max(0, totalSpots - activeBookings),
  };
}

module.exports = { getAvailableSpots, DOW_NAMES };
