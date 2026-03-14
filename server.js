require("dotenv").config();
const express = require("express");
const path = require("path");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const app = express();

// Em produção, confia no proxy reverso (nginx/Caddy) para IP real e proto.
// O redirect HTTP→HTTPS é feito pelo nginx/Caddy, não aqui,
// pois redirecionar no Node.js gera respostas HTML que quebram chamadas de API JSON.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameSrc: ["'none'"],
        scriptSrcAttr: ["'unsafe-inline'"],
      },
    },
  })
);

// CORS — permite apenas origem configurada (ou mesma origem em produção)
const allowedOrigin = process.env.ALLOWED_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
app.use(
  cors({
    origin: process.env.NODE_ENV === "test" ? "*" : allowedOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Logging de requisicoes HTTP (silenciado em testes)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Limite geral: 200 req/min por IP
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em instantes." },
    skip: () => process.env.NODE_ENV === "test",
  })
);

// Limite restrito para auth: 10 tentativas/15 min por IP
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
    skip: () => process.env.NODE_ENV === "test",
  })
);

app.use(
  "/api/auth/register",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Limite de cadastros atingido. Tente novamente em 1 hora." },
    skip: () => process.env.NODE_ENV === "test",
  })
);

// Rate limit para endpoints admin intensivos (export, listagem de usuários)
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em instantes." },
  skip: () => process.env.NODE_ENV === "test",
});
app.use("/api/bookings/export", adminLimiter);
app.use("/api/users", adminLimiter);

// CSRF: esta API usa JWT via Authorization header (Bearer), não cookies.
// Navegadores bloqueiam headers customizados em requisições cross-origin,
// portanto CSRF está mitigado arquiteturalmente pelo CORS + Bearer token.

app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Swagger docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/desks", require("./routes/desks"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/ti", require("./routes/ti"));

// Tratamento de erros — logs sanitizados (sem senhas ou tokens)
app.use((err, req, res, next) => {
  const safeBody = { ...req.body };
  delete safeBody.password;
  delete safeBody.confirmPassword;
  delete safeBody.refreshToken;
  console.error(`[${new Date().toISOString()}] Erro não tratado:`, {
    method: req.method,
    path: req.path,
    body: safeBody,
    message: err.message,
  });
  res.status(500).json({ error: "Erro interno do servidor" });
});

// Rotas de API não encontradas retornam JSON (nunca HTML)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// Fallback SPA: serve index.html para rotas de frontend desconhecidas
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
    console.log("   Primeiro usuário registrado será admin automaticamente.\n");
  });
}

module.exports = app;
