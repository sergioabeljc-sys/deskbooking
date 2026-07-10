const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { requireDepartmentAccess } = require("../middleware/rbac");
const { sendEmail } = require("../services/emailService");
const { auditLog } = require("../utils/audit");
const { getAvailableSpots, getAutoPresences, getEffectiveRotDays, DOW_NAMES } = require("../utils/spots");

// ─── Story 5.1: Visão Semanal de Presenças ───────────────────────────────────

// GET /api/spots/week?start=YYYY-MM-DD
// Retorna presenças confirmadas de segunda a sexta da semana indicada.
// Se start não for fornecido, usa a segunda-feira da semana atual.
router.get("/week", authMiddleware, (req, res) => {
  let { start } = req.query;

  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: "start deve estar no formato YYYY-MM-DD." });
  }

  // Se não fornecido, calcula a segunda-feira da semana atual
  if (!start) {
    const today = new Date();
    const dow = today.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    start = monday.toISOString().slice(0, 10);
  }

  // Gera os 5 dias úteis da semana (seg–sex) a partir de start
  const days = [];
  const startDate = new Date(start + "T12:00:00Z"); // UTC noon para evitar DST
  for (let i = 0; i < 5; i++) {
    const d = new Date(startDate);
    d.setUTCDate(startDate.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Busca todas as presenças confirmadas para os 5 dias
  const placeholders = days.map(() => "?").join(",");
  const bookings = db
    .prepare(
      `SELECT sb.date, sb.start_time, sb.end_time,
              COALESCE(u.name, 'Usuário removido') AS name,
              COALESCE(u.email, '') AS email,
              COALESCE(u.company, '') AS company,
              CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END AS is_desk_owner
       FROM spot_bookings sb
       LEFT JOIN users u ON u.id = sb.user_id
       LEFT JOIN desks d ON d.owner_id = u.id AND d.is_active = 1 AND d.type = 'fixed'
       WHERE sb.date IN (${placeholders}) AND sb.status = 'confirmed'
       ORDER BY sb.date ASC, sb.start_time ASC, u.name ASC`
    )
    .all(...days);

  // Agrupa por data
  const week = {};
  for (const day of days) {
    week[day] = [];
  }
  for (const b of bookings) {
    if (week[b.date]) {
      week[b.date].push({
        name: b.name,
        email: b.email,
        company: b.company,
        start_time: b.start_time,
        end_time: b.end_time,
        auto_presence: false,
        is_desk_owner: b.is_desk_owner === 1,
      });
    }
  }

  // Inclui presenças automáticas (donos de mesa fora do pool)
  for (const day of days) {
    const auto = getAutoPresences(day);
    for (const p of auto) {
      week[day].push({
        name: p.name,
        email: p.email,
        company: p.company,
        desk_name: p.desk_name,
        start_time: null,
        end_time: null,
        auto_presence: true,
      });
    }
    week[day].sort((a, b) => a.name.localeCompare(b.name));
  }

  res.json({ start, days, week });
});

// GET /api/spots/availability?date=YYYY-MM-DD
router.get("/availability", authMiddleware, (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Parâmetro date (YYYY-MM-DD) é obrigatório." });
  }

  const info = getAvailableSpots(date);
  res.json(info);
});

