const nodemailer = require("nodemailer");

const configured =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

if (!configured && process.env.NODE_ENV !== "test") {
  console.warn("[email] SMTP não configurado — e-mails desativados. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env");
}

let transporter = null;
if (configured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: parseInt(process.env.SMTP_PORT || "587") === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@deskbooking.com";

async function sendBookingConfirmation({ to, name, deskName, date }) {
  if (!transporter) return;
  const [year, month, day] = date.split("-");
  const dateFormatted = `${day}/${month}/${year}`;
  try {
    await transporter.sendMail({
      from: `"Desk Booking" <${FROM}>`,
      to,
      subject: `Reserva confirmada — ${deskName} em ${dateFormatted}`,
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Desk Booking</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#16a34a;font-size:22px;">Reserva Confirmada!</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Olá, <strong style="color:#1e293b;">${name}</strong>! Sua reserva foi realizada com sucesso.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;padding:20px;margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;">
                  <span style="color:#64748b;font-size:13px;display:block;margin-bottom:2px;">Mesa</span>
                  <strong style="color:#1e293b;font-size:17px;">${deskName}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;display:block;margin-bottom:2px;">Data</span>
                  <strong style="color:#1e293b;font-size:17px;">${dateFormatted}</strong>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#64748b;font-size:13px;">Se precisar cancelar, acesse o sistema e cancele sua reserva com antecedência.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Desk Booking — Sistema de Agendamento de Mesas</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error("[email] Falha ao enviar confirmação:", err.message);
  }
}

async function sendBookingCancellation({ to, name, deskName, date }) {
  if (!transporter) return;
  const [year, month, day] = date.split("-");
  const dateFormatted = `${day}/${month}/${year}`;
  try {
    await transporter.sendMail({
      from: `"Desk Booking" <${FROM}>`,
      to,
      subject: `Reserva cancelada — ${deskName} em ${dateFormatted}`,
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Desk Booking</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#dc2626;font-size:22px;">Reserva Cancelada</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Olá, <strong style="color:#1e293b;">${name}</strong>. Sua reserva foi cancelada.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;border-radius:8px;border:1px solid #fca5a5;padding:20px;margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;">
                  <span style="color:#64748b;font-size:13px;display:block;margin-bottom:2px;">Mesa</span>
                  <strong style="color:#1e293b;font-size:17px;">${deskName}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;border-top:1px solid #fca5a5;">
                  <span style="color:#64748b;font-size:13px;display:block;margin-bottom:2px;">Data</span>
                  <strong style="color:#1e293b;font-size:17px;">${dateFormatted}</strong>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#64748b;font-size:13px;">Você pode fazer uma nova reserva a qualquer momento no sistema.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Desk Booking — Sistema de Agendamento de Mesas</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error("[email] Falha ao enviar cancelamento:", err.message);
  }
}

module.exports = { sendBookingConfirmation, sendBookingCancellation };
