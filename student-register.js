const API_BASE_URL = "https://cufood-backend.onrender.com";

const params = new URLSearchParams(window.location.search);
const NEXT_URL = params.get("next") || "location-select.html";

const registerForm = document.getElementById("register-form");
const registerSubmit = document.getElementById("register-submit");
const registerError = document.getElementById("register-error");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");

passwordToggle.innerHTML = ICONS.eye;
passwordToggle.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  passwordToggle.innerHTML = isHidden ? ICONS.eyeOff : ICONS.eye;
});

function showError(message) {
  registerError.textContent = message;
  registerError.classList.remove("hidden");
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerError.classList.add("hidden");

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;

  registerSubmit.disabled = true;
  registerSubmit.textContent = "Creating account…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not create your account. Please try again.");
      registerSubmit.disabled = false;
      registerSubmit.textContent = "Create account";
      return;
    }
    setStudentSession(data.token, data.username);
    window.location.href = NEXT_URL;
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    registerSubmit.disabled = false;
    registerSubmit.textContent = "Create account";
  }
});

if (isStudentLoggedIn()) {
  window.location.href = NEXT_URL;
}
