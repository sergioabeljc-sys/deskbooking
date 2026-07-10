// AC2: captura sso_code retornado pelo callback do Azure AD e troca por JWT (#4)
(function () {
  const params = new URLSearchParams(location.search);
  const ssoCode = params.get("sso_code");
  if (ssoCode) {
    // Remove o código da URL imediatamente antes da troca
    history.replaceState({}, "", "/");
    fetch(`/api/auth/sso/exchange?code=${encodeURIComponent(ssoCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.token && data.user) {
          API.setSession(data.token, data.user, data.refreshToken);
          location.href = "/week.html";
        }
      })
      .catch(() => {
        // falha na troca — permanece na tela de login
      });
    return;
  }
})();

if (API.getToken() && API.getUser()) {
  window.location.href = "/week.html";
}

// AC1: inicia fluxo SSO common — sem precisar digitar e-mail
function loginWithSSO() {
  location.href = "/api/auth/sso/login";
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
    window.location.href = "/week.html";
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});
