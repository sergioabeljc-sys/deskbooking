const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

const ACTION_LABELS = {
  cancel_booking: "Reserva cancelada",
  create_booking_admin: "Reserva criada (admin)",
  toggle_ti: "Perfil TI alterado",
  toggle_admin: "Perfil Admin alterado",
  delete_user: "Usuário removido",
  set_ti_location: "Local TI definido (admin)",
  clear_ti_location: "Local TI removido (admin)",
};

router.get("/", authMiddleware, adminMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const { total } = db.prepare("SELECT COUNT(*) as total FROM audit_log").get();
  const logs = db.prepare(
    "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset);

  res.json({
    data: logs.map((l) => ({
      ...l,
      action_label: ACTION_LABELS[l.action] || l.action,
      details_parsed: l.details ? JSON.parse(l.details) : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

module.exports = router;
