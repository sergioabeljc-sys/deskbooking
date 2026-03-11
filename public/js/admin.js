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
}

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

loadBookings();
