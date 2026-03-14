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
  else if (tab === "ti") loadTiSchedule();
  else if (tab === "dashboard") loadDashboard();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const PIE_COLORS = [
  "#2563eb","#16a34a","#dc2626","#d97706","#7c3aed",
  "#0891b2","#be185d","#65a30d","#ea580c","#0284c7",
];

// Tooltip singleton
let pieTooltip = null;
function getPieTooltip() {
  if (!pieTooltip) {
    pieTooltip = document.createElement("div");
    pieTooltip.id = "pie-tooltip";
    pieTooltip.className = "pie-tooltip";
    document.body.appendChild(pieTooltip);
  }
  return pieTooltip;
}

function renderPieChart(data, containerId) {
  const el = document.getElementById(containerId);
  if (!data || data.length === 0) {
    el.innerHTML = '<p class="empty-state">Sem dados</p>';
    return;
  }

  const total = data.reduce((sum, d) => sum + d.total, 0);
  const cx = 90, cy = 90, r = 80;
  let angle = -Math.PI / 2;
  let paths = "";

  data.forEach((item, i) => {
    const slice = (item.total / total) * 2 * Math.PI;
    const end = angle + slice;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = slice > Math.PI ? 1 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];

    if (data.length === 1) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" data-idx="${i}"/>`;
    } else {
      paths += `<path d="M${cx},${cy}L${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}Z" fill="${color}" data-idx="${i}"/>`;
    }
    angle = end;
  });

  const legend = data.map((item, i) => {
    const pct = Math.round((item.total / total) * 100);
    const color = PIE_COLORS[i % PIE_COLORS.length];
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span class="pie-legend-name">${escapeHtml(item.user_name)}</span>
      <span class="pie-legend-count">${item.total} <span style="color:var(--text-muted)">(${pct}%)</span></span>
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="pie-chart-wrap">
      <svg viewBox="0 0 180 180" width="180" height="180" style="flex-shrink:0;cursor:pointer">${paths}</svg>
      <div class="pie-legend">${legend}</div>
    </div>`;

  // Attach tooltip events after render
  const tooltip = getPieTooltip();
  el.querySelectorAll("path[data-idx], circle[data-idx]").forEach((shape) => {
    const idx = parseInt(shape.getAttribute("data-idx"), 10);
    const item = data[idx];
    const pct = Math.round((item.total / total) * 100);
    const label = `${item.user_name}: ${item.total} reserva(s) — ${pct}%`;

    shape.addEventListener("mouseenter", (e) => {
      shape.style.opacity = "0.82";
      tooltip.textContent = label;
      tooltip.classList.add("visible");
    });
    shape.addEventListener("mousemove", (e) => {
      tooltip.style.left = (e.clientX + 14) + "px";
      tooltip.style.top  = (e.clientY - 32) + "px";
    });
    shape.addEventListener("mouseleave", () => {
      shape.style.opacity = "";
      tooltip.classList.remove("visible");
    });
  });
}

async function loadDashboard() {
  const cardsEl = document.getElementById("dashboard-cards");
  const chartByDesk = document.getElementById("chart-by-desk");
  const chartByDay = document.getElementById("chart-by-day");

  const chartByUser = document.getElementById("chart-by-user");

  cardsEl.innerHTML = '<p class="empty-state">Carregando...</p>';
  chartByDesk.innerHTML = '<p class="empty-state">Carregando...</p>';
  chartByDay.innerHTML = '<p class="empty-state">Carregando...</p>';
  chartByUser.innerHTML = '<p class="empty-state">Carregando...</p>';

  try {
    const stats = await API.get("/bookings/stats");

    const { totalLast30, peakDesk, byDesk, byDayOfWeek, byUser, activeDeskCount } = stats;

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
    renderPieChart(byUser, "chart-by-user");

  } catch (err) {
    const msg = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    cardsEl.innerHTML = msg;
    chartByDesk.innerHTML = msg;
    chartByDay.innerHTML = msg;
    chartByUser.innerHTML = msg;
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
let bookingsPage = 1;

async function loadBookings(page) {
  if (page !== undefined) bookingsPage = page;
  const tbody = document.getElementById("bookings-body");
  try {
    const result = await API.get(`/bookings/all?page=${bookingsPage}&limit=50`);
    const bookings = result.data;
    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma reserva</td></tr>';
    } else {
      tbody.innerHTML = bookings
        .map(
          (b) => `
        <tr>
          <td>${formatDate(b.date)}</td>
          <td>${escapeHtml(b.desk_name)}</td>
          <td>${escapeHtml(b.user_name)}</td>
          <td><button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancelar</button></td>
        </tr>
      `
        )
        .join("");
    }

    // Pagination controls
    const paginationId = "bookings-pagination";
    let paginationEl = document.getElementById(paginationId);
    if (!paginationEl) {
      paginationEl = document.createElement("div");
      paginationEl.id = paginationId;
      paginationEl.style.cssText = "display:flex;gap:.5rem;align-items:center;margin-top:.75rem;";
      tbody.closest("table").insertAdjacentElement("afterend", paginationEl);
    }
    paginationEl.innerHTML = `
      <span style="color:var(--text-muted);font-size:.875rem">Total: ${result.total} reservas | Página ${result.page} de ${result.pages}</span>
      <button class="btn btn-ghost btn-sm" onclick="loadBookings(${bookingsPage - 1})" ${bookingsPage <= 1 ? "disabled" : ""}>Anterior</button>
      <button class="btn btn-ghost btn-sm" onclick="loadBookings(${bookingsPage + 1})" ${bookingsPage >= result.pages ? "disabled" : ""}>Próximo</button>
    `;
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
        <td>${escapeHtml(d.name)}</td>
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
          <button class="btn btn-danger btn-sm" data-id="${d.id}" data-name="${escapeHtml(d.name)}" onclick="deleteDesk(+this.dataset.id, this.dataset.name)">Excluir</button>
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
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <span class="badge ${u.is_admin ? "badge-blue" : "badge-gray"}">
            ${u.is_admin ? "Admin" : "Usuário"}
          </span>
        </td>
        <td>
          ${u.is_ti ? '<span class="badge badge-blue">TI</span>' : '<span class="badge badge-gray">—</span>'}
        </td>
        <td style="display:flex;gap:.5rem;flex-wrap:wrap;">
          ${
            u.id !== user.id
              ? `
            <button class="btn btn-ghost btn-sm" onclick="toggleAdmin(${u.id}, ${u.is_admin})">
              ${u.is_admin ? "Remover Admin" : "Tornar Admin"}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="toggleTi(${u.id}, ${u.is_ti})" style="color:${u.is_ti ? 'var(--primary)' : 'var(--text-muted)'}">
              ${u.is_ti ? "Remover TI" : "Equipe TI"}
            </button>
            <button class="btn btn-danger btn-sm" data-id="${u.id}" data-name="${escapeHtml(u.name)}" onclick="deleteUser(+this.dataset.id, this.dataset.name)">Excluir</button>
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

async function toggleTi(id, currentTi) {
  try {
    await API.put(`/users/${id}/toggle-ti`);
    showToast(currentTi ? "Removido da equipe TI" : "Adicionado à equipe TI");
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
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

// ─── TI Schedule (admin view) ──────────────────────────────────────────────────
const TI_DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TI_LOCATION = {
  home:   { icon: "🏠", label: "Home Office" },
  sp:     { icon: "🏢", label: "SP" },
  itaqua: { icon: "🏭", label: "Itaquá" },
};

let tiAdminWeekMonday = tiGetWeekMonday(new Date());

function tiGetWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function tiAddDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function tiToISO(d) { return d.toISOString().split("T")[0]; }
function tiFmt(d) {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function tiWeekNav(delta) {
  tiAdminWeekMonday = tiAddDays(tiAdminWeekMonday, delta * 7);
  loadTiSchedule();
}

function tiGoCurrentWeek() {
  tiAdminWeekMonday = tiGetWeekMonday(new Date());
  loadTiSchedule();
}

async function loadTiSchedule() {
  const grid = document.getElementById("ti-admin-grid");
  grid.innerHTML = '<p style="padding:1.5rem;color:var(--text-muted)">Carregando...</p>';

  const monday = tiAdminWeekMonday;
  const friday = tiAddDays(monday, 4);
  document.getElementById("ti-week-label").textContent =
    `${tiFmt(monday)} – ${tiFmt(friday)} de ${friday.getFullYear()}`;

  try {
    const data = await API.get(`/ti/schedule?week=${tiToISO(monday)}`);
    renderTiAdminGrid(data);
  } catch (err) {
    grid.innerHTML = `<p style="padding:1.5rem;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

// Estado do picker TI admin
let tiPickerUserId = null, tiPickerUserName = null, tiPickerDate = null, tiPickerCurrentLoc = null;

function renderTiAdminGrid({ days, members }) {
  const today = new Date().toISOString().split("T")[0];

  if (members.length === 0) {
    document.getElementById("ti-admin-grid").innerHTML =
      '<p style="padding:1.5rem;color:var(--text-muted)">Nenhum membro TI cadastrado.</p>';
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse;font-size:.875rem">';
  html += '<thead><tr>';
  html += '<th style="padding:.625rem .75rem;border-bottom:2px solid var(--border);text-align:left;color:var(--text-muted);font-size:.8125rem;min-width:130px">Membro</th>';
  days.forEach((iso, i) => {
    const isToday = iso === today;
    const isPast = iso < today;
    html += `<th style="padding:.625rem .5rem;border-bottom:2px solid var(--border);text-align:center;color:${isToday ? "var(--primary)" : "var(--text-muted)"};font-size:.8125rem;opacity:${isPast ? ".55" : "1"}">
      <div style="font-weight:700;text-transform:uppercase">${TI_DAY_NAMES[i]}</div>
      <div style="font-weight:400;font-size:.7rem">${tiFmt(new Date(iso + "T12:00:00"))}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  members.forEach((member) => {
    html += '<tr>';
    html += `<td style="padding:.625rem .75rem;border-bottom:1px solid var(--border);white-space:nowrap;font-weight:500">${escapeHtml(member.name)}</td>`;
    days.forEach((iso) => {
      const loc = member.schedule[iso];
      const isPast = iso < today;
      let inner = loc
        ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span style="font-size:1.1rem">${TI_LOCATION[loc].icon}</span>
            <span style="font-size:.65rem;color:var(--text-muted)">${TI_LOCATION[loc].label}</span>
           </div>`
        : `<span style="color:var(--border);font-size:.9rem">—</span>`;
      if (!isPast) {
        html += `<td class="ti-admin-cell" data-uid="${member.id}" data-uname="${escapeHtml(member.name)}" data-date="${iso}" data-loc="${loc||""}"
          style="border-bottom:1px solid var(--border);padding:.375rem .25rem;text-align:center;cursor:pointer;transition:background .12s"
          title="Editar localização de ${escapeHtml(member.name)}">${inner}</td>`;
      } else {
        html += `<td style="border-bottom:1px solid var(--border);padding:.375rem .25rem;text-align:center;opacity:${!loc ? ".35" : ".65"}">${inner}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById("ti-admin-grid").innerHTML = html;

  document.querySelectorAll(".ti-admin-cell").forEach((cell) => {
    cell.addEventListener("mouseenter", () => { cell.style.background = "var(--bg)"; });
    cell.addEventListener("mouseleave", () => { cell.style.background = ""; });
    cell.addEventListener("click", () => {
      openTiPicker(+cell.dataset.uid, cell.dataset.uname, cell.dataset.date, cell.dataset.loc || null);
    });
  });
}

function openTiPicker(userId, userName, date, currentLoc) {
  tiPickerUserId = userId;
  tiPickerUserName = userName;
  tiPickerDate = date;
  tiPickerCurrentLoc = currentLoc;
  const [y, m, d] = date.split("-");
  document.getElementById("ti-picker-title").textContent = `${userName} — ${d}/${m}/${y}`;
  document.getElementById("ti-picker-clear").style.display = currentLoc ? "" : "none";
  document.getElementById("ti-location-picker").style.display = "flex";
}

function closeTiPicker(e) {
  if (e && e.target !== document.getElementById("ti-location-picker")) return;
  document.getElementById("ti-location-picker").style.display = "none";
}

async function adminSetLocation(location) {
  document.getElementById("ti-location-picker").style.display = "none";
  try {
    const result = await API.fetch(`/ti/admin/schedule`, {
      method: "POST",
      body: JSON.stringify({ user_id: tiPickerUserId, date: tiPickerDate, location }),
    });
    if (location === "sp" && !result.hasBooking) {
      await openDeskPicker();
    } else {
      const msg = result.bookingCancelled ? " — reserva de mesa cancelada" : "";
      showToast(`${TI_LOCATION[location].icon} ${TI_LOCATION[location].label} marcado para ${tiPickerUserName}${msg}`);
      loadTiSchedule();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function adminClearLocation() {
  document.getElementById("ti-location-picker").style.display = "none";
  try {
    const result = await API.delete(`/ti/admin/schedule/${tiPickerUserId}/${tiPickerDate}`);
    const msg = result.bookingCancelled ? " — reserva de mesa cancelada" : "";
    showToast(`Declaração removida para ${tiPickerUserName}${msg}`);
    loadTiSchedule();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Picker de mesa para reservar em nome do membro
async function openDeskPicker() {
  try {
    const [desks, bookings] = await Promise.all([
      API.get("/desks"),
      API.get(`/bookings?date=${tiPickerDate}`),
    ]);
    const bookedIds = new Set(bookings.map((b) => b.desk_id));
    const available = desks.filter((d) => d.is_active && !bookedIds.has(d.id));

    const [y, m, d] = tiPickerDate.split("-");
    document.getElementById("ti-desk-picker-title").textContent =
      `Reservar mesa para ${tiPickerUserName} — ${d}/${m}/${y}`;

    const list = document.getElementById("ti-desk-list");
    if (available.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">Nenhuma mesa disponível nesta data.</p>';
    } else {
      list.innerHTML = available.map((desk) =>
        `<button class="btn btn-ghost" style="justify-content:flex-start" onclick="adminBookDesk(${desk.id}, '${escapeHtml(desk.name)}')">🪑 ${escapeHtml(desk.name)}</button>`
      ).join("");
    }
    document.getElementById("ti-desk-picker").style.display = "flex";
  } catch (err) {
    showToast(err.message, "error");
    loadTiSchedule();
  }
}

function closeDeskPicker(e) {
  if (e && e.target !== document.getElementById("ti-desk-picker")) return;
  document.getElementById("ti-desk-picker").style.display = "none";
  showToast(`SP marcado para ${tiPickerUserName} — sem reserva de mesa`);
  loadTiSchedule();
}

async function adminBookDesk(deskId, deskName) {
  document.getElementById("ti-desk-picker").style.display = "none";
  try {
    await API.post("/bookings/admin", { user_id: tiPickerUserId, desk_id: deskId, date: tiPickerDate });
    showToast(`🏢 SP marcado — ${deskName} reservada para ${tiPickerUserName}`);
    loadTiSchedule();
  } catch (err) {
    showToast(err.message, "error");
    loadTiSchedule();
  }
}

async function exportTiCSV() {
  const from = document.getElementById("ti-export-from").value;
  const to = document.getElementById("ti-export-to").value;
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const token = API.getToken();
  const url = `/api/ti/export${params.toString() ? "?" + params.toString() : ""}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const d = await res.json(); showToast(d.error || "Erro ao exportar", "error"); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "programacao-ti.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadDashboard();
