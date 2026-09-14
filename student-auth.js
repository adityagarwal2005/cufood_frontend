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

  // The mirror image: My Orders is meaningless to someone signed out, and
  // is the first thing a signed-in student looks for. It starts hidden in
  // the markup so a signed-out visitor never sees it flash on load.
  const myOrdersLink = document.getElementById("my-orders-link");
  if (myOrdersLink) {
    myOrdersLink.classList.toggle("hidden", !isStudentLoggedIn());
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

// ---- Notifications ----------------------------------------------------
// Nearly every student uses the installed app, where a notification is the
// only way to hear that an order was accepted once the app is closed. So a
// signed-in student's phone is signed up on their account — once, covering
// every order — and quietly re-registered each time the app opens, so a
// subscription the browser rotates never goes stale.
//
// Names are prefixed on purpose: this file shares one global scope with
// each page's own script, and checkout.js already has a VAPID_PUBLIC_KEY.
const STUDENT_PUSH_VAPID_KEY = "BOsXYYIQK2rY1nET_I-NXr-A6ts9_WDH9kEjZYBUC7mGhcfLqRLy3jbXtD3X72WZU1gaAqI_yOz8pO_6FNhhHqo";
const PUSH_PROMPT_SNOOZE_KEY = "cufood_push_prompt_snoozed_at";
const PUSH_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function studentPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function studentPushKeyBytes() {
  const padding = "=".repeat((4 - (STUDENT_PUSH_VAPID_KEY.length % 4)) % 4);
  const raw = atob((STUDENT_PUSH_VAPID_KEY + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Asks only when the student hasn't decided yet. Resolves true once this
// phone is signed up on their account.
async function enableStudentPush() {
  if (!studentPushSupported() || !isStudentLoggedIn()) return false;
  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return false;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: studentPushKeyBytes(),
      });
    }
    const response = await fetch(`${API_BASE_URL}/api/students/push/subscribe/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...studentAuthHeaders() },
      body: JSON.stringify(subscription.toJSON()),
    });
    return response.ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function pushPromptSnoozed() {
  try {
    const at = Number(localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY));
    return Boolean(at) && Date.now() - at < PUSH_PROMPT_SNOOZE_MS;
  } catch (err) {
    return false;
  }
}

// A card rather than a chip, on pages that provide a #push-prompt slot, for
// a signed-in student who hasn't allowed or blocked notifications yet.
// "Not now" hides it for three days instead of for good: a student who
// skipped it before their first order is exactly who needs it after.
function renderStudentPushPrompt() {
  const slot = document.getElementById("push-prompt");
  if (!slot) return;
  const show =
    studentPushSupported() && isStudentLoggedIn() && Notification.permission === "default" && !pushPromptSnoozed();
  if (!show) {
    slot.innerHTML = "";
    return;
  }
  slot.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4 mb-8 text-left">
      <div class="min-w-0 sm:flex-1">
        <p class="text-sm font-bold text-ink">Know the moment your order is accepted</p>
        <p class="text-xs text-muted mt-1">Turn on notifications to hear when it's accepted and ready, even with the app closed.</p>
      </div>
      <div class="flex items-center gap-4">
        <button type="button" id="push-prompt-later" class="text-xs font-bold uppercase tracking-wide text-muted hover:text-ink transition-colors duration-150 whitespace-nowrap">Not now</button>
        <button type="button" id="push-prompt-enable" class="flex-1 sm:flex-none rounded-full bg-accent text-white font-bold text-sm px-5 py-2.5 hover:bg-accent-deep hover:text-ink transition-colors duration-150 whitespace-nowrap">Turn on</button>
      </div>
    </div>
  `;
  document.getElementById("push-prompt-later").addEventListener("click", () => {
    try {
      localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(Date.now()));
    } catch (err) {
      // Private mode or blocked storage: it just shows again next visit.
    }
    slot.innerHTML = "";
  });
  document.getElementById("push-prompt-enable").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = "Turning on…";
    await enableStudentPush();
    renderStudentPushPrompt();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (studentPushSupported() && isStudentLoggedIn() && Notification.permission === "granted") {
    enableStudentPush();
  }
  renderStudentPushPrompt();
});
