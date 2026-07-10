const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "WorkPlace API",
    version: "1.0.0",
    description: "API para o sistema de agendamento de mesas de escritório.",
  },
  servers: [{ url: "/api", description: "API base" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          is_admin: { type: "integer", enum: [0, 1] },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      Desk: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          pos_x: { type: "integer" },
          pos_y: { type: "integer" },
          is_active: { type: "integer", enum: [0, 1] },
        },
      },
      Booking: {
        type: "object",
        properties: {
          id: { type: "integer" },
          user_id: { type: "integer" },
          desk_id: { type: "integer" },
          date: { type: "string", format: "date", example: "2026-03-11" },
          user_name: { type: "string" },
          desk_name: { type: "string" },
          created_at: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      BookingStats: {
        type: "object",
        properties: {
          byDesk: {
            type: "array",
            items: {
              type: "object",
              properties: {
                desk_name: { type: "string" },
                total: { type: "integer" },
                dates: { type: "array", items: { type: "string" } },
              },
            },
          },
          byDayOfWeek: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string" },
                dow: { type: "integer" },
                total: { type: "integer" },
              },
            },
          },
          totalLast30: { type: "integer" },
          peakDesk: { type: "string", nullable: true },
          activeDeskCount: { type: "integer" },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registrar novo usuário",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", example: "João Silva" },
                  email: { type: "string", format: "email", example: "joao@empresa.com" },
                  password: { type: "string", minLength: 6, example: "senha123" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Usuário criado", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          400: { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "E-mail já cadastrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Login bem-sucedido", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          400: { description: "Campos obrigatórios", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Credenciais inválidas", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Retorna dados do usuário autenticado",
        responses: {
          200: { description: "Dados do usuário", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          401: { description: "Não autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/profile": {
      put: {
        tags: ["Auth"],
        summary: "Atualizar perfil do usuário autenticado",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  confirmPassword: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Perfil atualizado — retorna novo token", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          400: { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "E-mail já cadastrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/desks": {
      get: {
        tags: ["Desks"],
        summary: "Listar todas as mesas",
        responses: {
          200: { description: "Lista de mesas", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Desk" } } } } },
        },
      },
      post: {
        tags: ["Desks"],
        summary: "Criar nova mesa (admin)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "pos_x", "pos_y"],
                properties: {
                  name: { type: "string", example: "Mesa 13" },
                  pos_x: { type: "integer", minimum: 1 },
                  pos_y: { type: "integer", minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Mesa criada", content: { "application/json": { schema: { $ref: "#/components/schemas/Desk" } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/desks/{id}": {
      put: {
        tags: ["Desks"],
        summary: "Atualizar mesa (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  pos_x: { type: "integer" },
                  pos_y: { type: "integer" },
                  is_active: { type: "integer", enum: [0, 1] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Mesa atualizada", content: { "application/json": { schema: { $ref: "#/components/schemas/Desk" } } } },
          404: { description: "Mesa não encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        tags: ["Desks"],
        summary: "Excluir mesa (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Mesa excluída", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Mesa não encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/bookings": {
      get: {
        tags: ["Bookings"],
        summary: "Listar reservas por data",
        parameters: [{ name: "date", in: "query", required: true, schema: { type: "string", format: "date" } }],
        responses: {
          200: { description: "Reservas da data", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Booking" } } } } },
          400: { description: "Data obrigatória", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        tags: ["Bookings"],
        summary: "Criar reserva",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["desk_id", "date"],
                properties: {
                  desk_id: { type: "integer" },
                  date: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Reserva criada", content: { "application/json": { schema: { $ref: "#/components/schemas/Booking" } } } },
          400: { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Conflito de reserva", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/bookings/mine": {
      get: {
        tags: ["Bookings"],
        summary: "Minhas reservas futuras",
        responses: {
          200: { description: "Reservas do usuário autenticado", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Booking" } } } } },
        },
      },
    },
    "/bookings/all": {
      get: {
        tags: ["Bookings"],
        summary: "Todas as reservas (admin)",
        responses: {
          200: { description: "Todas as reservas", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Booking" } } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/bookings/export": {
      get: {
        tags: ["Bookings"],
        summary: "Exportar reservas em CSV (admin)",
        parameters: [
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: { description: "Arquivo CSV com as reservas", content: { "text/csv": { schema: { type: "string" } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/bookings/stats": {
      get: {
        tags: ["Bookings"],
        summary: "Dashboard de ocupação — últimos 30 dias (admin)",
        responses: {
          200: { description: "Estatísticas de ocupação", content: { "application/json": { schema: { $ref: "#/components/schemas/BookingStats" } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/bookings/{id}": {
      delete: {
        tags: ["Bookings"],
        summary: "Cancelar reserva",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Reserva cancelada", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Reserva não encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/users": {
      get: {
        tags: ["Users"],
        summary: "Listar usuários (admin)",
        responses: {
          200: { description: "Lista de usuários", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/User" } } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/users/{id}/toggle-admin": {
      put: {
        tags: ["Users"],
        summary: "Alternar role admin de um usuário (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Role alternada", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/users/{id}": {
      delete: {
        tags: ["Users"],
        summary: "Excluir usuário (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Usuário excluído", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          403: { description: "Sem permissão", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Usuário não encontrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
