const user = requireAuth();
if (user) {
  document.getElementById("user-name").textContent = user.name;
  if (user.is_ti) document.getElementById("ti-link").style.display = "";
  if (user.is_admin) document.getElementById("admin-link").style.display = "";
}

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const DAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const LOC_EMOJI  = { home: "🏠", sp: "🏢", itaqua: "🏭" };
const LOC_LABEL  = { home: "Home Office", sp: "Escritório SP", itaqua: "Itaquá" };

let currentWeekDate = todayISO();

function getWeekDays(dateStr) {
  const ref = new Date(dateStr + "T12:00:00Z");
  const dow = ref.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() + diffToMon);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatWeekLabel(days) {
  const [y1, m1, d1] = days[0].split("-");
  const [, m2, d2]   = days[4].split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  if (m1 === m2) return `${d1}–${d2} ${months[+m2 - 1]} ${y1}`;
  return `${d1} ${months[+m1 - 1]} – ${d2} ${months[+m2 - 1]} ${y1}`;
}

function weekNav(delta) {
  const d = new Date(currentWeekDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta * 7);
  currentWeekDate = d.toISOString().split("T")[0];
  loadWeek();
}

function goCurrentWeek() {
  currentWeekDate = todayISO();
  loadWeek();
}

async function loadWeek() {
  const days = getWeekDays(currentWeekDate);
  document.getElementById("week-label").textContent = formatWeekLabel(days);
  const grid = document.getElementById("week-grid");
  grid.innerHTML = `<p style="grid-column:1/-1;color:var(--text-muted)">Carregando...</p>`;

  const today = todayISO();

  try {
    // Fetch user bookings
    const bookings = await API.get("/bookings/mine");
    const bookingMap = {};
    bookings.forEach((b) => { bookingMap[b.date] = b; });

    // Fetch TI schedule if applicable
    let tiSchedule = {};
    if (user.is_ti) {
      const tiData = await API.get(`/ti/schedule?week=${days[0]}`);
      const myEntry = (tiData.members || []).find((m) => m.id === user.id);
      if (myEntry) tiSchedule = myEntry.schedule || {};
    }

    grid.innerHTML = days.map((date, i) => {
      const booking  = bookingMap[date];
      const location = tiSchedule[date];
      const isPast   = date < today;
      const isToday  = date === today;

      let statusHtml = "";
      if (booking) {
        statusHtml = `
          <div class="myweek-status myweek-booked">🏢 Mesa reservada</div>
          <div class="myweek-detail">${escapeHtml(booking.desk_name)}</div>
          ${!isPast ? `<div style="display:flex;gap:.375rem;margin-top:.5rem"><button class="btn btn-ghost btn-sm" title="Adicionar ao Calendário" onclick='downloadICS(${JSON.stringify({id:booking.id,date:date,desk_name:booking.desk_name})})'>📅</button><button class="btn btn-danger btn-sm" style="flex:1" onclick="cancelMyBooking(${booking.id})">Cancelar</button></div>` : ""}`;
      } else if (location) {
        statusHtml = `
          <div class="myweek-status myweek-loc">${LOC_EMOJI[location]} ${LOC_LABEL[location]}</div>
          ${location === "sp" && !isPast ? `<a href="/app.html?date=${date}" class="btn btn-primary btn-sm" style="margin-top:.5rem;display:block;text-align:center">Reservar mesa</a>` : ""}`;
      } else {
        statusHtml = `
          <div class="myweek-status myweek-free" style="opacity:.45">— Livre</div>
          ${!isPast ? `<a href="/app.html?date=${date}" class="btn btn-ghost btn-sm" style="margin-top:.5rem;display:block;text-align:center">Reservar</a>` : ""}`;
      }

      return `
        <div class="myweek-day${isToday ? " myweek-today" : ""}${isPast ? " myweek-past" : ""}">
          <div class="myweek-dayname">${DAY_NAMES[i]}</div>
          <div class="myweek-date">${date.slice(8)}</div>
          ${statusHtml}
        </div>`;
    }).join("");
  } catch (err) {
    grid.innerHTML = `<p style="grid-column:1/-1;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

async function cancelMyBooking(id) {
  if (!confirm("Cancelar esta reserva?")) return;
  try {
    await API.delete(`/bookings/${id}`);
    showToast("Reserva cancelada.", "success");
    loadWeek();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadWeek();
