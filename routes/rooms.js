const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { sendEmail } = require("../services/emailService");
const { auditLog } = require("../utils/audit");

// GET /api/rooms — lista salas ativas (qualquer usuário autenticado)
router.get("/", authMiddleware, (req, res) => {
  const rooms = db
    .prepare(
      "SELECT id, name, capacity, resources, active, created_at, updated_at FROM rooms WHERE active = 1 ORDER BY name ASC"
    )
    .all();

  // Deserializa resources de JSON string para array
  const result = rooms.map((r) => ({
    ...r,
    resources: JSON.parse(r.resources || "[]"),
  }));

  res.json(result);
});

// POST /api/rooms — cria sala (admin)
router.post("/", authMiddleware, requireRole("admin"), (req, res) => {
  const { name, capacity = 4, resources = ["TV"] } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Nome da sala é obrigatório." });
  }

  if (!Number.isInteger(capacity) || capacity < 1) {
    return res.status(400).json({ error: "Capacidade deve ser um inteiro positivo." });
  }

  if (!Array.isArray(resources)) {
    return res.status(400).json({ error: "Recursos deve ser um array." });
  }

  const exists = db.prepare("SELECT id FROM rooms WHERE name = ?").get(name.trim());
  if (exists) {
    return res.status(409).json({ error: "Já existe uma sala com esse nome." });
  }

  const result = db
    .prepare(
      "INSERT INTO rooms (name, capacity, resources) VALUES (?, ?, ?)"
    )
    .run(name.trim(), capacity, JSON.stringify(resources));

  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(result.lastInsertRowid);

  auditLog(req.user.id, req.user.name, "create_room", "room", room.id, {
    name: room.name,
    capacity: room.capacity,
  });

  res.status(201).json({ ...room, resources: JSON.parse(room.resources) });
});

