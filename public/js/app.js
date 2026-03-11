const user = requireAuth();

if (user) {
  document.getElementById("user-name").textContent = user.name;
  if (user.is_admin) document.getElementById("admin-link").style.display = "";
}

const dateInput = document.getElementById("date-input");
dateInput.value = todayISO();
dateInput.min = todayISO();
dateInput.addEventListener("change", loadDesks);

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
      cell.innerHTML = `
        <span class="desk-icon">${isInactive ? "🚫" : isMine ? "✅" : isBooked ? "👤" : "🪑"}</span>
        <span>${desk.name}</span>
        ${booking ? `<span class="desk-bookedby">${isMine ? "Você" : booking.user_name}</span>` : ""}
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
    await Promise.all([loadDesks(), loadMyBookings()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function cancelBooking(id) {
  if (!confirm("Cancelar esta reserva?")) return;
  try {
    await API.delete(`/bookings/${id}`);
    showToast("Reserva cancelada");
    await Promise.all([loadDesks(), loadMyBookings()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

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
          <strong>${b.desk_name}</strong>
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

loadDesks();
loadMyBookings();
