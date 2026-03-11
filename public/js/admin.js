const user = requireAuth(true);
if (user) document.getElementById("user-name").textContent = user.name;

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll("[id^='tab-']").forEach((el) => {
    el.style.display = el.id === `tab-${tab}` ? "" : "none";
  });
  if (tab === "bookings") loadBookings();
  else if (tab === "desks") loadDesks();
  else if (tab === "users") loadUsers();
  else if (tab === "dashboard") loadDashboard();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const cardsEl = document.getElementById("dashboard-cards");
  const chartByDesk = document.getElementById("chart-by-desk");
  const chartByDay = document.getElementById("chart-by-day");

  cardsEl.innerHTML = '<p class="empty-state">Carregando...</p>';

  try {
    const stats = await API.get("/bookings/stats");

    const { totalLast30, peakDesk, byDesk, byDayOfWeek, activeDeskCount } = stats;

    // Working days in last 30 days ≈ 22
    const WORKING_DAYS = 22;
    const maxPossible = activeDeskCount * WORKING_DAYS;
    const occupancyPct = maxPossible > 0 ? Math.round((totalLast30 / maxPossible) * 100) : 0;

    // Summary cards
    cardsEl.innerHTML = `
      <div class="dashboard-card">
        <div class="dashboard-card-value">${totalLast30}</div>
        <div class="dashboard-card-label">Reservas nos últimos 30 dias</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-card-value" style="font-size:1.1rem">${peakDesk || "—"}</div>
        <div class="dashboard-card-label">Mesa mais reservada</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-card-value">${occupancyPct}%</div>
        <div class="dashboard-card-label">Taxa de ocupação média</div>
      </div>
    `;

    // Chart: by desk
    if (byDesk.length === 0) {
      chartByDesk.innerHTML = '<p class="empty-state">Sem dados</p>';
    } else {
      const maxTotal = byDesk[0].total;
      chartByDesk.innerHTML = byDesk
        .map((r) => {
          const pct = maxTotal > 0 ? Math.round((r.total / maxTotal) * 100) : 0;
          return `
          <div class="progress-row">
            <div class="progress-label">${r.desk_name}</div>
            <div class="progress-bar-wrap">
              <div class="progress-bar" style="width:${pct}%"></div>
            </div>
            <div class="progress-count">${r.total}</div>
          </div>`;
        })
        .join("");
    }

    // Chart: by day of week (Mon-Fri only)
    const weekdayData = byDayOfWeek.filter((r) => r.dow >= 1 && r.dow <= 5);
    if (weekdayData.length === 0) {
      chartByDay.innerHTML = '<p class="empty-state">Sem dados</p>';
    } else {
      const maxDay = Math.max(...weekdayData.map((r) => r.total));
      chartByDay.innerHTML = weekdayData
        .map((r) => {
          const pct = maxDay > 0 ? Math.round((r.total / maxDay) * 100) : 0;
          return `
          <div class="progress-row">
            <div class="progress-label">${r.day}</div>
            <div class="progress-bar-wrap">
              <div class="progress-bar progress-bar-day" style="width:${pct}%"></div>
            </div>
            <div class="progress-count">${r.total}</div>
          </div>`;
        })
        .join("");
    }
  } catch (err) {
    cardsEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
async function loadBookings() {
  const tbody = document.getElementById("bookings-body");
  try {
    const bookings = await API.get("/bookings/all");
    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma reserva</td></tr>';
      return;
    }
    tbody.innerHTML = bookings
      .map(
        (b) => `
      <tr>
        <td>${formatDate(b.date)}</td>
        <td>${b.desk_name}</td>
        <td>${b.user_name}</td>
        <td><button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancelar</button></td>
      </tr>
    `
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${err.message}</td></tr>`;
  }
}

async function cancelBooking(id) {
  if (!confirm("Cancelar esta reserva?")) return;
  try {
    await API.delete(`/bookings/${id}`);
    showToast("Reserva cancelada");
    loadBookings();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
async function exportCSV() {
  const from = document.getElementById("export-from").value;
  const to = document.getElementById("export-to").value;

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const token = API.getToken();
  const url = `/api/bookings/export${params.toString() ? "?" + params.toString() : ""}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Erro ao exportar", "error");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reservas.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Desks ────────────────────────────────────────────────────────────────────
async function loadDesks() {
  const tbody = document.getElementById("desks-body");
  try {
    const desks = await API.get("/desks");
    tbody.innerHTML = desks
      .map(
        (d) => `
      <tr>
        <td>${d.name}</td>
        <td>Col ${d.pos_x}, Lin ${d.pos_y}</td>
        <td>
          <span class="badge ${d.is_active ? "badge-success" : "badge-gray"}">
            ${d.is_active ? "Ativa" : "Inativa"}
          </span>
        </td>
        <td style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="toggleDesk(${d.id}, ${d.is_active})">
            ${d.is_active ? "Desativar" : "Ativar"}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteDesk(${d.id}, '${d.name.replace(/'/g, "\\'")}')">Excluir</button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${err.message}</td></tr>`;
  }
}

async function toggleDesk(id, currentActive) {
  try {
    await API.put(`/desks/${id}`, { is_active: currentActive ? 0 : 1 });
    loadDesks();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteDesk(id, name) {
  if (!confirm(`Excluir "${name}"? Todas as reservas desta mesa serão canceladas.`)) return;
  try {
    await API.delete(`/desks/${id}`);
    showToast("Mesa excluída");
    loadDesks();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showAddDesk() {
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.getElementById("new-desk-name").value = "";
  document.getElementById("new-desk-x").value = "";
  document.getElementById("new-desk-y").value = "";
}

async function submitAddDesk() {
  const name = document.getElementById("new-desk-name").value.trim();
  const pos_x = parseInt(document.getElementById("new-desk-x").value);
  const pos_y = parseInt(document.getElementById("new-desk-y").value);
  if (!name || !pos_x || !pos_y) {
    showToast("Preencha todos os campos", "error");
    return;
  }
  try {
    await API.post("/desks", { name, pos_x, pos_y });
    showToast("Mesa criada");
    closeModal();
    loadDesks();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById("users-body");
  try {
    const users = await API.get("/users");
    tbody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>
          <span class="badge ${u.is_admin ? "badge-blue" : "badge-gray"}">
            ${u.is_admin ? "Admin" : "Usuário"}
          </span>
        </td>
        <td style="display:flex;gap:.5rem;flex-wrap:wrap;">
          ${
            u.id !== user.id
              ? `
            <button class="btn btn-ghost btn-sm" onclick="toggleAdmin(${u.id}, ${u.is_admin})">
              ${u.is_admin ? "Remover Admin" : "Tornar Admin"}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${u.name.replace(/'/g, "\\'")}')">Excluir</button>
          `
              : '<span style="color:var(--text-muted);font-size:.8rem">Você</span>'
          }
        </td>
      </tr>
    `
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${err.message}</td></tr>`;
  }
}

async function toggleAdmin(id, currentAdmin) {
  try {
    await API.put(`/users/${id}/toggle-admin`);
    showToast(currentAdmin ? "Admin removido" : "Usuário promovido a admin");
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Excluir usuário "${name}"? Todas as reservas dele serão canceladas.`)) return;
  try {
    await API.delete(`/users/${id}`);
    showToast("Usuário excluído");
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadDashboard();
