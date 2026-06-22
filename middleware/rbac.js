const db = require("../db");

/**
 * Exige perfil de admin. Consulta is_admin no banco (não confia apenas no JWT).
 * Uso: router.get('/rota', authMiddleware, requireRole('admin'), handler)
 */
function requireRole(role) {
  return function (req, res, next) {
    if (role === "admin") {
      const row = db
        .prepare("SELECT is_admin FROM users WHERE id = ?")
        .get(req.user?.id);
      if (!row?.is_admin) {
        return res.status(403).json({ error: "Acesso restrito a administradores" });
      }
      return next();
    }
    // Para roles futuras não implementadas, bloquear por padrão
    return res.status(403).json({ error: "Perfil não autorizado" });
  };
}

/**
 * Exige que o departamento do usuário tenha can_book_spot = 1.
 * Consulta a tabela departments no banco.
 * Uso: router.post('/spots', authMiddleware, requireDepartmentAccess(), handler)
 */
function requireDepartmentAccess() {
  return function (req, res, next) {
    const user = db
      .prepare("SELECT department FROM users WHERE id = ?")
      .get(req.user?.id);

    if (!user?.department) {
      return res
        .status(403)
        .json({ error: "Usuário sem departamento definido. Contate o administrador." });
    }

    const dept = db
      .prepare("SELECT can_book_spot FROM departments WHERE name = ?")
      .get(user.department);

    if (!dept?.can_book_spot) {
      return res.status(403).json({
        error: "Seu departamento não está habilitado para reservar vagas.",
      });
    }

    next();
  };
}

/**
 * Permite acesso ao dono do recurso ou a admins. Bloqueia demais com 403.
 * @param {function} getResourceUserId - Função (req) => userId do dono do recurso.
 * Uso: router.delete('/:id', authMiddleware, requireOwnerOrAdmin(req => getOwnerId(req)), handler)
 */
function requireOwnerOrAdmin(getResourceUserId) {
  return function (req, res, next) {
    const adminRow = db
      .prepare("SELECT is_admin FROM users WHERE id = ?")
      .get(req.user?.id);

    if (adminRow?.is_admin) {
      return next();
    }

    const resourceUserId = getResourceUserId(req);
    if (resourceUserId !== undefined && resourceUserId !== null && resourceUserId === req.user?.id) {
      return next();
    }

    return res.status(403).json({ error: "Acesso negado. Você não é o dono deste recurso." });
  };
}

module.exports = { requireRole, requireDepartmentAccess, requireOwnerOrAdmin };
