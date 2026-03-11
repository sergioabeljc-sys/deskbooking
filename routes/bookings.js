const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Reservas por data
router.get("/", authMiddleware, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Data obrigatória" });

  const bookings = db.prepare(`
    SELECT b.id, b.user_id, b.desk_id, b.date,
           u.name AS user_name, u.email AS user_email,
           d.name AS desk_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
    WHERE b.date = ?
  `).all(date);
  res.json(bookings);
});

// Minhas reservas futuras
router.get("/mine", authMiddleware, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id, b.desk_id, b.date, d.name AS desk_name
    FROM bookings b
    JOIN desks d ON b.desk_id = d.id
    WHERE b.user_id = ? AND b.date >= date('now')
    ORDER BY b.date ASC
  `).all(req.user.id);
  res.json(bookings);
});

// Todas as reservas (admin)
router.get("/all", authMiddleware, adminMiddleware, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id, b.user_id, b.desk_id, b.date, b.created_at,
           u.name AS user_name, d.name AS desk_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
    ORDER BY b.date DESC, b.created_at DESC
    LIMIT 200
  `).all();
  res.json(bookings);
});

// Criar reserva
router.post("/", authMiddleware, (req, res) => {
  const { desk_id, date } = req.body;
  if (!desk_id || !date) return res.status(400).json({ error: "Mesa e data são obrigatórios" });

  const today = new Date().toISOString().split("T")[0];
  if (date < today) return res.status(400).json({ error: "Não é possível reservar para datas passadas" });

  const desk = db.prepare("SELECT * FROM desks WHERE id = ? AND is_active = 1").get(desk_id);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada ou inativa" });

  // Verifica se usuário já tem reserva nesta data
  const myBooking = db.prepare("SELECT id FROM bookings WHERE user_id = ? AND date = ?").get(req.user.id, date);
  if (myBooking) return res.status(409).json({ error: "Você já tem uma reserva nesta data" });

  try {
    const result = db
      .prepare("INSERT INTO bookings (user_id, desk_id, date) VALUES (?, ?, ?)")
      .run(req.user.id, desk_id, date);

    const booking = db.prepare(`
      SELECT b.id, b.user_id, b.desk_id, b.date,
             u.name AS user_name, d.name AS desk_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN desks d ON b.desk_id = d.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.json(booking);
  } catch (e) {
    if (e.message.includes("UNIQUE"))
      return res.status(409).json({ error: "Mesa já reservada nesta data" });
    res.status(500).json({ error: "Erro interno" });
  }
});

// Cancelar reserva
router.delete("/:id", authMiddleware, (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) return res.status(404).json({ error: "Reserva não encontrada" });
  if (booking.user_id !== req.user.id && !req.user.is_admin)
    return res.status(403).json({ error: "Sem permissão para cancelar esta reserva" });

  db.prepare("DELETE FROM bookings WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