// PUT /api/rooms/:id — edita sala (admin)
router.put("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

  if (!room) {
    return res.status(404).json({ error: "Sala não encontrada." });
  }

  const { name, capacity, resources } = req.body;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Nome da sala é obrigatório." });
    }
    // Check unique name excluding current room
    const conflict = db
      .prepare("SELECT id FROM rooms WHERE name = ? AND id != ?")
      .get(name.trim(), roomId);
    if (conflict) {
      return res.status(409).json({ error: "Já existe uma sala com esse nome." });
    }
  }

  if (capacity !== undefined) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      return res.status(400).json({ error: "Capacidade deve ser um inteiro positivo." });
    }
  }

  if (resources !== undefined && !Array.isArray(resources)) {
    return res.status(400).json({ error: "Recursos deve ser um array." });
  }

  db.prepare(
    `UPDATE rooms SET
       name = COALESCE(?, name),
       capacity = COALESCE(?, capacity),
       resources = COALESCE(?, resources),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name !== undefined ? name.trim() : null,
    capacity !== undefined ? capacity : null,
    resources !== undefined ? JSON.stringify(resources) : null,
    roomId
  );

  const updated = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

  auditLog(req.user.id, req.user.name, "update_room", "room", roomId, {
    name: updated.name,
    capacity: updated.capacity,
  });

  res.json({ ...updated, resources: JSON.parse(updated.resources) });
});

// DELETE /api/rooms/:id — desativa sala; cancela reservas futuras (admin)
router.delete("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

  if (!room) {
    return res.status(404).json({ error: "Sala não encontrada." });
  }

  if (!room.active) {
    return res.status(409).json({ error: "Sala já está desativada." });
  }

  // Busca reservas futuras confirmadas para notificar
  const futureBookings = db
    .prepare(
      `SELECT rb.id, rb.date, rb.start_time, rb.end_time, u.email, u.name AS user_name
       FROM room_bookings rb
       JOIN users u ON u.id = rb.user_id
       WHERE rb.room_id = ? AND rb.status = 'confirmed' AND rb.date >= date('now')`
    )
    .all(roomId);

  // Transação: desativa sala + cancela reservas
  const deactivate = db.transaction(() => {
    db.prepare(
      `UPDATE room_bookings SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now')
       WHERE room_id = ? AND status = 'confirmed' AND date >= date('now')`
    ).run(req.user.id, roomId);

    db.prepare(
      "UPDATE rooms SET active = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(roomId);
  });

  deactivate();

  // Notifica usuários com reservas canceladas (fire-and-forget)
  for (const booking of futureBookings) {
    sendEmail(booking.email, "booking-cancelled", {
      name: booking.user_name,
      room: room.name,
      date: booking.date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      reason: "A sala foi desativada pelo administrador.",
    });
  }

  auditLog(req.user.id, req.user.name, "deactivate_room", "room", roomId, {
    name: room.name,
    cancelled_bookings: futureBookings.length,
  });

  res.json({ ok: true, cancelled_bookings: futureBookings.length });
});

// ─── Cancelamento de Reserva ─────────────────────────────────────────────────

// DELETE /api/rooms/bookings/:id — cancela reserva
router.delete("/bookings/:id", authMiddleware, (req, res) => {
  const bookingId = parseInt(req.params.id, 10);
  const isAdmin = req.user.is_admin;

  const booking = db
    .prepare(
      `SELECT rb.*, r.name AS room_name, u.email AS user_email, u.name AS user_name
       FROM room_bookings rb
       JOIN rooms r ON r.id = rb.room_id
       JOIN users u ON u.id = rb.user_id
       WHERE rb.id = ?`
    )
    .get(bookingId);

  if (!booking) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  if (booking.status === "cancelled") {
    return res.status(409).json({ error: "Reserva já foi cancelada." });
  }

  // Usuário comum só cancela a própria reserva
  if (!isAdmin && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: "Você só pode cancelar suas próprias reservas." });
  }

  // Usuário comum: deve cancelar com 24h de antecedência
  if (!isAdmin) {
    const bookingDateTime = new Date(`${booking.date}T${booking.start_time}:00`);
    const now = new Date();
    const diffHours = (bookingDateTime - now) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return res.status(400).json({
        error: "Reservas só podem ser canceladas com no mínimo 24h de antecedência.",
      });
    }
  }

  db.prepare(
    `UPDATE room_bookings SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now')
     WHERE id = ?`
  ).run(req.user.id, bookingId);

  // Notifica o titular da reserva se foi cancelada pelo admin
  if (isAdmin && booking.user_id !== req.user.id) {
    sendEmail(booking.user_email, "booking-cancelled", {
      name: booking.user_name,
      room: booking.room_name,
      date: booking.date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      reason: "Cancelado pelo administrador.",
    });
  }

  auditLog(req.user.id, req.user.name, "cancel_room_booking", "room_booking", bookingId, {
    room_id: booking.room_id,
    date: booking.date,
    start_time: booking.start_time,
  });

  res.json({ ok: true });
});

// ─── Reservas de Sala ─────────────────────────────────────────────────────────

// GET /api/rooms/:id/availability?date=YYYY-MM-DD
router.get("/:id/availability", authMiddleware, (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Parâmetro date (YYYY-MM-DD) é obrigatório." });
  }

  const room = db.prepare("SELECT * FROM rooms WHERE id = ? AND active = 1").get(roomId);
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });

  const isAdmin = req.user.is_admin;

  const bookings = db
    .prepare(
      `SELECT rb.id, rb.start_time, rb.end_time, rb.status,
              ${isAdmin ? "u.name AS reserved_by, u.email AS reserved_by_email," : ""}
              rb.user_id
       FROM room_bookings rb
       JOIN users u ON u.id = rb.user_id
       WHERE rb.room_id = ? AND rb.date = ? AND rb.status = 'confirmed'
       ORDER BY rb.start_time ASC`
    )
    .all(roomId, date);

  // Gera slots de 30 min entre 08:00 e 18:00
  const slots = [];
  for (let h = 8; h < 18; h++) {
    for (const m of [0, 30]) {
      const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const endH = m === 30 ? h + 1 : h;
      const endM = m === 30 ? 0 : 30;
      const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      const conflict = bookings.find(
        (b) => b.start_time < end && b.end_time > start
      );

      const slot = { start, end, available: !conflict };
      if (conflict && isAdmin) {
        slot.reserved_by = conflict.reserved_by;
        slot.reserved_by_email = conflict.reserved_by_email;
      }
      slots.push(slot);
    }
  }

  res.json({
    room: { id: room.id, name: room.name, capacity: room.capacity },
    date,
    slots,
    bookings: isAdmin ? bookings : bookings.map((b) => ({
      id: b.id,
      start_time: b.start_time,
      end_time: b.end_time,
    })),
  });
});

// POST /api/rooms/:id/bookings — reserva sala
router.post("/:id/bookings", authMiddleware, (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const { date, start_time, end_time } = req.body;

  // Validações básicas
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: "date, start_time e end_time são obrigatórios." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Formato de date inválido (YYYY-MM-DD)." });
  }

  if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
    return res.status(400).json({ error: "Formato de horário inválido (HH:MM)." });
  }

  // Horário dentro de 08:00–18:00
  if (start_time < "08:00" || end_time > "18:00") {
    return res.status(400).json({ error: "Horário deve estar entre 08:00 e 18:00." });
  }

  if (end_time <= start_time) {
    return res.status(400).json({ error: "Horário de fim deve ser após o início." });
  }

  // Duração mínima de 30 min
  const [sh, sm] = start_time.split(":").map(Number);
  const [eh, em] = end_time.split(":").map(Number);
  const durationMin = (eh * 60 + em) - (sh * 60 + sm);
  if (durationMin < 30) {
    return res.status(400).json({ error: "Duração mínima de 30 minutos." });
  }

  // Antecedência máxima de 30 dias
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (date < today) {
    return res.status(400).json({ error: "Não é possível reservar datas passadas." });
  }
  if (date > maxDate) {
    return res.status(400).json({ error: "Reserva antecipada máxima de 30 dias." });
  }

  const room = db.prepare("SELECT * FROM rooms WHERE id = ? AND active = 1").get(roomId);
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });

  // Detecção de conflito + inserção em transação
  let bookingId;
  try {
    const createBooking = db.transaction(() => {
      const conflict = db
        .prepare(
          `SELECT id, start_time, end_time FROM room_bookings
           WHERE room_id = ? AND date = ? AND status = 'confirmed'
           AND start_time < ? AND end_time > ?`
        )
        .get(roomId, date, end_time, start_time);

      if (conflict) {
        // Sugere próximo slot disponível após o conflito
        const nextStart = conflict.end_time;
        const [nsh, nsm] = nextStart.split(":").map(Number);
        const nextEndMin = nsh * 60 + nsm + durationMin;
        const nextEnd = `${String(Math.floor(nextEndMin / 60)).padStart(2, "0")}:${String(nextEndMin % 60).padStart(2, "0")}`;
        const suggestion = nextEnd <= "18:00" ? { start: nextStart, end: nextEnd } : null;

        throw { type: "CONFLICT", suggestion };
      }

      const result = db
        .prepare(
          `INSERT INTO room_bookings (room_id, user_id, date, start_time, end_time, status)
           VALUES (?, ?, ?, ?, ?, 'confirmed')`
        )
        .run(roomId, req.user.id, date, start_time, end_time);

      return result.lastInsertRowid;
    });

    bookingId = createBooking();
  } catch (err) {
    if (err.type === "CONFLICT") {
      return res.status(409).json({
        error: "Conflito de horário: a sala já está reservada neste período.",
        next_available: err.suggestion,
      });
    }
    console.error("[rooms] Erro ao criar reserva:", err.message);
    return res.status(500).json({ error: "Erro interno." });
  }

  const booking = db.prepare("SELECT * FROM room_bookings WHERE id = ?").get(bookingId);

  auditLog(req.user.id, req.user.name, "create_room_booking", "room_booking", bookingId, {
    room_id: roomId,
    date,
    start_time,
    end_time,
  });

  sendEmail(req.user.email, "booking-confirmed", {
    name: req.user.name,
    room: room.name,
    date,
    start_time,
    end_time,
    type: "sala de reunião",
  });

  res.status(201).json(booking);
});

module.exports = router;
