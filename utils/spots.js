const db = require("../db");

const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Retorna os rotative_days efetivos para uma mesa em uma data específica.
 * Se houver config pendente (rotative_days_next) e a data >= effective_from, usa a pendente.
 */
function getEffectiveRotDays(desk, date) {
  if (desk.rotative_days_next && desk.rotative_days_next_from && date >= desk.rotative_days_next_from) {
    try { return JSON.parse(desk.rotative_days_next); } catch { return []; }
  }
  try { return JSON.parse(desk.rotative_days || "[]"); } catch { return []; }
}

/**
 * Retorna donos de mesa com presença automática na data.
 * Presença automática ocorre quando a mesa do dono NÃO está no pool rotativo nesse dia.
 */
function getAutoPresences(date) {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6) return [];
  const dowCode = DOW_NAMES[dow];

  const desks = db.prepare(`
    SELECT d.id, d.type, d.rotative_days, d.rotative_days_next, d.rotative_days_next_from,
           u.id AS user_id, u.name, u.email, u.company, d.name AS desk_name
    FROM desks d
    JOIN users u ON u.id = d.owner_id
    WHERE d.is_active = 1 AND d.owner_id IS NOT NULL
    ORDER BY u.name ASC
  `).all();

  return desks.filter(d => {
    if (d.type === "fixed") return true;
    const rotDays = getEffectiveRotDays(d, date);
    return rotDays.length === 0 || !rotDays.includes(dowCode);
  }).map(d => ({
    user_id: d.user_id,
    name: d.name,
    email: d.email,
    company: d.company,
    desk_name: d.desk_name,
  }));
}

/**
 * Retorna as vagas disponíveis para uma data.
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

  // Mesas rotativas disponíveis no pool para esta data (usando config efetiva)
  const allRotative = db.prepare(`
    SELECT id, rotative_days, rotative_days_next, rotative_days_next_from
    FROM desks WHERE type = 'rotative' AND is_active = 1
  `).all();

  const rotativeCount = allRotative.filter(d => {
    const days = getEffectiveRotDays(d, date);
    return days.length === 0 || days.includes(dayName);
  }).length;

  const totalSpots = adminCapacity !== null ? Math.min(adminCapacity, rotativeCount) : rotativeCount;

  const activeBookings = db
    .prepare("SELECT COUNT(*) AS cnt FROM spot_bookings WHERE date = ? AND status = 'confirmed'")
    .get(date).cnt;

  const autoPresences = getAutoPresences(date).length;

  return {
    date,
    day_name: dayName,
    admin_capacity: adminCapacity,
    rotative_desks: rotativeCount,
    total_spots: totalSpots,
    active_bookings: activeBookings + autoPresences,
    auto_presences: autoPresences,
    available: Math.max(0, totalSpots - activeBookings),
  };
}

module.exports = { getAvailableSpots, getAutoPresences, getEffectiveRotDays, DOW_NAMES };
