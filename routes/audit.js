const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const ACTION_LABELS = {
  // Reservas de mesa
  cancel_booking: "Reserva cancelada",
  create_booking_admin: "Reserva criada (admin)",
  // Vaga avulsa
  create_spot_booking: "Vaga avulsa reservada",
  cancel_spot_booking: "Vaga avulsa cancelada",
  // Salas
  create_room: "Sala criada",
  update_room: "Sala editada",
  deactivate_room: "Sala desativada",
  create_room_booking: "Reserva de sala criada",
  cancel_room_booking: "Reserva de sala cancelada",
  // Mesas
  update_desk_type: "Tipo de mesa alterado",
  update_rotative_days: "Dias rotativos atualizados",
  // Usuários
  create_user: "Usuário criado",
  edit_user: "Usuário editado",
  delete_user: "Usuário removido",
  toggle_ti: "Perfil TI alterado",
  toggle_admin: "Perfil Admin alterado",
  toggle_status: "Status do usuário alterado",
  set_weekly_days: "Dias semanais definidos",
  // Acesso
  approve_access: "Acesso aprovado",
  refuse_access: "Acesso recusado",
  // Departamentos
  create_department: "Departamento criado",
  update_department: "Departamento atualizado",
  delete_department: "Departamento removido",
  // Vagas
  update_spot_capacity: "Capacidade de vagas alterada",
  // TI
  set_ti_location: "Local TI definido",
  clear_ti_location: "Local TI removido",
};

router.get("/", authMiddleware, adminMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const { total } = db.prepare("SELECT COUNT(*) as total FROM audit_log").get();
  const logs = db.prepare(
    "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset);

  const ROOM_BOOKING_ACTIONS = new Set(["create_room_booking", "cancel_room_booking"]);

  res.json({
    data: logs.map((l) => {
      const details_parsed = l.details ? JSON.parse(l.details) : null;

      // Enrich legacy records that stored room_id instead of room_name
      if (details_parsed && ROOM_BOOKING_ACTIONS.has(l.action) && details_parsed.room_id && !details_parsed.room_name) {
        const room = db.prepare("SELECT name FROM rooms WHERE id = ?").get(details_parsed.room_id);
        if (room) details_parsed.room_name = room.name;
      }

      return {
        ...l,
        action_label: ACTION_LABELS[l.action] || l.action,
        details_parsed,
      };
    }),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

module.exports = router;
