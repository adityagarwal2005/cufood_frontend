// Kept in sync with the API_BASE_URL constant in app.js.
const API_BASE_URL = "http://localhost:8000";

const pageContent = document.getElementById("page-content");

let restaurantData = null;

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfCookie() {
  await fetch(`${API_BASE_URL}/api/csrf/`, { credentials: "include" });
}

function csrfHeaders() {
  return { "X-CSRFToken": getCookie("csrftoken") };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  const value = parseFloat(price);
  if (Number.isNaN(value)) return null;
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

// Items with price_half/price_full set (e.g. rice dishes sold by portion)
// take priority over the plain price field, which is null in that case.
function renderItemPrice(item) {
  const half = formatPrice(item.price_half);
  const full = formatPrice(item.price_full);
  if (half || full) {
    const parts = [];
    if (half) parts.push(`Half ${half}`);
    if (full) parts.push(`Full ${full}`);
    return `<span class="text-[15px] font-bold text-accent-deep whitespace-nowrap">${escapeHtml(parts.join(" / "))}</span>`;
  }
  const price = formatPrice(item.price);
  return price ? `<span class="text-[15px] font-bold text-accent-deep whitespace-nowrap">${escapeHtml(price)}</span>` : "";
}

function groupItemsByCategory(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.category && item.category.trim() ? item.category.trim() : "Menu";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function hideError() {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.classList.add("hidden");
}

// Tailwind "peer" toggle switch. `extraInputClasses` lets callers add a
// selector hook (e.g. "item-toggle") that attachEventListeners() queries.
// The checkmark icon lives in its own span, shown via peer-checked:opacity-100.
function toggleSwitchHtml({ id, extraInputClasses, checked, dataAttrs }) {
  const idAttr = id ? ` id="${id}"` : "";
  return `
    <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
      <input type="checkbox"${idAttr} class="peer sr-only ${extraInputClasses || ""}" ${dataAttrs || ""} ${checked ? "checked" : ""}>
      <span class="block w-11 h-6 rounded-full bg-line shadow-inner peer-checked:bg-gradient-to-r peer-checked:from-accent peer-checked:to-accent-deep transition-colors duration-200"></span>
      <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center text-accent-deep p-1 opacity-0 peer-checked:opacity-100 transition-all duration-200 peer-checked:translate-x-5">${ICONS.check}</span>
    </label>
  `;
}

function stateMessage({ icon, message, card }) {
  const wrapper = card
    ? "text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14"
    : "text-center py-10";
  return `
    <div class="${wrapper}">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${icon}</span>
      <p class="text-muted text-[15px]">${message}</p>
    </div>
  `;
}

function renderMenuItemsHtml(items) {
  if (items.length === 0) {
    return stateMessage({
      icon: ICONS.plate,
      message: "No menu items yet — add your first one above.",
      card: false,
    });
  }

  const groups = groupItemsByCategory(items);
  let html = "";

  groups.forEach((groupItems, category) => {
    html += `<div class="mb-6 last:mb-0">`;
    html += `<h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted mb-3.5">
      <span class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-accent to-accent-deep"></span>
      ${escapeHtml(category)}
    </h2>`;
    html += `<div class="flex flex-col gap-2.5">`;
    groupItems.forEach((item) => {
      html += `
        <div class="flex items-center gap-4 bg-white border border-line border-l-4 border-l-transparent rounded-xl shadow-sm px-5 py-4 hover:shadow-md hover:-translate-y-0.5 hover:border-l-accent transition-all duration-200">
          <div class="flex-1 flex flex-wrap items-baseline gap-3 min-w-0">
            <span class="text-[15px] font-semibold text-ink">${escapeHtml(item.name)}</span>
            ${renderItemPrice(item)}
            ${!item.is_permanently_active ? `<span class="text-[11px] font-semibold text-muted bg-stone-100 px-2.5 py-0.5 rounded-full">Inactive</span>` : ""}
          </div>
          <div class="flex items-center gap-4 flex-shrink-0">
            ${toggleSwitchHtml({
              extraInputClasses: "item-toggle",
              checked: item.is_available_today,
              dataAttrs: `data-item-id="${item.id}"`,
            })}
            <button type="button" class="btn-delete inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-white border border-line rounded-xl px-3.5 py-2 hover:text-error hover:border-error-soft hover:bg-error-soft transition-all duration-150" data-item-id="${item.id}">
              <span class="w-3.5 h-3.5">${ICONS.trash}</span>Delete
            </button>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  });

  return html;
}

function renderDashboard() {
  const statusPill = restaurantData.is_open_today
    ? `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-accent-soft text-accent-deep"><span class="w-1.5 h-1.5 rounded-full bg-accent"></span>Open today</span>`
    : `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-stone-100 text-muted"><span class="w-1.5 h-1.5 rounded-full bg-muted"></span>Closed today</span>`;

  pageContent.innerHTML = `
    <div class="relative bg-white border border-line rounded-2xl shadow-lg p-6 sm:p-7 mb-8 overflow-hidden">
      <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent to-accent-deep"></div>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <h1 class="text-2xl sm:text-3xl font-extrabold text-ink">${escapeHtml(restaurantData.name)}</h1>
          ${statusPill}
          <div class="flex items-center gap-2.5 pl-4 border-l border-line">
            <span class="text-sm font-semibold text-muted">Open today</span>
            ${toggleSwitchHtml({ id: "open-toggle", checked: restaurantData.is_open_today })}
          </div>
        </div>
        <button type="button" id="logout-btn" class="inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-cream border border-line rounded-full px-5 py-2.5 hover:text-accent-deep hover:border-accent-soft transition-all duration-150">
          <span class="w-3.5 h-3.5">${ICONS.logout}</span>Log out
        </button>
      </div>
    </div>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-6"></div>

    <div class="bg-cream-alt border border-line rounded-2xl shadow-sm p-6 sm:p-7 mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-4">Add new item</h2>
      <form id="add-item-form" class="flex flex-wrap gap-3.5 items-end">
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-name">Name</label>
          <input type="text" id="item-name" required
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-category">Category</label>
          <input type="text" id="item-category" placeholder="Optional"
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-price">Price</label>
          <input type="number" id="item-price" placeholder="Optional" min="0" step="0.01"
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <button type="submit" id="add-item-submit" class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-sm px-5 py-2.5 shadow-accent-glow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
          <span class="w-3.5 h-3.5">${ICONS.plus}</span>Add item
        </button>
      </form>
    </div>

    <section id="menu-section" class="bg-cream-alt border border-line rounded-2xl shadow-sm p-6 sm:p-7">
      ${renderMenuItemsHtml(restaurantData.menu_items || [])}
    </section>
  `;

  attachEventListeners();
}

function attachEventListeners() {
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("open-toggle").addEventListener("change", handleToggleOpen);
  document.getElementById("add-item-form").addEventListener("submit", handleAddItem);

  document.querySelectorAll(".item-toggle").forEach((el) => {
    el.addEventListener("change", (e) => handleToggleItem(e.target.dataset.itemId, e.target));
  });

  document.querySelectorAll(".btn-delete").forEach((el) => {
    el.addEventListener("click", (e) => handleDeleteItem(e.currentTarget.dataset.itemId));
  });
}

async function handleToggleOpen(event) {
  hideError();
  const checkbox = event.target;
  const previousValue = restaurantData.is_open_today;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/toggle-open/`, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    restaurantData.is_open_today = data.is_open_today;
    renderDashboard();
  } catch (err) {
    checkbox.checked = previousValue;
    showError("Could not update open/closed status. Please try again.");
    console.error(err);
  }
}

async function handleToggleItem(itemId, checkbox) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const previousValue = item ? item.is_available_today : false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/toggle-today/`, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    if (item) item.is_available_today = data.is_available_today;
    renderDashboard();
  } catch (err) {
    checkbox.checked = previousValue;
    showError("Could not update item availability. Please try again.");
    console.error(err);
  }
}

async function handleDeleteItem(itemId) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const confirmed = window.confirm(`Delete "${item ? item.name : "this item"}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/`, {
      method: "DELETE",
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    restaurantData.menu_items = restaurantData.menu_items.filter(
      (i) => String(i.id) !== String(itemId)
    );
    renderDashboard();
  } catch (err) {
    showError("Could not delete item. Please try again.");
    console.error(err);
  }
}

async function handleAddItem(event) {
  event.preventDefault();
  hideError();

  const submitBtn = document.getElementById("add-item-submit");
  const nameInput = document.getElementById("item-name");
  const categoryInput = document.getElementById("item-category");
  const priceInput = document.getElementById("item-price");

  const name = nameInput.value.trim();
  const category = categoryInput.value.trim();
  const price = priceInput.value.trim() === "" ? null : priceInput.value.trim();

  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders(),
      },
      body: JSON.stringify({ name, category, price }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const newItem = await response.json();
    restaurantData.menu_items.push({
      ...newItem,
      is_permanently_active: true,
      is_available_today: true,
    });
    renderDashboard();
  } catch (err) {
    showError("Could not add item. Check the fields and try again.");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE_URL}/api/logout/`, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
    });
  } catch (err) {
    console.error(err);
  } finally {
    window.location.href = "restaurant-login.html";
  }
}

async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/`, {
      credentials: "include",
    });

    if (response.status === 401 || response.status === 403) {
      window.location.href = "restaurant-login.html";
      return;
    }

    if (!response.ok) throw new Error(`Request failed: ${response.status}`);

    restaurantData = await response.json();
    await ensureCsrfCookie();
    renderDashboard();
  } catch (err) {
    pageContent.innerHTML = stateMessage({
      icon: ICONS.warning,
      message: "Could not load your dashboard. Is the backend running?",
      card: true,
    });
    console.error(err);
  }
}

loadDashboard();
