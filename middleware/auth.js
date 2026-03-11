const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error("ERRO: JWT_SECRET não definido. Configure o arquivo .env");
  process.exit(1);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Token não fornecido" });

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json({ error: "Token malformado" });
  }
  const token = parts[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Acesso restrito a administradores" });
  next();
}

module.exports = { authMiddleware, adminMiddleware, SECRET };
