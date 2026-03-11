const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// Listar todas as mesas
router.get("/", authMiddleware, (req, res) => {
  const desks = db.prepare("SELECT * FROM desks ORDER BY pos_y, pos_x").all();
  res.json(desks);
});

// Criar mesa (admin)
router.post("/", authMiddleware, adminMiddleware, (req, res) => {
  const { name, pos_x, pos_y } = req.body;
  if (!name || pos_x == null || pos_y == null)
    return res.status(400).json({ error: "Nome e posição são obrigatórios" });

  if (pos_x != null && (pos_x < 1 || pos_x > 50 || !Number.isInteger(Number(pos_x)))) {
    return res.status(400).json({ error: "Posição X deve ser um inteiro entre 1 e 50" });
  }
  if (pos_y != null && (pos_y < 1 || pos_y > 50 || !Number.isInteger(Number(pos_y)))) {
    return res.status(400).json({ error: "Posição Y deve ser um inteiro entre 1 e 50" });
  }

  const exists = db.prepare("SELECT id FROM desks WHERE pos_x = ? AND pos_y = ?").get(pos_x, pos_y);
  if (exists) return res.status(409).json({ error: "Já existe uma mesa nessa posição" });

  const result = db
    .prepare("INSERT INTO desks (name, pos_x, pos_y) VALUES (?, ?, ?)")
    .run(name.trim(), pos_x, pos_y);
  res.json(db.prepare("SELECT * FROM desks WHERE id = ?").get(result.lastInsertRowid));
});

// Atualizar mesa (admin)
router.put("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { name, pos_x, pos_y, is_active } = req.body;
  const desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada" });

  if (pos_x != null && (pos_x < 1 || pos_x > 50 || !Number.isInteger(Number(pos_x)))) {
    return res.status(400).json({ error: "Posição X deve ser um inteiro entre 1 e 50" });
  }
  if (pos_y != null && (pos_y < 1 || pos_y > 50 || !Number.isInteger(Number(pos_y)))) {
    return res.status(400).json({ error: "Posição Y deve ser um inteiro entre 1 e 50" });
  }

  if ((pos_x != null || pos_y != null)) {
    const nx = pos_x ?? desk.pos_x;
    const ny = pos_y ?? desk.pos_y;
    const conflict = db
      .prepare("SELECT id FROM desks WHERE pos_x = ? AND pos_y = ? AND id != ?")
      .get(nx, ny, desk.id);
    if (conflict) return res.status(409).json({ error: "Já existe uma mesa nessa posição" });
  }

  db.prepare(
    "UPDATE desks SET name = COALESCE(?, name), pos_x = COALESCE(?, pos_x), pos_y = COALESCE(?, pos_y), is_active = COALESCE(?, is_active) WHERE id = ?"
  ).run(name ?? null, pos_x ?? null, pos_y ?? null, is_active ?? null, req.params.id);

  res.json(db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id));
});

// Excluir mesa (admin)
router.delete("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada" });

  db.prepare("DELETE FROM desks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
