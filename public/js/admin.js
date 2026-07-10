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
  else if (tab === "audit") loadAudit();
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

    const { totalLast30, peakDesk, byDesk, byDayOfWeek, byUser, activeDeskCount, officeOccupancy } = stats;

    // Working days in last 30 days ≈ 22
    const WORKING_DAYS = 22;
    const maxPossible = activeDeskCount * WORKING_DAYS;
    const occupancyPct = maxPossible > 0 ? Math.round((totalLast30 / maxPossible) * 100) : 0;

    // Office occupancy this week
    const spPct    = officeOccupancy?.sp?.total > 0
      ? Math.round((officeOccupancy.sp.users / officeOccupancy.sp.total) * 100) : 0;
    const itaquaPct = officeOccupancy?.itaqua?.total > 0
      ? Math.round((officeOccupancy.itaqua.users / officeOccupancy.itaqua.total) * 100) : 0;

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
        <div class="dashboard-card-label">Taxa de ocupação média (30 dias)</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-card-value">${spPct}%</div>
        <div class="dashboard-card-label">🏢 Ocupação SP esta semana<br><span style="font-size:.75rem;color:var(--text-muted)">${officeOccupancy?.sp?.users ?? 0} de ${officeOccupancy?.sp?.total ?? 0} usuários</span></div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-card-value">${itaquaPct}%</div>
        <div class="dashboard-card-label">🏭 Ocupação Itaquá esta semana<br><span style="font-size:.75rem;color:var(--text-muted)">${officeOccupancy?.itaqua?.users ?? 0} de ${officeOccupancy?.itaqua?.total ?? 0} da equipe TI</span></div>
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

