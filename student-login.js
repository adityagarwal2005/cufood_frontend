// Kept in sync with the API_BASE_URL constant in the owner-side files.
const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";

const params = new URLSearchParams(window.location.search);
// Where to send the student after a successful sign-in — checkout.js sets
// this when it bounces someone here for not being logged in yet.
const NEXT_URL = params.get("next") || "location-select.html";

// Password is the default; "Sign in with a code instead" switches to an
// emailed code, the way most apps offer it.
//
// Reading that code means leaving for Gmail, and when a student comes back
// the app has often reloaded the page, which used to drop them on the
// password form with no trace of the code they had just been sent. So the
// code step is remembered for as long as the code works on the server
// (EmailOTP.OTP_TTL_MINUTES, 10 minutes) and restored on load.
const PENDING_CODE_KEY = "cufood_login_code_pending";
const CODE_TTL_MS = 10 * 60 * 1000;

let mode = "password"; // "password" | "otp"
let codeSent = false;

const identifierInput = document.getElementById("identifier");
const passwordField = document.getElementById("password-field");
const otpField = document.getElementById("otp-field");
const otpInputWrap = document.getElementById("otp-input-wrap");
const passwordInput = document.getElementById("password");
const otpInput = document.getElementById("otp");
const sendCodeBtn = document.getElementById("send-code-btn");
const resendCodeBtn = document.getElementById("resend-code-btn");
const modeSwitchBtn = document.getElementById("mode-switch-btn");
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

function savePendingCode(identifier) {
  try {
    localStorage.setItem(PENDING_CODE_KEY, JSON.stringify({ identifier, at: Date.now() }));
  } catch (err) {
    // Storage blocked: the code still works, it just isn't restored.
  }
}

function loadPendingCode() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_CODE_KEY) || "null");
    return saved && Date.now() - saved.at < CODE_TTL_MS ? saved : null;
  } catch (err) {
    return null;
  }
}

function clearPendingCode() {
  try {
    localStorage.removeItem(PENDING_CODE_KEY);
  } catch (err) {
    // Nothing to clear.
  }
}

function render() {
  passwordField.classList.toggle("hidden", mode !== "password");
  otpField.classList.toggle("hidden", mode !== "otp");
  otpField.classList.toggle("flex", mode === "otp");
  otpInputWrap.classList.toggle("hidden", !codeSent);
  otpInputWrap.classList.toggle("flex", codeSent);
  sendCodeBtn.classList.toggle("hidden", codeSent);
  // Until a code has been sent there is nothing to sign in with, so the
  // only action on screen is sending one.
  loginSubmit.classList.toggle("hidden", mode === "otp" && !codeSent);
  modeSwitchBtn.textContent = mode === "password" ? "Sign in with a code instead" : "Sign in with password instead";
}

function setMode(newMode) {
  mode = newMode;
  codeSent = false;
  clearPendingCode();
  hideMessages();
  render();
  if (!identifierInput.value.trim()) identifierInput.focus();
  else if (mode === "password") passwordInput.focus();
}

modeSwitchBtn.addEventListener("click", () => setMode(mode === "password" ? "otp" : "password"));

async function requestOtp() {
  const identifier = identifierInput.value.trim();
  if (!identifier) {
    showError("Enter your username or email first.");
    identifierInput.focus();
    return;
  }
  hideMessages();
  const btn = codeSent ? resendCodeBtn : sendCodeBtn;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/request-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not send a code. Please try again.");
      return;
    }
    codeSent = true;
    savePendingCode(identifier);
    render();
    showNotice(data.detail || "A login code has been sent to your email.");
    otpInput.value = "";
    otpInput.focus();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

sendCodeBtn.addEventListener("click", requestOtp);
resendCodeBtn.addEventListener("click", requestOtp);

// Codes get pasted from an email as often as typed, frequently with spaces
// or words around them. Keep only the digits, and sign in the moment all
// six are there rather than making the student find the button.
otpInput.addEventListener("input", () => {
  const digits = otpInput.value.replace(/\D/g, "").slice(0, 6);
  if (otpInput.value !== digits) otpInput.value = digits;
  if (digits.length === 6 && !loginSubmit.disabled) loginSubmit.click();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();

  const identifier = identifierInput.value.trim();
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
    clearPendingCode();
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
} else {
  const pending = loadPendingCode();
  if (pending) {
    // Back from reading the code: pick up exactly where they left off.
    mode = "otp";
    codeSent = true;
    identifierInput.value = pending.identifier;
    render();
    showNotice("We emailed you a 6-digit code. Enter it below.");
    otpInput.focus();
  } else {
    render();
  }
}
