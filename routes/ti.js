const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { sendBookingCancellation } = require("../services/email");

function tiMiddleware(req, res, next) {
  const row = db.prepare("SELECT is_ti, is_admin FROM users WHERE id = ?").get(req.user.id);
  if (!row?.is_ti && !row?.is_admin) return res.status(403).json({ error: "Acesso restrito à equipe TI" });
  next();
}

// Retorna Seg-Sex da semana contendo a data fornecida
function getWeekBounds(date) {
  const ref = new Date(date + "T12:00:00Z");
  const diffToMon = ref.getUTCDay() === 0 ? -6 : 1 - ref.getUTCDay();
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() + diffToMon);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });
  return days;
}

// Cancela reserva de mesa do usuário para uma data, se existir
function cancelBookingForDate(userId, date) {
  const booking = db.prepare(`
    SELECT b.*, u.name AS user_name, u.email AS user_email, d.name AS desk_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
    WHERE b.user_id = ? AND b.date = ?
  `).get(userId, date);

  if (!booking) return false;
  db.prepare("DELETE FROM bookings WHERE id = ?").run(booking.id);
  sendBookingCancellation({
    to: booking.user_email,
    name: booking.user_name,
    deskName: booking.desk_name,
    date: booking.date,
  });
  return true;
}

// Retorna programação da semana (membros TI + admins podem ver)
router.get("/schedule", authMiddleware, tiMiddleware, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: "Parâmetro week obrigatório (YYYY-MM-DD)" });
  }

  const days = getWeekBounds(week);

  const members = db
    .prepare("SELECT id, name FROM users WHERE is_ti = 1 ORDER BY name ASC")
    .all();

  const schedules = db
    .prepare("SELECT user_id, date, location FROM ti_schedules WHERE date >= ? AND date <= ?")
    .all(days[0], days[4]);

  const bookings = db.prepare(`
    SELECT user_id, date FROM bookings
    WHERE user_id IN (SELECT id FROM users WHERE is_ti = 1)
    AND date >= ? AND date <= ?
  `).all(days[0], days[4]);

  const map = {};
  schedules.forEach(({ user_id, date, location }) => {
    if (!map[user_id]) map[user_id] = {};
    map[user_id][date] = location;
  });

  const bookingMap = {};
  bookings.forEach(({ user_id, date }) => {
    if (!bookingMap[user_id]) bookingMap[user_id] = new Set();
    bookingMap[user_id].add(date);
  });

  res.json({
    days,
    members: members.map((m) => ({
      ...m,
      schedule: map[m.id] || {},
      bookedDates: bookingMap[m.id] ? [...bookingMap[m.id]] : [],
    })),
  });
});

// Declarar ou atualizar localização de um dia
router.post("/schedule", authMiddleware, tiMiddleware, (req, res) => {
  const { date, location } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Data inválida" });
  }
  if (!["home", "sp", "itaqua"].includes(location)) {
    return res.status(400).json({ error: "Localização inválida" });
  }

  // Limite de 2 home offices por semana
  if (location === "home") {
    const days = getWeekBounds(date);
    const existing = db.prepare("SELECT location FROM ti_schedules WHERE user_id = ? AND date = ?")
      .get(req.user.id, date);
    const homeCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM ti_schedules WHERE user_id = ? AND date >= ? AND date <= ? AND location = 'home'"
    ).get(req.user.id, days[0], days[4]).cnt;
    // Se já está marcado como home neste dia, não conta como novo
    const effectiveCount = existing?.location === "home" ? homeCount - 1 : homeCount;
    if (effectiveCount >= 2) {
      return res.status(409).json({ error: "Limite de 2 dias de home office por semana atingido" });
    }
  }

  db.prepare(`
    INSERT INTO ti_schedules (user_id, date, location)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET location = excluded.location
  `).run(req.user.id, date, location);

  let bookingCancelled = false;
  if (location === "home" || location === "itaqua") {
    bookingCancelled = cancelBookingForDate(req.user.id, date);
  }

  let hasBooking = false;
  if (location === "sp") {
    hasBooking = !!db.prepare("SELECT id FROM bookings WHERE user_id = ? AND date = ?")
      .get(req.user.id, date);
  }

  res.json({ ok: true, date, location, bookingCancelled, hasBooking });
});

// Remover declaração de um dia
router.delete("/schedule/:date", authMiddleware, tiMiddleware, (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Data inválida" });
  }

  db.prepare("DELETE FROM ti_schedules WHERE user_id = ? AND date = ?").run(req.user.id, date);
  const bookingCancelled = cancelBookingForDate(req.user.id, date);
  res.json({ ok: true, bookingCancelled });
});

// Exportar programação TI em CSV (admin)
router.get("/export", authMiddleware, adminMiddleware, (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT t.date, u.name AS user_name, t.location
    FROM ti_schedules t
    JOIN users u ON t.user_id = u.id
  `;
  const params = [];
  const conditions = [];
  if (from) { conditions.push("t.date >= ?"); params.push(from); }
  if (to)   { conditions.push("t.date <= ?"); params.push(to); }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY t.date ASC, u.name ASC";

  const rows = db.prepare(query).all(...params);

  const locationLabel = { home: "Home Office", sp: "Escritório SP", itaqua: "Itaquá" };
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const csv = [
    ["Data", "Membro", "Localização"].map(escape).join(","),
    ...rows.map((r) =>
      [r.date, r.user_name, locationLabel[r.location] || r.location].map(escape).join(",")
    ),
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="programacao-ti.csv"');
  res.send("\uFEFF" + csv);
});

module.exports = router;
