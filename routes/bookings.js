const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { sendBookingConfirmation, sendBookingCancellation } = require("../services/email");

// Exportar reservas CSV (admin) — deve vir antes de /:id para evitar conflito
router.get("/export", authMiddleware, adminMiddleware, (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT b.date, d.name AS desk_name, u.name AS user_name, u.email AS user_email, b.created_at
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
  `;
  const params = [];
  const conditions = [];
  if (from) { conditions.push("b.date >= ?"); params.push(from); }
  if (to)   { conditions.push("b.date <= ?"); params.push(to); }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY b.date DESC, b.created_at DESC";

  const bookings = db.prepare(query).all(...params);

  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const rows = [
    ["Data", "Mesa", "Usuário", "E-mail", "Criado em"].map(escape).join(","),
    ...bookings.map((b) =>
      [b.date, b.desk_name, b.user_name, b.user_email, b.created_at].map(escape).join(",")
    ),
  ];

  const csv = rows.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="reservas.csv"');
  res.send("\uFEFF" + csv); // BOM for Excel compatibility
});

// Stats de ocupação (admin)
router.get("/stats", authMiddleware, adminMiddleware, (req, res) => {
  const byDesk = db.prepare(`
    SELECT d.name AS desk_name, COUNT(*) AS total,
           GROUP_CONCAT(b.date) AS dates
    FROM bookings b
    JOIN desks d ON b.desk_id = d.id
    WHERE b.date >= date('now', '-30 days')
    GROUP BY b.desk_id
    ORDER BY total DESC
  `).all();

  // byDayOfWeek: 0=Sun,1=Mon,...,6=Sat — SQLite strftime('%w')
  const byDayOfWeek = db.prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) AS dow, COUNT(*) AS total
    FROM bookings
    WHERE date >= date('now', '-30 days')
    GROUP BY dow
    ORDER BY dow
  `).all();

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const byDayFormatted = byDayOfWeek.map((r) => ({
    day: dayNames[r.dow] || r.dow,
    dow: r.dow,
    total: r.total,
  }));

  const totalLast30 = db.prepare(`
    SELECT COUNT(*) AS cnt FROM bookings WHERE date >= date('now', '-30 days')
  `).get().cnt;

  const peakDesk = byDesk.length > 0 ? byDesk[0].desk_name : null;

  // Count active desks for occupancy rate
  const activeDeskCount = db.prepare("SELECT COUNT(*) AS cnt FROM desks WHERE is_active = 1").get().cnt;

  const byUser = db.prepare(`
    SELECT u.name AS user_name, COUNT(*) AS total
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    WHERE b.date >= date('now', '-30 days')
    GROUP BY b.user_id
    ORDER BY total DESC
    LIMIT 10
  `).all();

  res.json({
    byDesk: byDesk.map((r) => ({
      desk_name: r.desk_name,
      total: r.total,
      dates: r.dates ? r.dates.split(",") : [],
    })),
    byDayOfWeek: byDayFormatted,
    byUser,
    totalLast30,
    peakDesk,
    activeDeskCount,
  });
});

// Reservas por data
router.get("/", authMiddleware, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Data obrigatória" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD" });
  }

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

// Todas as reservas (admin) — com paginação
router.get("/all", authMiddleware, adminMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) AS cnt FROM bookings").get().cnt;
  const pages = Math.ceil(total / limit);

  const data = db.prepare(`
    SELECT b.id, b.user_id, b.desk_id, b.date, b.created_at,
           u.name AS user_name, d.name AS desk_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
    ORDER BY b.date DESC, b.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ data, total, page, pages });
});

// Criar reserva
router.post("/", authMiddleware, async (req, res) => {
  const { desk_id, date } = req.body;
  if (!desk_id || !date) return res.status(400).json({ error: "Mesa e data são obrigatórios" });

  const deskIdInt = parseInt(desk_id, 10);
  if (!deskIdInt || deskIdInt <= 0) {
    return res.status(400).json({ error: "Mesa inválida" });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD" });
  }
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return res.status(400).json({ error: "Data inválida" });
  }

  const today = new Date().toISOString().split("T")[0];
  if (date < today) return res.status(400).json({ error: "Não é possível reservar para datas passadas" });

  const desk = db.prepare("SELECT * FROM desks WHERE id = ? AND is_active = 1").get(deskIdInt);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada ou inativa" });

  // Verifica se usuário já tem reserva nesta data
  const myBooking = db.prepare("SELECT id FROM bookings WHERE user_id = ? AND date = ?").get(req.user.id, date);
  if (myBooking) return res.status(409).json({ error: "Você já tem uma reserva nesta data" });

  try {
    const result = db
      .prepare("INSERT INTO bookings (user_id, desk_id, date) VALUES (?, ?, ?)")
      .run(req.user.id, deskIdInt, date);

    const booking = db.prepare(`
      SELECT b.id, b.user_id, b.desk_id, b.date,
             u.name AS user_name, u.email AS user_email, d.name AS desk_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN desks d ON b.desk_id = d.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    // Send confirmation email (non-blocking)
    sendBookingConfirmation({
      to: booking.user_email,
      name: booking.user_name,
      deskName: booking.desk_name,
      date: booking.date,
    });

    res.json(booking);
  } catch (e) {
    if (e.message.includes("UNIQUE") && e.message.includes("desk_id")) {
      return res.status(409).json({ error: "Mesa já reservada nesta data" });
    }
    if (e.message.includes("UNIQUE") && e.message.includes("user_id")) {
      return res.status(409).json({ error: "Você já tem uma reserva nesta data" });
    }
    if (e.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "Conflito de reserva" });
    }
    res.status(500).json({ error: "Erro interno" });
  }
});

// Cancelar reserva
router.delete("/:id", authMiddleware, async (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, u.name AS user_name, u.email AS user_email, d.name AS desk_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN desks d ON b.desk_id = d.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!booking) return res.status(404).json({ error: "Reserva não encontrada" });
  if (booking.user_id !== req.user.id && !req.user.is_admin)
    return res.status(403).json({ error: "Sem permissão para cancelar esta reserva" });

  db.prepare("DELETE FROM bookings WHERE id = ?").run(req.params.id);

  // Send cancellation email (non-blocking)
  sendBookingCancellation({
    to: booking.user_email,
    name: booking.user_name,
    deskName: booking.desk_name,
    date: booking.date,
  });

  res.json({ ok: true });
});

module.exports = router;
