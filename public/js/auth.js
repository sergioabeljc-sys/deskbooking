if (API.getToken() && API.getUser()) {
  window.location.href = "/app.html";
}

let isLogin = true;

const form = document.getElementById("auth-form");
const nameGroup = document.getElementById("name-group");
const nameInput = document.getElementById("name");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const submitBtn = document.getElementById("submit-btn");
const toggleText = document.getElementById("toggle-text");
const toggleLink = document.getElementById("toggle-link");

toggleLink.addEventListener("click", () => {
  isLogin = !isLogin;
  nameGroup.style.display = isLogin ? "none" : "";
  formTitle.textContent = isLogin ? "Entrar" : "Criar conta";
  formSubtitle.textContent = isLogin
    ? "Reserve sua mesa de trabalho"
    : "Cadastre-se para começar";
  submitBtn.textContent = isLogin ? "Entrar" : "Criar conta";
  toggleText.textContent = isLogin ? "Não tem conta?" : "Já tem conta?";
  toggleLink.textContent = isLogin ? "Criar conta" : "Entrar";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  submitBtn.disabled = true;

  try {
    let data;
    if (isLogin) {
      data = await API.post("/auth/login", { email, password });
    } else {
      const name = nameInput.value.trim();
      if (!name) { showToast("Informe seu nome", "error"); return; }
      data = await API.post("/auth/register", { name, email, password });
    }
    API.setSession(data.token, data.user, data.refreshToken);
    window.location.href = "/app.html";
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
});