// POST /api/spots/bookings — reserva vaga (uma ou múltiplas datas)
router.post("/bookings", authMiddleware, requireDepartmentAccess(), (req, res) => {
  const { dates, start_time, end_time } = req.body;

  // Normaliza: aceita array ou string única
  const dateList = Array.isArray(dates) ? dates : dates ? [dates] : [];

  if (dateList.length === 0) {
    return res.status(400).json({ error: "dates (array ou string) é obrigatório." });
  }

  if (!start_time || !end_time) {
    return res.status(400).json({ error: "start_time e end_time são obrigatórios." });
  }

  if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
    return res.status(400).json({ error: "Formato de horário inválido (HH:MM)." });
  }

  if (start_time < "08:00" || end_time > "18:00") {
    return res.status(400).json({ error: "Horário deve estar entre 08:00 e 18:00." });
  }

  if (end_time <= start_time) {
    return res.status(400).json({ error: "Horário de fim deve ser após o início." });
  }

  const [sh, sm] = start_time.split(":").map(Number);
  const [eh, em] = end_time.split(":").map(Number);
  const durationMin = (eh * 60 + em) - (sh * 60 + sm);
  if (durationMin < 30) {
    return res.status(400).json({ error: "Duração mínima de 30 minutos." });
  }

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Valida cada data
  const errors = [];
  const created = [];

  for (const date of dateList) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ date, error: "Formato inválido (YYYY-MM-DD)." });
      continue;
    }

    if (date < today) {
      errors.push({ date, error: "Data no passado." });
      continue;
    }

    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) {
      errors.push({ date, error: "Reservas não são permitidas em finais de semana." });
      continue;
    }

    // Bloqueia reserva no próprio dia após as 18h horário de Brasília (UTC-3, DST abolido em 2019)
    if (date === today) {
      const nowBrazilHour = (new Date().getUTCHours() - 3 + 24) % 24;
      if (nowBrazilHour >= 18) {
        errors.push({ date, error: "Reservas para hoje não são permitidas após as 18h." });
        continue;
      }
    }

    if (date > maxDate) {
      errors.push({ date, error: "Antecedência máxima de 30 dias." });
      continue;
    }

    // Reserva duplicada para o mesmo usuário
    const duplicate = db
      .prepare(
        "SELECT id FROM spot_bookings WHERE user_id = ? AND date = ? AND status = 'confirmed'"
      )
      .get(req.user.id, date);

    if (duplicate) {
      errors.push({ date, error: "Você já tem uma vaga reservada para esta data." });
      continue;
    }

    // Bloqueia reserva de vaga para donos de mesa disponível neste dia
    // Usa getEffectiveRotDays para considerar configuração pendente (rotative_days_next)
    const dowCode = DOW_NAMES[dow];
    const ownedDesk = db
      .prepare("SELECT id, name, type, rotative_days, rotative_days_next, rotative_days_next_from FROM desks WHERE owner_id = ? AND is_active = 1")
      .get(req.user.id);
    if (ownedDesk) {
      if (ownedDesk.type === "fixed") {
        errors.push({ date, error: "Você possui mesa fixa e não precisa reservar vaga." });
        continue;
      }
      if (ownedDesk.type === "rotative") {
        const effectiveDays = getEffectiveRotDays(ownedDesk, date);
        if (!effectiveDays.includes(dowCode)) {
          errors.push({ date, error: `Sua mesa está reservada para você neste dia — reserva de vaga não é necessária.` });
          continue;
        }
      }
    }

    // Verifica disponibilidade
    const avail = getAvailableSpots(date);
    if (avail.available <= 0) {
      errors.push({ date, error: "Sem vagas disponíveis para esta data." });
      continue;
    }

    // Cria reserva em transação (previne race condition)
    try {
      const bookingId = db.transaction(() => {
        // Re-verifica dentro da transação
        const current = getAvailableSpots(date);
        if (current.available <= 0) throw { type: "NO_SPOTS" };

        // Se existe reserva cancelada para este usuário/data, reutiliza o registro
        const cancelled = db
          .prepare(
            "SELECT id FROM spot_bookings WHERE user_id = ? AND date = ? AND status = 'cancelled'"
          )
          .get(req.user.id, date);

        if (cancelled) {
          db.prepare(
            `UPDATE spot_bookings SET start_time = ?, end_time = ?, status = 'confirmed',
             cancelled_by = NULL, cancelled_at = NULL
             WHERE id = ?`
          ).run(start_time, end_time, cancelled.id);
          return cancelled.id;
        }

        const result = db
          .prepare(
            `INSERT INTO spot_bookings (user_id, date, start_time, end_time, status)
             VALUES (?, ?, ?, ?, 'confirmed')`
          )
          .run(req.user.id, date, start_time, end_time);

        return result.lastInsertRowid;
      })();

      const booking = db.prepare("SELECT * FROM spot_bookings WHERE id = ?").get(bookingId);

      auditLog(req.user.id, req.user.name, "create_spot_booking", "spot_booking", bookingId, {
        date,
        start_time,
        end_time,
      });

      sendEmail(req.user.email, "booking-confirmed", {
        name: req.user.name,
        date,
        start_time,
        end_time,
        type: "vaga no escritório",
      });

      created.push(booking);
    } catch (err) {
      if (err.type === "NO_SPOTS") {
        errors.push({ date, error: "Sem vagas disponíveis (esgotadas no momento da reserva)." });
      } else {
        console.error("[spots] Erro ao criar reserva:", err.message);
        errors.push({ date, error: "Erro interno ao criar reserva." });
      }
    }
  }

  // Se TODAS falharam → status 409 (ou 400 se inválidas)
  if (created.length === 0) {
    return res.status(409).json({ errors });
  }

  // Sucesso parcial ou total
  res.status(201).json({ created, errors });
});

