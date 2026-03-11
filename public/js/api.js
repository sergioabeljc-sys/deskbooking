const API = {
  getToken: () => localStorage.getItem("token"),
  getRefreshToken: () => localStorage.getItem("refreshToken"),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  },

  setSession(token, user, refreshToken) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
  },

  clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("refreshToken");
  },

  async _tryRefresh() {
    const refreshToken = API.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      API.setSession(data.token, data.user, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  },

  async _parseJSON(res) {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`Servidor retornou resposta inesperada (HTTP ${res.status}). Verifique a configuração do servidor.`);
    }
    return res.json();
  },

  async fetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API.getToken()}`,
        ...options.headers,
      },
    });

    if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
      const refreshed = await API._tryRefresh();
      if (refreshed) {
        const retry = await fetch(`/api${path}`, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API.getToken()}`,
            ...options.headers,
          },
        });
        const retryData = await API._parseJSON(retry);
        if (!retry.ok) throw new Error(retryData.error || "Erro desconhecido");
        return retryData;
      } else {
        API.clearSession();
        window.location.href = "/";
        return;
      }
    }

    const data = await API._parseJSON(res);
    if (!res.ok) throw new Error(data.error || "Erro desconhecido");
    return data;
  },

  get: (path) => API.fetch(path),
  post: (path, body) => API.fetch(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => API.fetch(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => API.fetch(path, { method: "DELETE" }),
};

function requireAuth(adminOnly = false) {
  const user = API.getUser();
  if (!user || !API.getToken()) {
    window.location.href = "/";
    return null;
  }
  if (adminOnly && !user.is_admin) {
    window.location.href = "/app.html";
    return null;
  }
  return user;
}

async function logout() {
  const refreshToken = API.getRefreshToken();
  if (refreshToken) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {}
  }
  API.clearSession();
  window.location.href = "/";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function showToast(message, type = "success") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
