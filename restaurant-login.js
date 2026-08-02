// Kept in sync with the API_BASE_URL constant in app.js.
const API_BASE_URL = "https://cufood-backend.onrender.com";
const TOKEN_KEY = "cufood_owner_token";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const usernameIcon = document.getElementById("username-icon");
const passwordIcon = document.getElementById("password-icon");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");

usernameIcon.innerHTML = ICONS.user;
passwordIcon.innerHTML = ICONS.lock;
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

function hideError() {
  loginError.classList.add("hidden");
}

async function checkAlreadyLoggedIn() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (response.ok) {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    console.error(err);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  loginSubmit.disabled = true;

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_BASE_URL}/api/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      window.location.href = "dashboard.html";
      return;
    }

    showError(data.detail || "Invalid username or password.");
  } catch (err) {
    showError("Could not reach the server. Is the backend running?");
    console.error(err);
  } finally {
    loginSubmit.disabled = false;
  }
});

checkAlreadyLoggedIn();
