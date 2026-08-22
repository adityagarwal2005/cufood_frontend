// Shared across every student-facing page. Loaded *before* that page's own
// script (app.js/checkout.js/etc.), which is where API_BASE_URL actually
// gets declared — safe because nothing here reads it until a function is
// called later (a click, or DOMContentLoaded), by which point every
// <script> tag on the page has already finished running.
const STUDENT_TOKEN_KEY = "cufood_student_token";
const STUDENT_USERNAME_KEY = "cufood_student_username";

function getStudentToken() {
  return localStorage.getItem(STUDENT_TOKEN_KEY);
}

function getStudentUsername() {
  return localStorage.getItem(STUDENT_USERNAME_KEY);
}

function isStudentLoggedIn() {
  return !!getStudentToken();
}

function studentAuthHeaders() {
  return { Authorization: `Token ${getStudentToken()}` };
}

function setStudentSession(token, username) {
  localStorage.setItem(STUDENT_TOKEN_KEY, token);
  localStorage.setItem(STUDENT_USERNAME_KEY, username);
}

function clearStudentSession() {
  localStorage.removeItem(STUDENT_TOKEN_KEY);
  localStorage.removeItem(STUDENT_USERNAME_KEY);
}

async function studentLogout() {
  try {
    await fetch(`${API_BASE_URL}/api/logout/`, { method: "POST", headers: studentAuthHeaders() });
  } catch (err) {
    // Token gets cleared client-side regardless — a failed logout call
    // shouldn't leave someone stuck "logged in" on their own device.
  }
  clearStudentSession();
  window.location.reload();
}

function escapeHtmlLocal(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Every student-facing header has an empty <span id="account-nav"> where
// this drops in either "Sign in" or "Hi, <username> · Log out".
function renderAccountNav() {
  // Restaurant Login only makes sense to someone who isn't already a
  // signed-in student — once you're in, that button is just clutter (and
  // a wrong-audience distraction), so it hides itself instead of a
  // logged-in student having to ignore it every time.
  const restaurantLoginLink = document.getElementById("restaurant-login-link");
  if (restaurantLoginLink) {
    restaurantLoginLink.classList.toggle("hidden", isStudentLoggedIn());
  }

  const el = document.getElementById("account-nav");
  if (!el) return;
  if (isStudentLoggedIn()) {
    el.innerHTML = `
      <span class="text-xs font-bold uppercase tracking-wide text-ink whitespace-nowrap">Hi, ${escapeHtmlLocal(getStudentUsername())}</span>
      <button type="button" id="account-logout-btn" class="text-xs font-bold uppercase tracking-wide text-muted hover:text-accent-deep transition-colors duration-150">Log out</button>
    `;
    document.getElementById("account-logout-btn").addEventListener("click", studentLogout);
  } else {
    el.innerHTML = `<a href="student-login.html" class="text-xs font-bold uppercase tracking-wide text-ink hover:text-accent-deep transition-colors duration-150">Sign in</a>`;
  }
}

document.addEventListener("DOMContentLoaded", renderAccountNav);
