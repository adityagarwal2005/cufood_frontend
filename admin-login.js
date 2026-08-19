const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";
const ADMIN_TOKEN_KEY = "cufood_admin_token";

const loginForm = document.getElementById("login-form");
const loginSubmit = document.getElementById("login-submit");
const loginError = document.getElementById("login-error");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");

passwordToggle.innerHTML = ICONS.eye;
passwordToggle.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  passwordToggle.innerHTML = isHidden ? ICONS.eyeOff : ICONS.eye;
});

function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("hidden");

  const identifier = document.getElementById("identifier").value.trim();
  const password = passwordInput.value;

  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Invalid credentials.");
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
      return;
    }
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    window.location.href = "admin-dashboard.html";
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Sign in";
  }
});

if (localStorage.getItem(ADMIN_TOKEN_KEY)) {
  window.location.href = "admin-dashboard.html";
}
