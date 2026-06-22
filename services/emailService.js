const nodemailer = require("nodemailer");

// ─── Configuração ─────────────────────────────────────────────────────────────

const SMTP_CONFIGURED =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

let transporter = null;

if (SMTP_CONFIGURED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@desk-booking";

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = {
  "access-request": (data) => ({
    subject: "Novo pedido de acesso — Desk Booking",
    text: `Novo pedido de acesso recebido.\n\nE-mail: ${data.email}\nEmpresa: ${data.company}\n\nAcesse o painel admin para aprovar ou recusar.`,
    html: `<p>Novo pedido de acesso recebido.</p><ul><li><b>E-mail:</b> ${data.email}</li><li><b>Empresa:</b> ${data.company}</li></ul><p>Acesse o painel admin para aprovar ou recusar.</p>`,
  }),

  "access-approved": (data) => ({
    subject: "Seu acesso ao Desk Booking foi aprovado",
    text: `Olá, ${data.name || data.email}!\n\nSeu acesso ao Desk Booking foi aprovado. Faça login com sua conta Microsoft em: ${data.loginUrl || "https://desk-booking"}.`,
    html: `<p>Olá, <b>${data.name || data.email}</b>!</p><p>Seu acesso ao Desk Booking foi aprovado.</p><p>Faça login com sua conta Microsoft para começar a reservar.</p>`,
  }),

  "access-refused": (data) => ({
    subject: "Pedido de acesso ao Desk Booking não aprovado",
    text: `Olá,\n\nSeu pedido de acesso ao Desk Booking (${data.email}) não foi aprovado. Entre em contato com o administrador para mais informações.`,
    html: `<p>Olá,</p><p>Seu pedido de acesso ao Desk Booking (<b>${data.email}</b>) não foi aprovado.</p><p>Entre em contato com o administrador para mais informações.</p>`,
  }),

  "booking-confirmed": (data) => ({
    subject: `Reserva confirmada — ${data.type === "room" ? `Sala ${data.roomName}` : "Vaga no escritório"}`,
    text: `Sua reserva foi confirmada!\n\nData: ${data.date}\nHorário: ${data.startTime} às ${data.endTime}${data.roomName ? `\nSala: ${data.roomName}` : ""}`,
    html: `<p>Sua reserva foi confirmada!</p><ul><li><b>Data:</b> ${data.date}</li><li><b>Horário:</b> ${data.startTime} às ${data.endTime}</li>${data.roomName ? `<li><b>Sala:</b> ${data.roomName}</li>` : ""}</ul>`,
  }),

  "booking-cancelled": (data) => ({
    subject: `Reserva cancelada — ${data.type === "room" ? `Sala ${data.roomName}` : "Vaga no escritório"}`,
    text: `Sua reserva foi cancelada.\n\nData: ${data.date}\nHorário: ${data.startTime} às ${data.endTime}${data.roomName ? `\nSala: ${data.roomName}` : ""}`,
    html: `<p>Sua reserva foi cancelada.</p><ul><li><b>Data:</b> ${data.date}</li><li><b>Horário:</b> ${data.startTime} às ${data.endTime}</li>${data.roomName ? `<li><b>Sala:</b> ${data.roomName}</li>` : ""}</ul>`,
  }),
};

// ─── Fila de Retry ────────────────────────────────────────────────────────────

const retryQueue = []; // [{ to, template, data, attempts }]
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 30_000;

let retryTimer = null;

function startRetryTimer() {
  if (retryTimer || process.env.NODE_ENV === "test") return;
  retryTimer = setInterval(async () => {
    const pending = retryQueue.splice(0, retryQueue.length);
    for (const item of pending) {
      await attemptSend(item.to, item.template, item.data, item.attempts);
    }
  }, RETRY_INTERVAL_MS);
  retryTimer.unref(); // não impede o processo de encerrar
}

async function attemptSend(to, template, data, attempts = 0) {
  const builder = TEMPLATES[template];
  if (!builder) {
    console.warn(`[email] Template desconhecido: ${template}`);
    return;
  }

  const { subject, text, html } = builder(data);

  try {
    await transporter.sendMail({ from: FROM, to, subject, text, html });
    console.log(`[email] Enviado: ${template} → ${to}`);
  } catch (err) {
    const nextAttempt = attempts + 1;
    if (nextAttempt < MAX_ATTEMPTS) {
      console.warn(`[email] Falha (tentativa ${nextAttempt}/${MAX_ATTEMPTS}): ${err.message}. Enfileirando retry.`);
      retryQueue.push({ to, template, data, attempts: nextAttempt });
      startRetryTimer();
    } else {
      console.error(`[email] Falha definitiva após ${MAX_ATTEMPTS} tentativas para ${to}: ${err.message}`);
    }
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Envia um e-mail usando um template pré-definido.
 * Nunca lança exceção para o chamador — falhas são enfileiradas para retry.
 *
 * @param {string|string[]} to - Destinatário(s)
 * @param {string} template - Nome do template (ex: 'booking-confirmed')
 * @param {object} data - Dados para preencher o template
 */
async function sendEmail(to, template, data = {}) {
  if (!SMTP_CONFIGURED) {
    console.warn(`[email] SMTP não configurado. E-mail ignorado: ${template} → ${to}`);
    return;
  }

  // Não bloqueia o chamador: dispara e esquece
  attemptSend(to, template, data, 0).catch(() => {});
}

// Expõe internals apenas para testes
const _test = {
  retryQueue,
  clearRetryQueue: () => retryQueue.splice(0, retryQueue.length),
  TEMPLATES,
};

module.exports = { sendEmail, _test };
