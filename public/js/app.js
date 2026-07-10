const user = requireAuth();

if (user) {
  document.getElementById("user-name").textContent = user.name;
  if (user.is_admin) document.getElementById("admin-link").style.display = "";
  if (user.is_ti) document.getElementById("ti-link").style.display = "";
}

// ─── View state ───────────────────────────────────────────────────────────────
let currentView = "day"; // 'day' | 'week'
let currentWeekMonday = getWeekMonday(new Date());

const dateInput = document.getElementById("date-input");
const urlDate = new URLSearchParams(window.location.search).get("date");
dateInput.value = (urlDate && urlDate >= todayISO()) ? urlDate : todayISO();
dateInput.min = todayISO();
dateInput.addEventListener("change", () => {
  const d = new Date(dateInput.value + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) {
    showToast("Fins de semana não são permitidos.", "error");
    dateInput.value = todayISO();
  }
  loadDesks();
});

function setView(v) {
  currentView = v;
  document.getElementById("btn-view-day").className =
    v === "day" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm";
  document.getElementById("btn-view-week").className =
    v === "week" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm";

  document.getElementById("view-day-controls").style.display = v === "day" ? "" : "none";
  document.getElementById("view-week-controls").style.display = v === "week" ? "" : "none";
  document.getElementById("desk-grid").style.display = v === "day" ? "" : "none";
  document.getElementById("week-grid-container").style.display = v === "week" ? "" : "none";

  if (v === "day") loadDesks();
  else loadWeekView();
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
function nameToHue(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "Carlos Silva" → "Carlos" (para espaços pequenos como o assento SVG)
function firstNameOf(name) {
  return name.trim().split(/\s+/)[0];
}

// "Carlos Silva" → "Carlos S." (para semana e outros contextos médios)
function shortName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + " " + parts[1][0] + ".";
}

function renderAvatar(name, size = 28) {
  const hue = nameToHue(name);
  const initials = getInitials(name);
  return `<span class="desk-avatar" style="--avatar-hue:${hue};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px" title="${escapeHtml(name)}">${escapeHtml(initials)}</span>`;
}

// ─── Day view — table SVG ─────────────────────────────────────────────────────
function renderTableSVG(desks, bookingMap) {
  const sorted = [...desks].sort((a, b) => a.id - b.id);
  const leftDesks  = sorted.slice(0, 5);
  const rightDesks = sorted.slice(5, 10);

  const LEFT_CX  = 84;
  const RIGHT_CX = 236;
  const SEAT_Y   = [68, 148, 228, 308, 388];

  const C = {
    available: { fill: "#22c55e", stroke: "#16a34a", text: "#fff" },
    mine:      { fill: "#3b82f6", stroke: "#1d4ed8", text: "#fff" },
    booked:    { fill: "#94a3b8", stroke: "#64748b", text: "#fff" },
    inactive:  { fill: "#e2e8f0", stroke: "#cbd5e1", text: "#94a3b8" },
  };

  function seatState(desk) {
    if (!desk.is_active) return "inactive";
    const b = bookingMap[desk.id];
    if (!b) return "available";
    return b.user_id === user.id ? "mine" : "booked";
  }

  function seatContent(desk, cx, cy, state) {
    const c = C[state];
    if (state === "inactive") {
      return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${c.text}" font-size="18" font-family="sans-serif">—</text>`;
    }
    if (state === "available") {
      const num = desk.name.replace(/\D+/g, "") || desk.name.slice(0, 2);
      return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${c.text}" font-size="13" font-weight="600" font-family="sans-serif">${escapeHtml(num)}</text>`;
    }
    // Booked or mine: show first name, font-size adapts to length
    const rawName = state === "mine" ? user.name : bookingMap[desk.id].user_name;
    const label = firstNameOf(rawName);
    const fs = label.length <= 5 ? 11 : label.length <= 7 ? 10 : 9;
    return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${c.text}" font-size="${fs}" font-weight="700" font-family="sans-serif">${escapeHtml(label)}</text>`;
  }

  function renderSeat(desk, cx, cy, side) {
    const state = seatState(desk);
    const c = C[state];
    const backX = side === "left" ? cx - 40 : cx + 26;
    const backFill = state === "inactive" ? "#e2e8f0" : "#94a3b8";
    const booking = bookingMap[desk.id];
    const occupantName = state === "mine" ? "Você" : state === "booked" ? (booking?.user_name ?? "") : state === "available" ? "Disponível" : "Inativa";
    const titleTxt = `${desk.name} — ${occupantName}`;

    return `<g class="desk-seat desk-seat-${state}" data-desk-id="${desk.id}">
      <title>${escapeHtml(titleTxt)}</title>
      <rect x="${backX}" y="${cy - 19}" width="14" height="38" rx="4" fill="${backFill}"/>
      <rect class="seat-fill" x="${cx - 26}" y="${cy - 26}" width="52" height="52" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
      ${seatContent(desk, cx, cy, state)}
      <text x="${cx}" y="${cy + 44}" text-anchor="middle" fill="#64748b" font-size="9.5" font-family="sans-serif">${escapeHtml(desk.name)}</text>
    </g>`;
  }

  let grain = "";
  for (let i = 0; i < 7; i++) {
    grain += `<line x1="144" y1="${53 + i * 58}" x2="176" y2="${53 + i * 58}" stroke="#9a6f3a" stroke-width="0.6" opacity="0.35"/>`;
  }

  return `<svg viewBox="0 0 320 460" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:340px;display:block;margin:0 auto" aria-label="Mapa da mesa">
    <!-- Janela -->
    <rect x="95" y="0" width="130" height="28" rx="3" fill="#bfdbfe" stroke="#93c5fd" stroke-width="1.5"/>
    <text x="160" y="18" text-anchor="middle" fill="#1d4ed8" font-size="11" font-weight="600" font-family="sans-serif">JANELA</text>
    <!-- Peitoril -->
    <rect x="88" y="26" width="144" height="7" rx="1" fill="#94a3b8"/>
    <!-- Mesa -->
    <rect x="140" y="33" width="40" height="400" rx="5" fill="#c8a068" stroke="#9a6f3a" stroke-width="1.5"/>
    ${grain}
    <!-- Posições esquerda -->
    ${leftDesks.map((d, i) => renderSeat(d, LEFT_CX, SEAT_Y[i], "left")).join("\n    ")}
    <!-- Posições direita -->
    ${rightDesks.map((d, i) => renderSeat(d, RIGHT_CX, SEAT_Y[i], "right")).join("\n    ")}
  </svg>`;
}

async function loadDesks() {
  const date = dateInput.value;
  if (!date) return;

  const grid = document.getElementById("desk-grid");
  grid.innerHTML = '<p style="color:var(--text-muted);padding:.5rem">Carregando...</p>';

  try {
    const [desks, bookings] = await Promise.all([
      API.get("/desks"),
      API.get(`/bookings?date=${date}`),
    ]);

    const bookingMap = {};
    bookings.forEach((b) => { bookingMap[b.desk_id] = b; });

    grid.innerHTML = renderTableSVG(desks, bookingMap);

    // Attach click handlers
    grid.querySelectorAll(".desk-seat-available[data-desk-id]").forEach((el) => {
      const desk = desks.find((d) => d.id === +el.dataset.deskId);
      el.addEventListener("click", () => bookDesk(desk, date));
    });
    grid.querySelectorAll(".desk-seat-mine[data-desk-id]").forEach((el) => {
      const booking = bookingMap[+el.dataset.deskId];
      el.addEventListener("click", () => cancelBooking(booking.id));
    });
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--danger);padding:.5rem">${err.message}</p>`;
  }
}