// GET /api/spots/my-bookings?start=YYYY-MM-DD — reservas do usuário logado
router.get("/my-bookings", authMiddleware, (req, res) => {
  const start = req.query.start || new Date().toISOString().slice(0, 10);
  const end = req.query.end || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const bookings = db
    .prepare(
      `SELECT id, date, start_time, end_time, status FROM spot_bookings
       WHERE user_id = ? AND date >= ? AND date <= ? AND status = 'confirmed'
       ORDER BY date ASC`
    )
    .all(req.user.id, start, end);
  res.json(bookings);
});

// GET /api/spots/bookings/all — admin: todas as reservas de vaga paginadas
router.get("/bookings/all", authMiddleware, adminMiddleware, (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const from = req.query.from || null;
  const to   = req.query.to   || null;

  let where = "WHERE sb.status = 'confirmed'";
  const params = [];
  if (from) { where += " AND sb.date >= ?"; params.push(from); }
  if (to)   { where += " AND sb.date <= ?"; params.push(to); }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM spot_bookings sb ${where}`).get(...params).cnt;
  const data  = db.prepare(`
    SELECT sb.id, sb.date, sb.start_time, sb.end_time, sb.status, sb.created_at,
           COALESCE(u.name, 'Usuário removido') AS user_name,
           COALESCE(u.email, '') AS user_email,
           COALESCE(u.company, '') AS company
    FROM spot_bookings sb
    LEFT JOIN users u ON u.id = sb.user_id
    ${where}
    ORDER BY sb.date DESC, sb.start_time ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ data, total, page, pages: Math.ceil(total / limit) });
});

// DELETE /api/spots/bookings/:id — cancela vaga
router.delete("/bookings/:id", authMiddleware, (req, res) => {
  const bookingId = parseInt(req.params.id, 10);
  const isAdmin = req.user.is_admin;

  const booking = db
    .prepare(
      `SELECT sb.*, COALESCE(u.email, '') AS user_email,
              COALESCE(u.name, 'Usuário removido') AS user_name
       FROM spot_bookings sb
       LEFT JOIN users u ON u.id = sb.user_id
       WHERE sb.id = ?`
    )
    .get(bookingId);

  if (!booking) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  if (booking.status === "cancelled") {
    return res.status(409).json({ error: "Reserva já foi cancelada." });
  }

  if (!isAdmin && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: "Você só pode cancelar suas próprias reservas." });
  }

  const today = new Date().toISOString().slice(0, 10);
  // Horário de Brasília (UTC-3, DST abolido em 2019)
  const nowBrazilHour = (new Date().getUTCHours() - 3 + 24) % 24;

  if (isAdmin) {
    // Admin não pode cancelar reservas de dias anteriores
    if (booking.date < today) {
      return res.status(400).json({ error: "Não é possível cancelar reservas de dias anteriores." });
    }
    // Admin não pode cancelar reservas do dia atual após as 18h
    if (booking.date === today && nowBrazilHour >= 18) {
      return res.status(400).json({ error: "Não é possível cancelar reservas do dia atual após as 18h." });
    }
  } else {
    // Usuário comum: regra de 24h
    const isSelfCancel = booking.user_id === req.user.id;
    if (isSelfCancel) {
      const bookingDateTime = new Date(`${booking.date}T${booking.start_time}:00`);
      const diffHours = (bookingDateTime - new Date()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        return res.status(400).json({
          error: "Reservas só podem ser canceladas com no mínimo 24h de antecedência.",
        });
      }
    }
  }

  db.prepare(
    `UPDATE spot_bookings SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now')
     WHERE id = ?`
  ).run(req.user.id, bookingId);

  // Notifica o titular se foi cancelado pelo admin
  if (isAdmin && booking.user_id !== req.user.id) {
    sendEmail(booking.user_email, "booking-cancelled", {
      name: booking.user_name,
      date: booking.date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      reason: "Cancelado pelo administrador.",
    });
  }

  auditLog(req.user.id, req.user.name, "cancel_spot_booking", "spot_booking", bookingId, {
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
  });

  res.json({ ok: true });
});

module.exports = router;
