process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";

// Mock do módulo db antes de importar rbac
jest.mock("../db", () => {
  const mockDb = {
    prepare: jest.fn(),
  };
  return mockDb;
});

const db = require("../db");
const { requireRole, requireDepartmentAccess, requireOwnerOrAdmin } = require("../middleware/rbac");

// Helpers para criar req/res/next mock
function mockReq(userId = 1) {
  return { user: { id: userId } };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return jest.fn();
}

// Helper para configurar db.prepare com retorno específico
function mockPrepare(returnValue) {
  const stmt = { get: jest.fn().mockReturnValue(returnValue) };
  db.prepare.mockReturnValue(stmt);
  return stmt;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── requireRole('admin') ─────────────────────────────────────────────────────

describe("requireRole('admin')", () => {
  it("chama next() para usuário admin", () => {
    mockPrepare({ is_admin: 1 });
    const req = mockReq(1);
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("retorna 403 para usuário não-admin", () => {
    mockPrepare({ is_admin: 0 });
    const req = mockReq(2);
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 quando usuário não existe no banco", () => {
    mockPrepare(null);
    const req = mockReq(999);
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 para role desconhecida", () => {
    const req = mockReq(1);
    const res = mockRes();
    const next = mockNext();

    requireRole("superuser")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("consulta is_admin no banco (não confia apenas no JWT)", () => {
    const stmt = mockPrepare({ is_admin: 1 });
    const req = mockReq(1);
    requireRole("admin")(req, mockRes(), mockNext());
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("SELECT is_admin FROM users WHERE id = ?")
    );
    expect(stmt.get).toHaveBeenCalledWith(1);
  });
});

// ─── requireDepartmentAccess() ────────────────────────────────────────────────

describe("requireDepartmentAccess()", () => {
  it("chama next() para usuário de departamento habilitado", () => {
    db.prepare
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ department: "RH" }) })
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ can_book_spot: 1 }) });

    const req = mockReq(1);
    const res = mockRes();
    const next = mockNext();

    requireDepartmentAccess()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("retorna 403 para departamento com can_book_spot = 0", () => {
    db.prepare
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ department: "TI" }) })
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ can_book_spot: 0 }) });

    const req = mockReq(2);
    const res = mockRes();
    const next = mockNext();

    requireDepartmentAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 para usuário sem departamento definido", () => {
    db.prepare
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ department: null }) });

    const req = mockReq(3);
    const res = mockRes();
    const next = mockNext();

    requireDepartmentAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("departamento") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 quando departamento não existe na tabela departments", () => {
    db.prepare
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ department: "Fantasma" }) })
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue(null) });

    const req = mockReq(4);
    const res = mockRes();
    const next = mockNext();

    requireDepartmentAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("consulta tabela departments no banco (não usa payload do JWT)", () => {
    db.prepare
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ department: "Auditoria" }) })
      .mockReturnValueOnce({ get: jest.fn().mockReturnValue({ can_book_spot: 1 }) });

    requireDepartmentAccess()(mockReq(1), mockRes(), mockNext());

    expect(db.prepare).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT department FROM users WHERE id = ?")
    );
    expect(db.prepare).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SELECT can_book_spot FROM departments WHERE name = ?")
    );
  });
});

// ─── requireOwnerOrAdmin() ────────────────────────────────────────────────────

describe("requireOwnerOrAdmin(getResourceUserId)", () => {
  it("chama next() para admin (mesmo sem ser dono)", () => {
    mockPrepare({ is_admin: 1 });
    const req = mockReq(1);
    const res = mockRes();
    const next = mockNext();

    requireOwnerOrAdmin(() => 99)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("chama next() para o dono do recurso (não-admin)", () => {
    mockPrepare({ is_admin: 0 });
    const req = mockReq(5);
    const res = mockRes();
    const next = mockNext();

    requireOwnerOrAdmin(() => 5)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("retorna 403 para usuário que não é dono nem admin", () => {
    mockPrepare({ is_admin: 0 });
    const req = mockReq(5);
    const res = mockRes();
    const next = mockNext();

    requireOwnerOrAdmin(() => 99)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 quando getResourceUserId retorna null", () => {
    mockPrepare({ is_admin: 0 });
    const req = mockReq(5);
    const res = mockRes();
    const next = mockNext();

    requireOwnerOrAdmin(() => null)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("consulta is_admin no banco para verificar permissão de admin", () => {
    const stmt = mockPrepare({ is_admin: 1 });
    requireOwnerOrAdmin(() => 99)(mockReq(1), mockRes(), mockNext());
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("SELECT is_admin FROM users WHERE id = ?")
    );
    expect(stmt.get).toHaveBeenCalledWith(1);
  });
});