async function bookDesk(desk, date) {
  if (!confirm(`Reservar ${desk.name} para ${formatDate(date)}?`)) return;
  try {
    await API.post("/bookings", { desk_id: desk.id, date });
    showToast(`${desk.name} reservada com sucesso!`);
    await Promise.all([loadDesks(), loadWeekView(), loadMyBookings()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function cancelBooking(id) {
  if (!confirm("Cancelar esta reserva?")) return;
  try {
    await API.delete(`/bookings/${id}`);
    showToast("Reserva cancelada");
    await Promise.all([loadDesks(), loadWeekView(), loadMyBookings()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Week view ────────────────────────────────────────────────────────────────
function getWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(d) {
  return d.toISOString().split("T")[0];
}

function weekNav(delta) {
  currentWeekMonday = addDays(currentWeekMonday, delta * 7);
  loadWeekView();
}

function goToCurrentWeek() {
  currentWeekMonday = getWeekMonday(new Date());
  loadWeekView();
}

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex"];

async function loadWeekView() {
  if (currentView !== "week") return;
  const container = document.getElementById("week-grid-container");
  container.innerHTML = '<p style="color:var(--text-muted)">Carregando semana...</p>';

  // Build date array Mon-Fri
  const days = Array.from({ length: 5 }, (_, i) => addDays(currentWeekMonday, i));
  const friday = days[4];
  const monday = days[0];

  // Update label
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("week-label").textContent =
    `${fmt(monday)} – ${fmt(friday)} de ${friday.getFullYear()}`;

  const today = todayISO();

  try {
    const [desks, ...bookingsPerDay] = await Promise.all([
      API.get("/desks"),
      ...days.map((d) => API.get(`/bookings?date=${toISO(d)}`)),
    ]);

    const bookingMaps = bookingsPerDay.map((bookings) => {
      const m = {};
      bookings.forEach((b) => { m[b.desk_id] = b; });
      return m;
    });

    // Build week grid HTML
    let html = '<div class="week-grid">';

    // Header row
    html += '<div class="week-header-row">';
    html += '<div class="week-corner">Mesa</div>';
    days.forEach((d, i) => {
      const iso = toISO(d);
      const isToday = iso === today;
      const isPast = iso < today;
      html += `<div class="week-day-header${isToday ? " week-today" : ""}${isPast ? " week-past" : ""}">
        <span class="week-day-name">${DAY_NAMES[i]}</span>
        <span class="week-day-date">${fmt(d)}</span>
      </div>`;
    });
    html += "</div>";

    // Rows per desk
    desks.forEach((desk) => {
      html += '<div class="week-desk-row">';
      html += `<div class="week-desk-name">${escapeHtml(desk.name)}</div>`;

      days.forEach((d, i) => {
        const iso = toISO(d);
        const booking = bookingMaps[i][desk.id];
        const isMine = booking && booking.user_id === user.id;
        const isBooked = !!booking && !isMine;
        const isInactive = !desk.is_active;
        const isPast = iso < today;

        let cls = "week-cell ";
        if (isInactive) cls += "inactive";
        else if (isMine) cls += "mine";
        else if (isBooked) cls += "booked";
        else if (isPast) cls += "inactive";
        else cls += "available";

        const clickable = !isBooked && !isInactive && !isMine && !isPast;

        let inner = "";
        if (isInactive) inner = '<span class="week-cell-icon">🚫</span>';
        else if (isMine) inner = renderAvatar(user.name, 22) + `<span class="week-cell-label">${escapeHtml(shortName(user.name))}</span>`;
        else if (isBooked) inner = renderAvatar(booking.user_name, 22) + `<span class="week-cell-label">${escapeHtml(shortName(booking.user_name))}</span>`;
        else if (!isPast) inner = '<span class="week-cell-icon" style="opacity:.4">🪑</span>';

        html += `<div class="${cls}"${clickable ? ` data-desk-id="${desk.id}" data-desk-name="${escapeHtml(desk.name)}" data-date="${iso}" style="cursor:pointer"` : ""}>${inner}</div>`;
      });

      html += "</div>";
    });

    html += "</div>";
    container.innerHTML = html;

    container.querySelectorAll("[data-desk-id]").forEach((el) => {
      el.addEventListener("click", () =>
        weekBookDesk(+el.dataset.deskId, el.dataset.deskName, el.dataset.date)
      );
    });
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

async function weekBookDesk(deskId, deskName, date) {
  if (!confirm(`Reservar ${deskName} para ${formatDate(date)}?`)) return;
  try {
    await API.post("/bookings", { desk_id: deskId, date });
    showToast(`${deskName} reservada com sucesso!`);
    await Promise.all([loadWeekView(), loadMyBookings()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── My bookings ──────────────────────────────────────────────────────────────
async function loadMyBookings() {
  const list = document.getElementById("my-bookings");
  try {
    const bookings = await API.get("/bookings/mine");
    if (bookings.length === 0) {
      list.innerHTML = '<li class="empty-state">Nenhuma reserva futura</li>';
      return;
    }
    list.innerHTML = bookings
      .map(
        (b) => `
      <li class="booking-item">
        <div class="booking-info">
          <strong>${escapeHtml(b.desk_name)}</strong>
          <span>${formatDate(b.date)}</span>
        </div>
        <div style="display:flex;gap:.375rem">
          <button class="btn btn-ghost btn-sm" title="Adicionar ao Calendário" onclick='downloadICS(${JSON.stringify({id:b.id,date:b.date,desk_name:b.desk_name})})'>📅</button>
          <button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancelar</button>
        </div>
      </li>
    `
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li class="empty-state">${err.message}</li>`;
  }
}

// ─── Profile modal ────────────────────────────────────────────────────────────
function openProfileModal() {
  const u = API.getUser();
  document.getElementById("profile-name").value = u.name || "";
  document.getElementById("profile-email").value = u.email || "";
  document.getElementById("profile-password").value = "";
  document.getElementById("profile-confirm-password").value = "";
  document.getElementById("profile-modal-overlay").classList.add("open");
}

function closeProfileModal() {
  document.getElementById("profile-modal-overlay").classList.remove("open");
}

async function submitProfile() {
  const name = document.getElementById("profile-name").value.trim();
  const email = document.getElementById("profile-email").value.trim();
  const password = document.getElementById("profile-password").value;
  const confirmPassword = document.getElementById("profile-confirm-password").value;

  if (!name || !email) {
    showToast("Nome e e-mail são obrigatórios", "error");
    return;
  }

  const body = { name, email };
  if (password) {
    body.password = password;
    body.confirmPassword = confirmPassword;
  }

  try {
    const { token, refreshToken, user: updated } = await API.put("/auth/profile", body);
    API.setSession(token, updated, refreshToken);
    document.getElementById("user-name").textContent = updated.name;
    closeProfileModal();
    showToast("Perfil atualizado com sucesso!");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Minha Mesa (dono) ────────────────────────────────────────────────────────
const DAY_LABELS = { mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex" };
const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri"];

async function loadMyDesk() {
  const me = API.getUser();
  if (!me) return;
  try {
    const desks = await API.get("/desks");
    const myDesk = desks.find((d) => d.owner_id === me.id);
    if (!myDesk) return;

    const card = document.getElementById("my-desk-card");
    const body = document.getElementById("my-desk-body");
    card.style.display = "";

    if (myDesk.type === "fixed") {
      body.innerHTML = `
        <p style="font-size:.875rem;font-weight:600;margin-bottom:.25rem">${escapeHtml(myDesk.name)}</p>
        <p style="font-size:.8rem;color:var(--text-muted)">Mesa exclusiva — reservada para você todos os dias.</p>`;
      return;
    }

    // type = 'rotative' com dono — pode configurar dias
    const rotDays = (() => { try { return JSON.parse(myDesk.rotative_days || "[]"); } catch { return []; } })();

    body.innerHTML = `
      <p style="font-size:.875rem;font-weight:600;margin-bottom:.5rem">${escapeHtml(myDesk.name)}</p>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:.6rem">Marque os dias em que sua mesa entra no pool de vagas rotativas.</p>
      <div style="display:flex;flex-direction:column;gap:.35rem" id="my-desk-days">
        ${ALL_DAYS.map((d) => `
          <label style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;cursor:pointer">
            <input type="checkbox" value="${d}" ${rotDays.includes(d) ? "checked" : ""}
              style="width:15px;height:15px;cursor:pointer">
            ${DAY_LABELS[d]}
            ${rotDays.includes(d)
              ? '<span style="font-size:.75rem;color:var(--text-muted);margin-left:auto">no pool</span>'
              : '<span style="font-size:.75rem;color:var(--text-muted);margin-left:auto">sua mesa</span>'}
          </label>`).join("")}
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:.75rem;width:100%" onclick="saveMyDeskDays(${myDesk.id})">Salvar dias</button>
    `;
  } catch {}
}

async function saveMyDeskDays(deskId) {
  const days = [...document.querySelectorAll("#my-desk-days input[type=checkbox]")]
    .filter((c) => c.checked)
    .map((c) => c.value);
  try {
    await API.put(`/desks/${deskId}/rotative-days`, { rotative_days: days });
    showToast("Dias atualizados!");
    loadMyDesk();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadDesks();
loadMyBookings();
loadMyDesk();
