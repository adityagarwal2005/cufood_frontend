// Kept in sync with the API_BASE_URL constant in app.js.
const API_BASE_URL = "https://cufood-backend.onrender.com";

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

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfCookie() {
  await fetch(`${API_BASE_URL}/api/csrf/`, { credentials: "include" });
}

function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideError() {
  loginError.classList.add("hidden");
}

async function checkAlreadyLoggedIn() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/`, {
      credentials: "include",
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
    await ensureCsrfCookie();
    const response = await fetch(`${API_BASE_URL}/api/login/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      window.location.href = "dashboard.html";
      return;
    }

    const data = await response.json().catch(() => ({}));
    showError(data.detail || "Invalid username or password.");
  } catch (err) {
    showError("Could not reach the server. Is the backend running?");
    console.error(err);
  } finally {
    loginSubmit.disabled = false;
  }
});

checkAlreadyLoggedIn();
