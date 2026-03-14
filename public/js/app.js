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

function renderAvatar(name, size = 28) {
  const hue = nameToHue(name);
  const initials = getInitials(name);
  return `<span class="desk-avatar" style="--avatar-hue:${hue};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px" title="${escapeHtml(name)}">${escapeHtml(initials)}</span>`;
}

// ─── Day view ─────────────────────────────────────────────────────────────────
async function loadDesks() {
  const date = dateInput.value;
  if (!date) return;

  const grid = document.getElementById("desk-grid");
  grid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-muted)">Carregando...</p>';

  try {
    const [desks, bookings] = await Promise.all([
      API.get("/desks"),
      API.get(`/bookings?date=${date}`),
    ]);

    const bookingMap = {};
    bookings.forEach((b) => { bookingMap[b.desk_id] = b; });

    const maxX = desks.reduce((m, d) => Math.max(m, d.pos_x), 0);
    grid.style.gridTemplateColumns = `repeat(${maxX}, 1fr)`;
    grid.innerHTML = "";

    desks.forEach((desk) => {
      const booking = bookingMap[desk.id];
      const isMine = booking && booking.user_id === user.id;
      const isBooked = !!booking && !isMine;
      const isInactive = !desk.is_active;

      const cell = document.createElement("div");
      cell.className =
        "desk-cell " +
        (isInactive ? "inactive" : isMine ? "mine" : isBooked ? "booked" : "available");
      cell.style.gridColumn = desk.pos_x;
      cell.style.gridRow = desk.pos_y;

      const avatarHtml = booking
        ? renderAvatar(isMine ? user.name : booking.user_name, 28)
        : `<span class="desk-icon">${isInactive ? "🚫" : "🪑"}</span>`;

      cell.innerHTML = `
        ${avatarHtml}
        <span>${escapeHtml(desk.name)}</span>
        ${booking ? `<span class="desk-bookedby">${isMine ? "Você" : escapeHtml(booking.user_name)}</span>` : ""}
      `;

      if (!isBooked && !isInactive && !isMine) {
        cell.addEventListener("click", () => bookDesk(desk, date));
      }

      grid.appendChild(cell);
    });
  } catch (err) {
    grid.innerHTML = `<p style="grid-column:1/-1;color:var(--danger)">${err.message}</p>`;
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
        else if (isMine) inner = renderAvatar(user.name, 22) + `<span class="week-cell-label">Você</span>`;
        else if (isBooked) inner = renderAvatar(booking.user_name, 22) + `<span class="week-cell-label">${escapeHtml(booking.user_name.split(" ")[0])}</span>`;
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
        <button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancelar</button>
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

// ─── Init ─────────────────────────────────────────────────────────────────────
loadDesks();
loadMyBookings();
