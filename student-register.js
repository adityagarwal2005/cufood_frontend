const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";

const params = new URLSearchParams(window.location.search);
const NEXT_URL = params.get("next") || "location-select.html";

const registerCard = document.getElementById("register-card");
const registerForm = document.getElementById("register-form");
const registerSubmit = document.getElementById("register-submit");
const registerError = document.getElementById("register-error");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");

const verifyCard = document.getElementById("verify-card");
const verifyForm = document.getElementById("verify-form");
const verifySubmit = document.getElementById("verify-submit");
const verifyError = document.getElementById("verify-error");
const verifyNotice = document.getElementById("verify-notice");
const otpInput = document.getElementById("otp");
const resendOtpBtn = document.getElementById("resend-otp-btn");
const signinLink = document.getElementById("signin-link");

// Set once step 1 succeeds — username also works as the identifier for
// step 2, but the email is what the code actually got sent to, so it
// makes the confirmation message clearer.
let pendingUsername = null;
let pendingEmail = null;

// Same reason as the sign-in page: the code is read in Gmail, and the app
// often reloads the page by the time the student is back. The verify step
// is remembered for as long as the code works (10 minutes) so they land on
// it again instead of an empty sign-up form.
const PENDING_SIGNUP_KEY = "cufood_signup_code_pending";
const CODE_TTL_MS = 10 * 60 * 1000;
const restartSignupBtn = document.getElementById("restart-signup-btn");

function savePendingSignup() {
  try {
    localStorage.setItem(
      PENDING_SIGNUP_KEY,
      JSON.stringify({ username: pendingUsername, email: pendingEmail, at: Date.now() })
    );
  } catch (err) {
    // Storage blocked: the code still works, it just isn't restored.
  }
}

function loadPendingSignup() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || "null");
    return saved && Date.now() - saved.at < CODE_TTL_MS ? saved : null;
  } catch (err) {
    return null;
  }
}

function clearPendingSignup() {
  try {
    localStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch (err) {
    // Nothing to clear.
  }
}

function showVerifyStep() {
  verifyNotice.textContent = `We've sent a 6-digit code to ${pendingEmail}. Enter it below to finish creating your account.`;
  registerCard.classList.add("hidden");
  signinLink.classList.add("hidden");
  verifyCard.classList.remove("hidden");
  otpInput.focus();
}

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
  registerSubmit.textContent = "Sending code…";

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
    pendingUsername = username;
    pendingEmail = email;
    savePendingSignup();
    showVerifyStep();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    registerSubmit.disabled = false;
    registerSubmit.textContent = "Create account";
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  verifyError.classList.add("hidden");

  const otp = otpInput.value.trim();
  if (otp.length !== 6) {
    verifyError.textContent = "Enter the 6-digit code from your email.";
    verifyError.classList.remove("hidden");
    return;
  }

  verifySubmit.disabled = true;
  verifySubmit.textContent = "Verifying…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/verify-registration/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: pendingUsername, otp }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      verifyError.textContent = data.detail || "Could not verify that code. Please try again.";
      verifyError.classList.remove("hidden");
      verifySubmit.disabled = false;
      verifySubmit.textContent = "Verify & create account";
      return;
    }
    clearPendingSignup();
    setStudentSession(data.token, data.username);
    window.location.href = NEXT_URL;
  } catch (err) {
    verifyError.textContent = "Could not reach the server. Please try again.";
    verifyError.classList.remove("hidden");
    console.error(err);
    verifySubmit.disabled = false;
    verifySubmit.textContent = "Verify & create account";
  }
});

resendOtpBtn.addEventListener("click", async () => {
  verifyError.classList.add("hidden");
  resendOtpBtn.disabled = true;
  resendOtpBtn.textContent = "Sending…";

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/resend-registration-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: pendingUsername }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      verifyError.textContent = data.detail || "Could not resend the code. Please try again.";
      verifyError.classList.remove("hidden");
    } else {
      verifyNotice.textContent = data.detail || `A new code has been sent to ${pendingEmail}.`;
    }
  } catch (err) {
    verifyError.textContent = "Could not reach the server. Please try again.";
    verifyError.classList.remove("hidden");
    console.error(err);
  } finally {
    resendOtpBtn.disabled = false;
    resendOtpBtn.textContent = "Resend code";
  }
});

if (isStudentLoggedIn()) {
  window.location.href = NEXT_URL;
}

restartSignupBtn.addEventListener("click", () => {
  clearPendingSignup();
  pendingUsername = null;
  pendingEmail = null;
  otpInput.value = "";
  verifyError.classList.add("hidden");
  verifyCard.classList.add("hidden");
  registerCard.classList.remove("hidden");
  signinLink.classList.remove("hidden");
  registerSubmit.disabled = false;
  registerSubmit.textContent = "Create account";
});

// Pasted codes keep only their digits; six of them verify straight away.
otpInput.addEventListener("input", () => {
  const digits = otpInput.value.replace(/\D/g, "").slice(0, 6);
  if (otpInput.value !== digits) otpInput.value = digits;
  if (digits.length === 6 && !verifySubmit.disabled) verifySubmit.click();
});

const savedSignup = loadPendingSignup();
if (savedSignup && !isStudentLoggedIn()) {
  pendingUsername = savedSignup.username;
  pendingEmail = savedSignup.email;
  showVerifyStep();
}
