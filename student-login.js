// Kept in sync with the API_BASE_URL constant in the owner-side files.
const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";

const params = new URLSearchParams(window.location.search);
// Where to send the student after a successful sign-in — checkout.js sets
// this when it bounces someone here for not being logged in yet.
const NEXT_URL = params.get("next") || "location-select.html";

let mode = "password"; // "password" | "otp"
let codeSent = false;

const modePasswordBtn = document.getElementById("mode-password-btn");
const modeOtpBtn = document.getElementById("mode-otp-btn");
const passwordField = document.getElementById("password-field");
const otpField = document.getElementById("otp-field");
const otpInputWrap = document.getElementById("otp-input-wrap");
const passwordInput = document.getElementById("password");
const otpInput = document.getElementById("otp");
const sendCodeBtn = document.getElementById("send-code-btn");
const resendCodeBtn = document.getElementById("resend-code-btn");
const loginForm = document.getElementById("login-form");
const loginSubmit = document.getElementById("login-submit");
const loginError = document.getElementById("login-error");
const loginNotice = document.getElementById("login-notice");
const passwordToggle = document.getElementById("password-toggle");

passwordToggle.innerHTML = ICONS.eye;
passwordToggle.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  passwordToggle.innerHTML = isHidden ? ICONS.eyeOff : ICONS.eye;
});

function showError(message) {
  loginNotice.classList.add("hidden");
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function showNotice(message) {
  loginError.classList.add("hidden");
  loginNotice.textContent = message;
  loginNotice.classList.remove("hidden");
}

function hideMessages() {
  loginError.classList.add("hidden");
  loginNotice.classList.add("hidden");
}

function applyModeStyles() {
  const activeClasses = ["bg-cream-alt", "text-ink", "shadow-sm"];
  const inactiveClasses = ["text-muted"];
  modePasswordBtn.classList.remove(...activeClasses, ...inactiveClasses);
  modeOtpBtn.classList.remove(...activeClasses, ...inactiveClasses);
  (mode === "password" ? modePasswordBtn : modeOtpBtn).classList.add(...activeClasses);
  (mode === "password" ? modeOtpBtn : modePasswordBtn).classList.add(...inactiveClasses);
}

function setMode(newMode) {
  mode = newMode;
  hideMessages();
  passwordField.classList.toggle("hidden", mode !== "password");
  otpField.classList.toggle("hidden", mode !== "otp");
  otpField.classList.toggle("flex", mode === "otp");
  applyModeStyles();
}

modePasswordBtn.addEventListener("click", () => setMode("password"));
modeOtpBtn.addEventListener("click", () => setMode("otp"));
setMode("password");

async function requestOtp() {
  const identifier = document.getElementById("identifier").value.trim();
  if (!identifier) {
    showError("Enter your username or email first.");
    return;
  }
  hideMessages();
  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = "Sending…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/request-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not send a code. Please try again.");
      sendCodeBtn.disabled = false;
      sendCodeBtn.textContent = "Send me a code";
      return;
    }
    codeSent = true;
    otpInputWrap.classList.remove("hidden");
    otpInputWrap.classList.add("flex");
    sendCodeBtn.textContent = "Code sent";
    showNotice(data.detail || "A login code has been sent to your email.");
    otpInput.focus();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = "Send me a code";
  }
}

sendCodeBtn.addEventListener("click", requestOtp);
resendCodeBtn.addEventListener("click", requestOtp);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();

  const identifier = document.getElementById("identifier").value.trim();
  if (!identifier) {
    showError("Enter your username or email.");
    return;
  }

  const body = { identifier };
  if (mode === "password") {
    body.password = passwordInput.value;
    if (!body.password) {
      showError("Enter your password.");
      return;
    }
  } else {
    if (!codeSent) {
      showError("Send yourself a code first.");
      return;
    }
    body.otp = otpInput.value.trim();
    if (body.otp.length !== 6) {
      showError("Enter the 6-digit code from your email.");
      return;
    }
  }

  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not sign you in. Please try again.");
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
      return;
    }
    setStudentSession(data.token, data.username);
    window.location.href = NEXT_URL;
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Sign in";
  }
});

if (isStudentLoggedIn()) {
  window.location.href = NEXT_URL;
}
