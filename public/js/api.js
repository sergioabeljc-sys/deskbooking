const API = {
  getToken: () => localStorage.getItem("token"),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
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
    const data = await res.json();
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

function logout() {
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
