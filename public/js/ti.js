const user = requireAuth();
if (user) {
  document.getElementById("user-name").textContent = user.name;
  if (user.is_admin) document.getElementById("admin-link").style.display = "";
}

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const LOCATION_LABEL = {
  home:   { icon: "🏠", label: "Home Office",     cls: "ti-home" },
  sp:     { icon: "🏢", label: "Escritório SP",   cls: "ti-sp" },
  itaqua: { icon: "🏭", label: "Itaquá",          cls: "ti-itaqua" },
};

// ─── Week state ────────────────────────────────────────────────────────────────
let currentWeekMonday = getWeekMonday(new Date());
let pickerDate = null;
let pickerCurrentLocation = null;

function getWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
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

function fmt(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekNav(delta) {
  currentWeekMonday = addDays(currentWeekMonday, delta * 7);
  loadWeek();
}

function goToCurrentWeek() {
  currentWeekMonday = getWeekMonday(new Date());
  loadWeek();
}

// ─── Load week ─────────────────────────────────────────────────────────────────
async function loadWeek() {
  const grid = document.getElementById("ti-grid");
  grid.innerHTML = '<p style="padding:1.5rem;color:var(--text-muted)">Carregando...</p>';

  const monday = currentWeekMonday;
  const friday = addDays(monday, 4);
  document.getElementById("week-label").textContent =
    `${fmt(monday)} – ${fmt(friday)} de ${friday.getFullYear()}`;

  try {
    const data = await API.get(`/ti/schedule?week=${toISO(monday)}`);
    renderGrid(data);
  } catch (err) {
    grid.innerHTML = `<p style="padding:1.5rem;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function renderGrid({ days, members }) {
  const today = todayISO();

  if (members.length === 0) {
    document.getElementById("ti-grid").innerHTML =
      '<p style="padding:1.5rem;color:var(--text-muted)">Nenhum membro TI cadastrado.</p>';
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse;font-size:.875rem">';

  // Header
  html += '<thead><tr>';
  html += '<th style="padding:.625rem .75rem;border-bottom:2px solid var(--border);text-align:left;color:var(--text-muted);font-size:.8125rem;white-space:nowrap;min-width:120px">Membro</th>';
  days.forEach((iso, i) => {
    const isToday = iso === today;
    const isPast = iso < today;
    html += `<th style="padding:.625rem .5rem;border-bottom:2px solid var(--border);text-align:center;color:${isToday ? "var(--primary)" : "var(--text-muted)"};font-size:.8125rem;opacity:${isPast ? ".55" : "1"}">
      <div style="font-weight:700;text-transform:uppercase">${DAY_NAMES[i]}</div>
      <div style="font-weight:400;font-size:.7rem">${fmt(new Date(iso + "T12:00:00"))}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  // Rows
  members.forEach((member) => {
    const isMe = member.id === user.id;
    html += `<tr style="${isMe ? "background:var(--bg)" : ""}">`;
    html += `<td style="padding:.625rem .75rem;border-bottom:1px solid var(--border);font-weight:${isMe ? "600" : "400"};white-space:nowrap">
      ${renderAvatar(member.name, 22)} ${escapeHtml(member.name)}${isMe ? ' <span style="font-size:.7rem;color:var(--primary)">(você)</span>' : ""}
    </td>`;

    days.forEach((iso) => {
      const loc = member.schedule[iso];
      const isPast = iso < today;
      const canEdit = isMe && !isPast;

      let inner = "";
      let cellStyle = "border-bottom:1px solid var(--border);padding:.375rem .25rem;text-align:center;min-height:48px;";

      if (loc) {
        const { icon, label } = LOCATION_LABEL[loc];
        inner = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <span style="font-size:1.1rem">${icon}</span>
          <span style="font-size:.65rem;color:var(--text-muted);white-space:nowrap">${label}</span>
        </div>`;
      } else if (!isPast) {
        inner = `<span style="color:var(--border);font-size:1rem">—</span>`;
      }

      if (canEdit) {
        cellStyle += "cursor:pointer;transition:background .12s;";
        html += `<td style="${cellStyle}" class="ti-cell-editable" data-date="${iso}" data-loc="${loc || ""}" title="Clique para declarar">${inner}</td>`;
      } else {
        cellStyle += isPast ? "opacity:.5;" : "";
        html += `<td style="${cellStyle}">${inner}</td>`;
      }
    });

    html += "</tr>";
  });

  html += "</tbody></table>";
  document.getElementById("ti-grid").innerHTML = html;

  // Attach click events
  document.querySelectorAll(".ti-cell-editable").forEach((cell) => {
    cell.addEventListener("mouseenter", () => { cell.style.background = "var(--bg)"; });
    cell.addEventListener("mouseleave", () => { cell.style.background = ""; });
    cell.addEventListener("click", () => openPicker(cell.dataset.date, cell.dataset.loc || null));
  });
}

// ─── Location picker ───────────────────────────────────────────────────────────
function openPicker(date, currentLoc) {
  pickerDate = date;
  pickerCurrentLocation = currentLoc;

  const [y, m, d] = date.split("-");
  document.getElementById("picker-title").textContent = `${d}/${m}/${y} — Onde você estará?`;
  document.getElementById("picker-clear").style.display = currentLoc ? "" : "none";
  document.getElementById("location-picker").style.display = "flex";
}

function closePicker(e) {
  if (e && e.target !== document.getElementById("location-picker")) return;
  document.getElementById("location-picker").style.display = "none";
  pickerDate = null;
  pickerCurrentLocation = null;
}

async function setLocation(location) {
  document.getElementById("location-picker").style.display = "none";
  try {
    const result = await API.post("/ti/schedule", { date: pickerDate, location });
    await loadWeek();

    if (location === "home") {
      showToast(result.bookingCancelled
        ? "Home Office marcado — reserva de mesa cancelada."
        : "Home Office marcado.");
    } else if (location === "itaqua") {
      showToast(result.bookingCancelled
        ? "Itaquá marcado — reserva de mesa cancelada."
        : "Itaquá marcado.");
    } else if (location === "sp") {
      if (result.hasBooking) {
        showToast("Escritório SP confirmado — mesa já reservada.");
      } else {
        const [y, m, d] = pickerDate.split("-");
        showToast(`SP marcado. Acesse a página principal para reservar uma mesa.`, "info");
        setTimeout(() => {
          window.location.href = `/app.html?date=${pickerDate}`;
        }, 1800);
      }
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function clearLocation() {
  document.getElementById("location-picker").style.display = "none";
  try {
    const result = await API.delete(`/ti/schedule/${pickerDate}`);
    await loadWeek();
    showToast(result.bookingCancelled
      ? "Declaração removida — reserva de mesa cancelada."
      : "Declaração removida.");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Avatar (reusa helper de app.js) ──────────────────────────────────────────
function nameToHue(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ((hash % 360) + 360) % 360;
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderAvatar(name, size = 24) {
  const hue = nameToHue(name);
  return `<span class="desk-avatar" style="--avatar-hue:${hue};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;vertical-align:middle" title="${escapeHtml(name)}">${escapeHtml(getInitials(name))}</span>`;
}

// ─── Init ──────────────────────────────────────────────────────────────────────
loadWeek();
