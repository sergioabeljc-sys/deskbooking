const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { getEffectiveRotDays } = require("../utils/spots");

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

  // Ocupação por escritório — semana atual (Seg-Sex)
  const todayStr = new Date().toISOString().split("T")[0];
  const ref = new Date(todayStr + "T12:00:00Z");
  const diffToMon = ref.getUTCDay() === 0 ? -6 : 1 - ref.getUTCDay();
  const weekMonday = new Date(ref);
  weekMonday.setUTCDate(ref.getUTCDate() + diffToMon);
  const weekFriday = new Date(weekMonday);
  weekFriday.setUTCDate(weekMonday.getUTCDate() + 4);
  const wStart = weekMonday.toISOString().split("T")[0];
  const wEnd   = weekFriday.toISOString().split("T")[0];

  const spUsersThisWeek = db.prepare(
    "SELECT COUNT(DISTINCT user_id) AS cnt FROM bookings WHERE date >= ? AND date <= ?"
  ).get(wStart, wEnd).cnt;

  const totalUsers = db.prepare("SELECT COUNT(*) AS cnt FROM users").get().cnt;

  const itaquaUsersThisWeek = db.prepare(
    "SELECT COUNT(DISTINCT user_id) AS cnt FROM ti_schedules WHERE location = 'itaqua' AND date >= ? AND date <= ?"
  ).get(wStart, wEnd).cnt;

  const totalTiUsers = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE is_ti = 1").get().cnt;

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
    officeOccupancy: {
      weekStart: wStart,
      weekEnd: wEnd,
      sp:     { users: spUsersThisWeek,     total: totalUsers },
      itaqua: { users: itaquaUsersThisWeek, total: totalTiUsers },
    },
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

  const _todayD = new Date(); _todayD.setUTCHours(0, 0, 0, 0);
  const _maxD = new Date(_todayD); _maxD.setUTCDate(_todayD.getUTCDate() + 28);
  if (new Date(date + "T00:00:00Z") > _maxD)
    return res.status(400).json({ error: "Não é permitido reservar com mais de 4 semanas de antecedência" });

  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6) return res.status(400).json({ error: "Não é permitido reservar para fins de semana" });

  const desk = db.prepare("SELECT * FROM desks WHERE id = ? AND is_active = 1").get(deskIdInt);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada ou inativa" });

  // Verifica se usuário possui mesa própria disponível neste dia
  const DOW_MAP = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri" };
  const dowCode = DOW_MAP[dow];
  const ownedDesk = db.prepare(
    "SELECT id, name, type, rotative_days, rotative_days_next, rotative_days_next_from FROM desks WHERE owner_id = ? AND is_active = 1"
  ).get(req.user.id);
  if (ownedDesk) {
    if (ownedDesk.type === "fixed") {
      return res.status(409).json({ error: "Você possui mesa fixa e não precisa fazer reserva." });
    }
    if (ownedDesk.type === "rotative") {
      const effectiveDays = getEffectiveRotDays(ownedDesk, date);
      if (!effectiveDays.includes(dowCode)) {
        return res.status(409).json({
          error: `Sua mesa (${ownedDesk.name}) está disponível para você neste dia — reserva não é necessária.`,
        });
      }
    }
  }

  // Verifica se usuário já tem reserva nesta data
  const myBooking = db.prepare("SELECT id FROM bookings WHERE user_id = ? AND date = ?").get(req.user.id, date);
  if (myBooking) return res.status(409).json({ error: "Você já tem uma reserva nesta data" });

  // Limite semanal configurável por usuário (Seg-Sex)
  const ref = new Date(date + "T12:00:00Z");
  const diffToMon = ref.getUTCDay() === 0 ? -6 : 1 - ref.getUTCDay();
  const weekStart = new Date(ref);
  weekStart.setUTCDate(ref.getUTCDate() + diffToMon);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 4);
  const weeklyCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ? AND date >= ? AND date <= ?"
  ).get(req.user.id, weekStart.toISOString().split("T")[0], weekEnd.toISOString().split("T")[0]).cnt;
  const { weekly_office_days } = db.prepare("SELECT weekly_office_days FROM users WHERE id = ?").get(req.user.id);
  const maxDays = weekly_office_days ?? 3;
  if (weeklyCount >= maxDays) {
    return res.status(409).json({ error: `Limite de ${maxDays} dia${maxDays > 1 ? "s" : ""} por semana no escritório atingido` });
  }

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

    // Se o usuário for TI, registra automaticamente como SP na programação TI
    const userRow = db.prepare("SELECT is_ti FROM users WHERE id = ?").get(req.user.id);
    if (userRow?.is_ti) {
      db.prepare(`
        INSERT INTO ti_schedules (user_id, date, location)
        VALUES (?, ?, 'sp')
        ON CONFLICT(user_id, date) DO UPDATE SET location = 'sp'
      `).run(req.user.id, date);
    }

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

  if (req.user.is_admin) {
    auditLog(req.user.id, req.user.name, "cancel_booking", "booking", booking.id, {
      desk: booking.desk_name, date: booking.date, user: booking.user_name,
    });
  }


  // Se o dono da reserva for TI e tinha SP declarado, remove a declaração automática
  const ownerRow = db.prepare("SELECT is_ti FROM users WHERE id = ?").get(booking.user_id);
  if (ownerRow?.is_ti) {
    db.prepare("DELETE FROM ti_schedules WHERE user_id = ? AND date = ? AND location = 'sp'")
      .run(booking.user_id, booking.date);
  }

  res.json({ ok: true });
});

