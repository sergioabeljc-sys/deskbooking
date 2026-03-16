if (API.getToken() && API.getUser()) {
  window.location.href = "/app.html";
}

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("submit-btn");
  btn.disabled = true;

  try {
    const data = await API.post("/auth/login", { email, password });
    API.setSession(data.token, data.user, data.refreshToken);
    window.location.href = "/app.html";
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});