// ─── Audit Log ────────────────────────────────────────────────────────────────
const TI_LOCATIONS = { sp: "SP (escritório)", home: "Home office", itaqua: "Itaquaquecetuba" };
const DOW_PT = { sun: "Dom", mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex", sat: "Sáb" };

function renderAuditDetails(action, d) {
  if (!d) return "—";
  const e = escapeHtml;
  const fd = (s) => s ? formatDate(s) : "";
  const ft = (s) => s ? s.slice(0, 5) : "";
  const parts = (...xs) => xs.filter(Boolean).join(" · ") || "—";

  switch (action) {
    case "cancel_booking":
    case "create_booking_admin":
      return parts(d.desk && e(d.desk), d.date && fd(d.date), d.user && e(d.user));

    case "create_room_booking":
      return parts(d.room_name && e(d.room_name), d.date && fd(d.date),
        d.start_time && `${ft(d.start_time)}–${ft(d.end_time)}`);
    case "cancel_room_booking":
      return parts(d.room_name && e(d.room_name), d.date && fd(d.date),
        d.start_time && `${ft(d.start_time)}–${ft(d.end_time)}`);

    case "create_spot_booking":
    case "cancel_spot_booking":
      return parts(d.date && fd(d.date),
        d.start_time && `${ft(d.start_time)}–${ft(d.end_time)}`);

    case "create_user":
    case "delete_user":
      return parts(d.name && e(d.name), d.email && `&lt;${e(d.email)}&gt;`);
    case "edit_user":
      return parts(d.name && e(d.name), d.company && e(d.company), d.department && e(d.department));
    case "toggle_ti":
      return d.name ? `${e(d.name)} → TI: ${d.is_ti ? "sim" : "não"}` : "—";
    case "toggle_admin":
      return d.name ? `${e(d.name)} → Admin: ${d.is_admin ? "sim" : "não"}` : "—";
    case "toggle_status":
      return d.name ? `${e(d.name)} → ${d.status === "inactive" ? "Inativo" : "Ativo"}` : "—";
    case "set_weekly_days":
      return d.name ? `${e(d.name)} → ${d.weekly_office_days}d/semana` : "—";

    case "approve_access":
    case "refuse_access":
      return d.email ? e(d.email) : "—";

    case "create_department":
    case "delete_department":
      return d.name ? e(d.name) : "—";
    case "update_department":
      return parts(d.name && e(d.name), `vagas: ${d.can_book_spot ? "sim" : "não"}`);

    case "update_spot_capacity": {
      const when = d.specific_date ? fd(d.specific_date) : (DOW_PT[d.day_of_week] || d.day_of_week || "");
      return parts(when, `${d.capacity} vagas`);
    }

    case "update_desk_type":
      return parts(d.desk_name && e(d.desk_name), `Tipo: ${d.type}`,
        d.owner_name && e(d.owner_name));
    case "update_rotative_days": {
      const days = Array.isArray(d.rotative_days_next)
        ? (d.rotative_days_next.map(x => DOW_PT[x] || x).join(", ") || "nenhum")
        : "—";
      const from = d.rotative_days_next_from ? ` a partir de ${fd(d.rotative_days_next_from)}` : "";
      return `${days}${from}`;
    }

    case "create_room":
    case "update_room":
      return parts(d.name && e(d.name), d.capacity && `${d.capacity} pessoas`);
    case "deactivate_room":
      return parts(d.name && e(d.name),
        d.cancelled_bookings > 0 && `${d.cancelled_bookings} reservas canceladas`);

    case "set_ti_location":
      return parts(d.member_name && e(d.member_name), d.date && fd(d.date),
        TI_LOCATIONS[d.location] || d.location);
    case "clear_ti_location":
      return parts(d.member_name && e(d.member_name), d.date && fd(d.date));

    default:
      return Object.entries(d)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : e(String(v))}`)
        .join(" · ") || "—";
  }
}

let auditPage = 1;

async function loadAudit(page) {
  if (page !== undefined) auditPage = page;
  const tbody = document.getElementById("audit-body");
  const paginEl = document.getElementById("audit-pagination");
  try {
    const result = await API.get(`/audit?page=${auditPage}&limit=50`);
    const logs = result.data;
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma ação registrada</td></tr>';
      paginEl.innerHTML = "";
      return;
    }
    tbody.innerHTML = logs.map((l) => {
      const dt = new Date(l.created_at.replace(" ", "T") + "Z");
      const dateStr = isNaN(dt) ? l.created_at : dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const details = renderAuditDetails(l.action, l.details_parsed);
      return `<tr>
        <td style="white-space:nowrap;color:var(--text-muted);font-size:.8rem">${dateStr}</td>
        <td>${escapeHtml(l.actor_name)}</td>
        <td><span style="font-size:.8rem;font-weight:600;padding:.15rem .5rem;border-radius:4px;background:var(--bg)">${escapeHtml(l.action_label)}</span></td>
        <td style="font-size:.8125rem;color:var(--text-muted)">${details}</td>
      </tr>`;
    }).join("");

    // Pagination
    paginEl.innerHTML = "";
    if (result.pages > 1) {
      for (let p = 1; p <= result.pages; p++) {
        const btn = document.createElement("button");
        btn.className = `btn btn-sm ${p === auditPage ? "btn-primary" : "btn-ghost"}`;
        btn.textContent = p;
        btn.onclick = () => loadAudit(p);
        paginEl.appendChild(btn);
      }
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
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
          <td style="display:flex;gap:.375rem;align-items:center">
            <button class="btn btn-ghost btn-sm" title="Exportar .ics" onclick='downloadICS(${JSON.stringify({id:b.id,date:b.date,desk_name:b.desk_name})})'>📅</button>
            <button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancelar</button>
          </td>
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
    const [desks, users] = await Promise.all([API.get("/desks"), API.get("/users")]);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
    tbody.innerHTML = desks
      .map((d) => {
        const rotDays = (() => { try { return JSON.parse(d.rotative_days || "[]"); } catch { return []; } })();
        const dayLabels = { mon:"Seg", tue:"Ter", wed:"Qua", thu:"Qui", fri:"Sex" };
        let typeBadge, typeLabel;
        if (d.type === "fixed") {
          typeBadge = "badge-blue";
          typeLabel = "Fixa Exclusiva";
        } else if (d.type === "rotative" && d.owner_id) {
          typeBadge = "badge-success";
          typeLabel = "Com Dono";
        } else {
          typeBadge = "badge-gray";
          typeLabel = "Rotativa";
        }
        const donoCell = d.owner_id
          ? `<span>${escapeHtml(userMap[d.owner_id] || "ID " + d.owner_id)}</span>`
          : `<span style="color:var(--text-muted)">—</span>`;
        const daysInfo = d.type === "rotative" && d.owner_id && rotDays.length > 0
          ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:.15rem">${rotDays.map((d) => dayLabels[d] || d).join(", ")}</div>`
          : "";
        return `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td>Col ${d.pos_x}, Lin ${d.pos_y}</td>
        <td>
          <span class="badge ${typeBadge}">${typeLabel}</span>
          ${daysInfo}
        </td>
        <td>${donoCell}</td>
        <td>
          <span class="badge ${d.is_active ? "badge-success" : "badge-gray"}">
            ${d.is_active ? "Ativa" : "Inativa"}
          </span>
        </td>
        <td style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick='showDeskTypeModal(${JSON.stringify(d).replace(/'/g, "&#39;")})'>Tipo</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleDesk(${d.id}, ${d.is_active})">
            ${d.is_active ? "Desativar" : "Ativar"}
          </button>
          <button class="btn btn-danger btn-sm" data-id="${d.id}" data-name="${escapeHtml(d.name)}" onclick="deleteDesk(+this.dataset.id, this.dataset.name)">Excluir</button>
        </td>
      </tr>
    `;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message}</td></tr>`;
  }
}

async function showDeskTypeModal(desk) {
  document.getElementById("desk-type-id").value = desk.id;
  const rotDays = (() => { try { return JSON.parse(desk.rotative_days || "[]"); } catch { return []; } })();

  // Set type selector
  let uiType;
  if (desk.type === "fixed") uiType = "fixed";
  else if (desk.type === "rotative" && desk.owner_id) uiType = "rotative_owner";
  else uiType = "rotative";
  document.getElementById("desk-type-select").value = uiType;

  // Load users into owner dropdown
  try {
    const users = await API.get("/users");
    const sel = document.getElementById("desk-owner-select");
    sel.innerHTML = '<option value="">Selecione o dono...</option>' +
      users.map((u) => `<option value="${u.id}"${desk.owner_id == u.id ? " selected" : ""}>${escapeHtml(u.name)}</option>`).join("");
  } catch {}

  // Set days checkboxes
  document.querySelectorAll(".desk-day-chk").forEach((chk) => {
    chk.checked = rotDays.includes(chk.value);
  });

  onDeskTypeChange();
  document.getElementById("modal-desk-type").classList.add("open");
}

function closeDeskTypeModal() {
  document.getElementById("modal-desk-type").classList.remove("open");
}

function onDeskTypeChange() {
  const val = document.getElementById("desk-type-select").value;
  document.getElementById("desk-owner-group").style.display = val !== "rotative" ? "" : "none";
  document.getElementById("desk-days-group").style.display = val === "rotative_owner" ? "" : "none";
}

async function submitDeskType() {
  const id = document.getElementById("desk-type-id").value;
  const uiType = document.getElementById("desk-type-select").value;
  const ownerId = document.getElementById("desk-owner-select").value;

  const backendType = uiType === "rotative_owner" ? "rotative" : uiType;
  const body = { type: backendType };
  if (uiType !== "rotative" && ownerId) body.owner_id = parseInt(ownerId);
  if (uiType === "rotative" && !ownerId) body.owner_id = null;

  try {
    await API.put(`/desks/${id}/type`, body);

    // If rotative_owner, also save rotative_days
    if (uiType === "rotative_owner") {
      const days = [...document.querySelectorAll(".desk-day-chk")]
        .filter((c) => c.checked)
        .map((c) => c.value);
      await API.put(`/desks/${id}/rotative-days`, { rotative_days: days });
    }

    showToast("Tipo atualizado");
    closeDeskTypeModal();
    loadDesks();
  } catch (err) {
    showToast(err.message, "error");
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
        (u) => {
          const days = u.weekly_office_days ?? 3;
          const daysSelect = `<select onchange="setWeeklyDays(${u.id}, +this.value)" style="border:1px solid var(--border);border-radius:var(--radius);padding:.2rem .4rem;font-size:.8125rem;background:var(--surface)">
            ${[1,2,3,4,5].map(n => `<option value="${n}"${days===n?" selected":""}>${n}</option>`).join("")}
          </select>`;
          const isInactive = u.status === "inactive";
          return `
      <tr${isInactive ? ' style="opacity:.55"' : ''}>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <span class="badge ${u.is_admin ? "badge-blue" : "badge-gray"}">
            ${u.is_admin ? "Admin" : "Usuário"}
          </span>
          ${isInactive ? '<span class="badge badge-yellow" style="background:#fef3c7;color:#92400e">Inativo</span>' : ''}
        </td>
        <td>
          ${u.is_ti ? '<span class="badge badge-blue">TI</span>' : '<span class="badge badge-gray">—</span>'}
        </td>
        <td>${daysSelect}</td>
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
            <button class="btn btn-ghost btn-sm" onclick="toggleStatus(${u.id}, ${u.is_admin})" style="color:${isInactive ? 'var(--success)' : 'var(--text-muted)'}">
              ${isInactive ? "Ativar" : "Inativar"}
            </button>
            <button class="btn btn-danger btn-sm" data-id="${u.id}" data-name="${escapeHtml(u.name)}" onclick="deleteUser(+this.dataset.id, this.dataset.name)">Excluir</button>
          `
              : '<span style="color:var(--text-muted);font-size:.8rem">Você</span>'
          }
        </td>
      </tr>
    `;
        }
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message}</td></tr>`;
  }
}

function showCreateUser() {
  document.getElementById("modal-create-user").classList.add("open");
}

function closeCreateUser() {
  document.getElementById("modal-create-user").classList.remove("open");
  document.getElementById("new-user-name").value = "";
  document.getElementById("new-user-email").value = "";
  document.getElementById("new-user-password").value = "";
}

async function submitCreateUser() {
  const name = document.getElementById("new-user-name").value.trim();
  const email = document.getElementById("new-user-email").value.trim();
  const password = document.getElementById("new-user-password").value;
  if (!name || !email || !password) {
    showToast("Preencha todos os campos", "error");
    return;
  }
  try {
    await API.post("/users", { name, email, password });
    showToast("Usuário criado com sucesso");
    closeCreateUser();
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function setWeeklyDays(id, days) {
  try {
    await API.put(`/users/${id}/weekly-days`, { days });
    showToast(`Limite atualizado para ${days} dia${days > 1 ? "s" : ""}/semana`);
  } catch (err) {
    showToast(err.message, "error");
    loadUsers();
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

async function toggleStatus(id) {
  try {
    await API.put(`/users/${id}/toggle-status`);
    showToast("Status atualizado");
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