// Admin: criar reserva em nome de outro usuário
router.post("/admin", authMiddleware, adminMiddleware, async (req, res) => {
  const { user_id, desk_id, date } = req.body;
  if (!user_id || !desk_id || !date) return res.status(400).json({ error: "user_id, desk_id e date são obrigatórios" });

  const deskIdInt = parseInt(desk_id, 10);
  if (!deskIdInt || deskIdInt <= 0) return res.status(400).json({ error: "Mesa inválida" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Data inválida" });

  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6) return res.status(400).json({ error: "Fins de semana não permitidos" });

  const today = new Date().toISOString().split("T")[0];
  if (date < today) return res.status(400).json({ error: "Não é possível reservar para datas passadas" });

  const desk = db.prepare("SELECT * FROM desks WHERE id = ? AND is_active = 1").get(deskIdInt);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada ou inativa" });

  const targetUser = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(user_id);
  if (!targetUser) return res.status(404).json({ error: "Usuário não encontrado" });

  const existing = db.prepare("SELECT id FROM bookings WHERE user_id = ? AND date = ?").get(user_id, date);
  if (existing) return res.status(409).json({ error: "Usuário já tem reserva nesta data" });

  const deskTaken = db.prepare("SELECT id FROM bookings WHERE desk_id = ? AND date = ?").get(deskIdInt, date);
  if (deskTaken) return res.status(409).json({ error: "Mesa já reservada nesta data" });

  // Respeita limite semanal de 3 reservas
  const ref = new Date(date + "T12:00:00Z");
  const diffToMon = ref.getUTCDay() === 0 ? -6 : 1 - ref.getUTCDay();
  const weekStart = new Date(ref);
  weekStart.setUTCDate(ref.getUTCDate() + diffToMon);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 4);
  const weeklyCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ? AND date >= ? AND date <= ?"
  ).get(user_id, weekStart.toISOString().split("T")[0], weekEnd.toISOString().split("T")[0]).cnt;
  const { weekly_office_days: targetMaxDays } = db.prepare("SELECT weekly_office_days FROM users WHERE id = ?").get(user_id);
  const maxDaysAdmin = targetMaxDays ?? 3;
  if (weeklyCount >= maxDaysAdmin) return res.status(409).json({ error: `Limite de ${maxDaysAdmin} dia${maxDaysAdmin > 1 ? "s" : ""} por semana atingido para este usuário` });

  try {
    const result = db.prepare("INSERT INTO bookings (user_id, desk_id, date) VALUES (?, ?, ?)").run(user_id, deskIdInt, date);
    const booking = db.prepare(`
      SELECT b.id, b.user_id, b.desk_id, b.date,
             u.name AS user_name, u.email AS user_email, d.name AS desk_name
      FROM bookings b JOIN users u ON b.user_id = u.id JOIN desks d ON b.desk_id = d.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    auditLog(req.user.id, req.user.name, "create_booking_admin", "booking", result.lastInsertRowid, {
      desk: desk.name, date, user: targetUser.name,
    });

    // Marca SP na programação TI se o usuário for TI
    const userRow = db.prepare("SELECT is_ti FROM users WHERE id = ?").get(user_id);
    if (userRow?.is_ti) {
      db.prepare(`
        INSERT INTO ti_schedules (user_id, date, location) VALUES (?, ?, 'sp')
        ON CONFLICT(user_id, date) DO UPDATE SET location = 'sp'
      `).run(user_id, date);
    }

    res.json(booking);
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Conflito de reserva" });
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
