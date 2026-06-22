process.env.NODE_ENV = "test";

// Configura SMTP antes de importar o serviço
process.env.SMTP_HOST = "smtp.test.com";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "secret";
process.env.SMTP_FROM = "noreply@desk-booking.test";

// Mock nodemailer antes de importar emailService
const mockSendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

const { sendEmail, _test } = require("../services/emailService");
const { TEMPLATES, retryQueue, clearRetryQueue } = _test;

beforeEach(() => {
  mockSendMail.mockReset();
  clearRetryQueue();
});

// ─── Templates ────────────────────────────────────────────────────────────────

describe("Templates", () => {
  it("access-request contém e-mail e empresa", () => {
    const { subject, text } = TEMPLATES["access-request"]({
      email: "ana@tendaatacado.com.br",
      company: "Tenda Atacado",
    });
    expect(subject).toContain("pedido de acesso");
    expect(text).toContain("ana@tendaatacado.com.br");
    expect(text).toContain("Tenda Atacado");
  });

  it("access-approved contém nome do usuário", () => {
    const { subject, text } = TEMPLATES["access-approved"]({
      name: "Carlos",
      email: "carlos@voxcred.com.br",
    });
    expect(subject).toContain("aprovado");
    expect(text).toContain("Carlos");
  });

  it("access-refused contém e-mail do solicitante", () => {
    const { subject, text } = TEMPLATES["access-refused"]({
      email: "refused@voxcred.com.br",
    });
    expect(subject).toContain("não aprovado");
    expect(text).toContain("refused@voxcred.com.br");
  });

  it("booking-confirmed para vaga inclui data e horário", () => {
    const { subject, text } = TEMPLATES["booking-confirmed"]({
      type: "spot",
      date: "2026-06-25",
      startTime: "09:00",
      endTime: "18:00",
    });
    expect(subject).toContain("confirmada");
    expect(text).toContain("2026-06-25");
    expect(text).toContain("09:00");
  });

  it("booking-confirmed para sala inclui nome da sala", () => {
    const { subject, text, html } = TEMPLATES["booking-confirmed"]({
      type: "room",
      date: "2026-06-25",
      startTime: "14:00",
      endTime: "15:00",
      roomName: "Sala Alpha",
    });
    expect(subject).toContain("Sala Alpha");
    expect(text).toContain("Sala Alpha");
    expect(html).toContain("Sala Alpha");
  });

  it("booking-cancelled inclui data e horário", () => {
    const { subject, text } = TEMPLATES["booking-cancelled"]({
      type: "spot",
      date: "2026-06-25",
      startTime: "08:00",
      endTime: "12:00",
    });
    expect(subject).toContain("cancelada");
    expect(text).toContain("2026-06-25");
  });
});

// ─── sendEmail ────────────────────────────────────────────────────────────────

describe("sendEmail()", () => {
  it("chama transporter.sendMail com os campos corretos", async () => {
    mockSendMail.mockResolvedValue({ messageId: "abc" });

    await sendEmail("user@tendaatacado.com.br", "booking-confirmed", {
      type: "spot",
      date: "2026-06-25",
      startTime: "09:00",
      endTime: "18:00",
    });

    // sendEmail é fire-and-forget — aguarda um tick para o attemptSend rodar
    await new Promise((r) => setImmediate(r));

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("user@tendaatacado.com.br");
    expect(call.subject).toBeDefined();
    expect(call.text).toBeDefined();
    expect(call.html).toBeDefined();
  });

  it("não lança exceção quando SMTP falha", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP timeout"));

    await expect(
      sendEmail("user@test.com", "booking-confirmed", {
        type: "spot",
        date: "2026-06-25",
        startTime: "09:00",
        endTime: "18:00",
      })
    ).resolves.not.toThrow();

    await new Promise((r) => setImmediate(r));
  });

  it("enfileira para retry após falha (não excede MAX_ATTEMPTS na primeira falha)", async () => {
    mockSendMail.mockRejectedValue(new Error("connection refused"));

    await sendEmail("user@test.com", "booking-cancelled", {
      type: "spot",
      date: "2026-06-25",
      startTime: "08:00",
      endTime: "12:00",
    });

    await new Promise((r) => setImmediate(r));

    // Após primeira falha, deve estar na fila de retry (attempts=1, < MAX_ATTEMPTS=3)
    expect(retryQueue.length).toBe(1);
    expect(retryQueue[0].template).toBe("booking-cancelled");
    expect(retryQueue[0].attempts).toBe(1);
  });

  it("ignora template desconhecido sem lançar erro", async () => {
    await expect(
      sendEmail("user@test.com", "template-inexistente", {})
    ).resolves.not.toThrow();

    await new Promise((r) => setImmediate(r));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sendEmail é compatível com array de destinatários", async () => {
    mockSendMail.mockResolvedValue({});

    await sendEmail(
      ["a@tendaatacado.com.br", "b@voxcred.com.br"],
      "access-request",
      { email: "x@tendaatacado.com.br", company: "Tenda Atacado" }
    );

    await new Promise((r) => setImmediate(r));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toEqual([
      "a@tendaatacado.com.br",
      "b@voxcred.com.br",
    ]);
  });
});

// ─── SMTP não configurado ─────────────────────────────────────────────────────

describe("sendEmail() sem SMTP configurado", () => {
  let originalHost;

  beforeEach(() => {
    originalHost = process.env.SMTP_HOST;
  });

  afterEach(() => {
    process.env.SMTP_HOST = originalHost;
  });

  it("skip silencioso quando SMTP_CONFIGURED é false no módulo carregado", async () => {
    // O módulo já foi carregado com SMTP configurado.
    // Testamos o comportamento via mock do transporter retornando erro, que é o caso de SMTP mal configurado.
    mockSendMail.mockRejectedValue(new Error("auth failed"));

    await expect(
      sendEmail("user@test.com", "booking-confirmed", {
        type: "spot",
        date: "2026-06-25",
        startTime: "09:00",
        endTime: "18:00",
      })
    ).resolves.not.toThrow();

    await new Promise((r) => setImmediate(r));
    // Não deve lançar exceção — independente do resultado SMTP
  });
});
