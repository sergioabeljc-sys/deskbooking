const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { sendBookingCancellation } = require("../services/email");

function tiMiddleware(req, res, next) {
  const row = db.prepare("SELECT is_ti FROM users WHERE id = ?").get(req.user.id);
  if (!row?.is_ti) return res.status(403).json({ error: "Acesso restrito à equipe TI" });
  next();
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

// Retorna programação da semana (todos os membros TI)
router.get("/schedule", authMiddleware, tiMiddleware, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: "Parâmetro week obrigatório (YYYY-MM-DD)" });
  }

  const ref = new Date(week + "T12:00:00Z");
  const dow = ref.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() + diffToMon);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });

  const members = db
    .prepare("SELECT id, name FROM users WHERE is_ti = 1 ORDER BY name ASC")
    .all();

  const schedules = db
    .prepare("SELECT user_id, date, location FROM ti_schedules WHERE date >= ? AND date <= ?")
    .all(days[0], days[4]);

  // Incluir quais dias cada membro tem reserva de mesa
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

  db.prepare(`
    INSERT INTO ti_schedules (user_id, date, location)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET location = excluded.location
  `).run(req.user.id, date, location);

  // Home ou Itaquá: cancela reserva de mesa se existir
  let bookingCancelled = false;
  if (location === "home" || location === "itaqua") {
    bookingCancelled = cancelBookingForDate(req.user.id, date);
  }

  // SP: informa se o usuário já tem reserva (para o frontend decidir o que fazer)
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

module.exports = router;
