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

// AC1: inicia fluxo SSO com o e-mail digitado
function loginWithMicrosoft() {
  const email = document.getElementById("email").value.trim();
  if (!email) {
    showToast("Digite seu e-mail corporativo antes de continuar.", "error");
    document.getElementById("email").focus();
    return;
  }
  location.href = `/api/auth/sso/login?email=${encodeURIComponent(email)}`;
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
