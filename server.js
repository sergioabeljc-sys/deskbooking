const express = require("express");
const path = require("path");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();

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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/desks", require("./routes/desks"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/users", require("./routes/users"));

// Tratamento de erros nao capturados
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Erro nao tratado:`, err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// Fallback: serve index.html para rotas desconhecidas
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
