process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

const request = require("supertest");
const app = require("../server");

// Get a weekday date N weekdays from now (skipping weekends)
function nextWeekday(n = 1) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++;
  }
  return d.toISOString().split("T")[0];
}

// Get Mon-Fri of the week containing dateStr
function weekOf(dateStr) {
  const ref = new Date(dateStr + "T12:00:00Z");
  const dow = ref.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(ref);
  mon.setUTCDate(ref.getUTCDate() + diffToMon);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });
}

let adminToken, tiToken, tiUserId;
const day1 = nextWeekday(1);
const day2 = nextWeekday(2);
const day3 = nextWeekday(3);

// Ensure all 3 days are in the same week for home office limit test
const week = weekOf(day1);
const [w1, w2, w3] = week; // Mon, Tue, Wed of that week

beforeAll(async () => {
  const admin = await request(app).post("/api/auth/register").send({
    name: "Admin TI",
    email: "admin@ti.com",
    password: "123456",
  });
  adminToken = admin.body.token;

  const ti = await request(app).post("/api/auth/register").send({
    name: "Membro TI",
    email: "ti@ti.com",
    password: "123456",
  });
  tiToken = ti.body.token;
  tiUserId = ti.body.user.id;

  // Grant TI role
  await request(app)
    .put(`/api/users/${tiUserId}/toggle-ti`)
    .set("Authorization", `Bearer ${adminToken}`);
  // Re-login to get token with is_ti = 1
  const login = await request(app).post("/api/auth/login").send({
    email: "ti@ti.com",
    password: "123456",
  });
  tiToken = login.body.token;
});

describe("TI Schedule", () => {
  describe("POST /api/ti/schedule — usuario TI", () => {
    it("declara home office num dia util", async () => {
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: w1, location: "home" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("declara sp num segundo dia util", async () => {
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: w2, location: "sp" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("rejeita fin de semana", async () => {
      // Find next Saturday
      const ref = new Date(w1 + "T12:00:00Z");
      ref.setUTCDate(ref.getUTCDate() + (6 - ref.getUTCDay()));
      const sat = ref.toISOString().split("T")[0];
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: sat, location: "home" });
      expect(res.status).toBe(400);
    });

    it("limite de 2 home offices por semana", async () => {
      // w1 already set as home; now set w3 as home too (2nd home)
      await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: w3, location: "home" });

      // Try a 4th day in same week as 3rd home → should fail
      const w4 = week[3]; // Thursday
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: w4, location: "home" });
      expect(res.status).toBe(409);
    });

    it("rejeita data além de 4 semanas", async () => {
      const far = new Date();
      far.setUTCDate(far.getUTCDate() + 35);
      // Move to weekday
      while (far.getUTCDay() === 0 || far.getUTCDay() === 6) far.setUTCDate(far.getUTCDate() + 1);
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ date: far.toISOString().split("T")[0], location: "sp" });
      expect(res.status).toBe(400);
    });

    it("usuario comum sem acesso", async () => {
      const user = await request(app).post("/api/auth/register").send({
        name: "Comum",
        email: "comum@ti.com",
        password: "123456",
      });
      const res = await request(app)
        .post("/api/ti/schedule")
        .set("Authorization", `Bearer ${user.body.token}`)
        .send({ date: w2, location: "sp" });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/ti/schedule", () => {
    it("retorna programação da semana", async () => {
      const res = await request(app)
        .get(`/api/ti/schedule?week=${w1}`)
        .set("Authorization", `Bearer ${tiToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.days)).toBe(true);
      expect(res.body.days.length).toBe(5);
      expect(Array.isArray(res.body.members)).toBe(true);
    });

    it("rejeita sem parametro week", async () => {
      const res = await request(app)
        .get("/api/ti/schedule")
        .set("Authorization", `Bearer ${tiToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/ti/schedule/:date", () => {
    it("remove declaração de um dia", async () => {
      const res = await request(app)
        .delete(`/api/ti/schedule/${w2}`)
        .set("Authorization", `Bearer ${tiToken}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Admin TI routes", () => {
    it("admin define localização para membro TI", async () => {
      const res = await request(app)
        .post("/api/ti/admin/schedule")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ user_id: tiUserId, date: w2, location: "itaqua" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.location).toBe("itaqua");
    });

    it("admin rejeita membro não-TI", async () => {
      const other = await request(app).post("/api/auth/register").send({
        name: "Nao TI",
        email: "naoti@ti.com",
        password: "123456",
      });
      const res = await request(app)
        .post("/api/ti/admin/schedule")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ user_id: other.body.user.id, date: w2, location: "sp" });
      expect(res.status).toBe(404);
    });

    it("admin remove localização de membro TI", async () => {
      const res = await request(app)
        .delete(`/api/ti/admin/schedule/${tiUserId}/${w2}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("usuario comum não acessa rotas admin TI", async () => {
      const user = await request(app).post("/api/auth/register").send({
        name: "NaoAdmin",
        email: "naoadmin@ti.com",
        password: "123456",
      });
      const res = await request(app)
        .post("/api/ti/admin/schedule")
        .set("Authorization", `Bearer ${user.body.token}`)
        .send({ user_id: tiUserId, date: w2, location: "sp" });
      expect(res.status).toBe(403);
    });
  });

  describe("Bookings — regras de negócio", () => {
    it("rejeita reserva em fim de semana", async () => {
      const ref = new Date(w1 + "T12:00:00Z");
      ref.setUTCDate(ref.getUTCDate() + (6 - ref.getUTCDay()));
      const sat = ref.toISOString().split("T")[0];
      const desks = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${tiToken}`);
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${tiToken}`)
        .send({ desk_id: desks.body[0].id, date: sat });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/ti/export (admin)", () => {
    it("exporta CSV com dados de programação TI", async () => {
      const res = await request(app)
        .get("/api/ti/export")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
    });

    it("usuario comum nao acessa export", async () => {
      const user = await request(app).post("/api/auth/register").send({
        name: "ExportUser",
        email: "exportuser@ti.com",
        password: "123456",
      });
      const res = await request(app)
        .get("/api/ti/export")
        .set("Authorization", `Bearer ${user.body.token}`);
      expect(res.status).toBe(403);
    });
  });
});
