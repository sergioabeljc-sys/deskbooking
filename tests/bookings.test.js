process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

const request = require("supertest");
const app = require("../server");

let adminToken, userToken, deskId;
const today = new Date().toISOString().split("T")[0];
// Use next weekday to avoid weekend booking rejection
function nextWeekday() {
  const d = new Date(Date.now() + 86400000);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2); // Sat → Mon
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
  return d.toISOString().split("T")[0];
}
const tomorrow = nextWeekday();

beforeAll(async () => {
  const admin = await request(app).post("/api/auth/register").send({
    name: "Admin",
    email: "admin@voxcred.com.br",
    password: "123456",
  });
  adminToken = admin.body.token;

  const user = await request(app).post("/api/auth/register").send({
    name: "Usuario",
    email: "user@voxcred.com.br",
    password: "123456",
  });
  userToken = user.body.token;

  // Pega o id de uma mesa
  const desks = await request(app)
    .get("/api/desks")
    .set("Authorization", `Bearer ${adminToken}`);
  deskId = desks.body[0].id;
});

describe("Bookings", () => {
  describe("POST /api/bookings", () => {
    it("cria uma reserva com sucesso", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ desk_id: deskId, date: tomorrow });
      expect(res.status).toBe(200);
      expect(res.body.desk_id).toBe(deskId);
      expect(res.body.date).toBe(tomorrow);
    });

    it("impede reserva duplicada na mesma mesa e data", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ desk_id: deskId, date: tomorrow });
      expect(res.status).toBe(409);
    });

    it("impede usuario de ter duas reservas no mesmo dia", async () => {
      const desks = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`);
      const outroDesk = desks.body[1].id;

      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ desk_id: outroDesk, date: tomorrow });
      expect(res.status).toBe(409);
    });

    it("rejeita reserva para data passada", async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ desk_id: deskId, date: yesterday });
      expect(res.status).toBe(400);
    });

    it("rejeita sem autenticacao", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send({ desk_id: deskId, date: tomorrow });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/bookings", () => {
    it("retorna reservas por data", async () => {
      const res = await request(app)
        .get(`/api/bookings?date=${tomorrow}`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("exige parametro date", async () => {
      const res = await request(app)
        .get("/api/bookings")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/bookings/mine", () => {
    it("retorna reservas do usuario autenticado", async () => {
      const res = await request(app)
        .get("/api/bookings/mine")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/bookings/all", () => {
    it("admin acessa todas as reservas", async () => {
      const res = await request(app)
        .get("/api/bookings/all")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe("number");
      expect(typeof res.body.page).toBe("number");
      expect(typeof res.body.pages).toBe("number");
    });

    it("usuario comum nao acessa", async () => {
      const res = await request(app)
        .get("/api/bookings/all")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/bookings/:id", () => {
    it("usuario cancela sua propria reserva", async () => {
      const mine = await request(app)
        .get("/api/bookings/mine")
        .set("Authorization", `Bearer ${userToken}`);
      const bookingId = mine.body[0].id;

      const res = await request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("usuario nao pode cancelar reserva de outro", async () => {
      // Admin cria uma reserva
      const desks = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`);
      const nextDesk = desks.body[2].id;

      const booking = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ desk_id: nextDesk, date: tomorrow });

      const res = await request(app)
        .delete(`/api/bookings/${booking.body.id}`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
