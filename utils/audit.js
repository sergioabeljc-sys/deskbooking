const db = require("../db");

function auditLog(actorId, actorName, action, targetType, targetId, details) {
  try {
    db.prepare(
      "INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      actorId,
      actorName || String(actorId),
      action,
      targetType || null,
      targetId || null,
      details ? JSON.stringify(details) : null
    );
  } catch (err) {
    console.error("[audit]", err.message);
  }
}

module.exports = { auditLog };
