// Kept in sync with the API_BASE_URL constant in app.js.
const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
const backLink = document.getElementById("back-link");
const locationIndicator = document.getElementById("location-indicator");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

function getLocationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("location");
}

function indexUrl() {
  const location = getLocationFromUrl();
  return location ? `index.html?location=${encodeURIComponent(location)}` : "index.html";
}

if (backLink) {
  backLink.href = indexUrl();
}

async function loadLocationName() {
  const location = getLocationFromUrl();
  if (!location || !locationIndicator) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/locations/`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const locations = await response.json();
    const match = locations.find((loc) => loc.slug === location);
    if (match) {
      locationIndicator.innerHTML = `📍 ${escapeHtml(match.name)} <span aria-hidden="true">⌄</span>`;
    }
  } catch (err) {
    console.error(err);
  }
}

loadLocationName();

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

function stateMessage({ icon, message, showBackLink }) {
  return `
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${icon}</span>
      <p class="text-muted text-[15px] mb-4">${message}</p>
      ${showBackLink ? `<a href="${indexUrl()}" class="text-accent-deep font-bold hover:underline">&larr; Back to CUFood</a>` : ""}
    </div>
  `;
}

function renderNotFound() {
  pageContent.innerHTML = stateMessage({
    icon: ICONS.search,
    message: "Restaurant not found.",
    showBackLink: true,
  });
}

function renderLoadError() {
  pageContent.innerHTML = stateMessage({
    icon: ICONS.warning,
    message: "Could not load this outlet. Is the backend running?",
    showBackLink: true,
  });
}

function renderMissingSlug() {
  pageContent.innerHTML = stateMessage({
    icon: ICONS.search,
    message: "No restaurant specified.",
    showBackLink: true,
  });
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

// Builds one collapsible category block. Starts collapsed (grid-rows-[0fr]);
// toggleCategory()/applyMenuSearch() below mutate these elements directly
// (never re-render) so the CSS grid-rows transition stays smooth.
function renderCategoryBlock(category, groupItems) {
  const itemsHtml = groupItems
    .map(
      (item) => `
        <div class="flex items-center justify-between gap-4 py-4 px-5 border-b border-line last:border-b-0 hover:bg-cream-alt transition-colors duration-150" data-menu-item data-item-name="${escapeHtml(item.name.toLowerCase())}">
          <span class="text-[15px] font-semibold text-ink">${escapeHtml(item.name)}</span>
          ${renderItemPrice(item)}
        </div>
      `
    )
    .join("");

  return `
    <div class="mb-3 bg-white border border-line rounded-2xl shadow-sm overflow-hidden" data-category-block data-category-name="${escapeHtml(category.toLowerCase())}">
      <button type="button" class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-cream-alt transition-colors duration-150" data-category-toggle>
        <span class="flex items-center gap-2.5 min-w-0">
          <span class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-accent to-accent-deep flex-shrink-0"></span>
          <span class="text-sm font-bold text-ink truncate">${escapeHtml(category)}</span>
          <span class="text-xs font-semibold text-muted bg-cream-alt px-2 py-0.5 rounded-full flex-shrink-0" data-category-count>${groupItems.length}</span>
        </span>
        <span class="w-4 h-4 text-muted flex-shrink-0 transition-transform duration-300" data-category-chevron>${ICONS.chevronDown}</span>
      </button>
      <div class="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out" data-category-panel>
        <div class="overflow-hidden">
          <div class="flex flex-col border-t border-line" data-category-items>
            ${itemsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMenuSection(items) {
  if (items.length === 0) {
    return stateMessage({
      icon: ICONS.plate,
      message: "Nothing available right now — check back later.",
      showBackLink: false,
    });
  }

  const groups = groupItemsByCategory(items);
  const itemWord = items.length === 1 ? "item" : "items";
  const categoryWord = groups.size === 1 ? "category" : "categories";
  let html = `
    <div class="relative mb-3">
      <span class="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none">${ICONS.search}</span>
      <input
        type="text"
        id="menu-search-input"
        placeholder="Search this menu…"
        autocomplete="off"
        class="w-full rounded-full border-2 border-line bg-white pl-14 pr-6 py-4 text-base font-medium text-ink placeholder:text-muted placeholder:font-normal shadow-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150"
      >
    </div>
    <p class="text-sm font-bold text-accent-deep mb-6">${items.length} ${itemWord} · ${groups.size} ${categoryWord}</p>
    <div data-category-list>
  `;

  groups.forEach((groupItems, category) => {
    html += renderCategoryBlock(category, groupItems);
  });

  html += `</div>`;
  html += `
    <div class="hidden text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14" data-no-search-results>
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.search}</span>
      <p class="text-muted text-[15px]">No items match your search</p>
    </div>
  `;

  return html;
}

function setCategoryExpanded(block, expanded) {
  const panel = block.querySelector("[data-category-panel]");
  const chevron = block.querySelector("[data-category-chevron]");
  panel.classList.toggle("grid-rows-[0fr]", !expanded);
  panel.classList.toggle("grid-rows-[1fr]", expanded);
  panel.classList.toggle("opacity-0", !expanded);
  panel.classList.toggle("opacity-100", expanded);
  chevron.classList.toggle("rotate-180", expanded);
}

function toggleCategory(block) {
  const panel = block.querySelector("[data-category-panel]");
  const isExpanded = panel.classList.contains("grid-rows-[1fr]");
  setCategoryExpanded(block, !isExpanded);
}

function applyMenuSearch(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  const categoryBlocks = document.querySelectorAll("[data-category-block]");
  const noResultsMessage = document.querySelector("[data-no-search-results]");
  let anyCategoryVisible = false;

  categoryBlocks.forEach((block) => {
    if (query === "") {
      block.classList.remove("hidden");
      setCategoryExpanded(block, false);
      block.querySelectorAll("[data-menu-item]").forEach((row) => row.classList.remove("hidden"));
      anyCategoryVisible = true;
      return;
    }

    const categoryName = block.dataset.categoryName || "";
    const categoryMatches = categoryName.includes(query);
    let categoryHasMatch = false;

    block.querySelectorAll("[data-menu-item]").forEach((row) => {
      const itemMatches = categoryMatches || (row.dataset.itemName || "").includes(query);
      row.classList.toggle("hidden", !itemMatches);
      if (itemMatches) categoryHasMatch = true;
    });

    block.classList.toggle("hidden", !categoryHasMatch);
    if (categoryHasMatch) {
      setCategoryExpanded(block, true);
      anyCategoryVisible = true;
    }
  });

  if (noResultsMessage) {
    noResultsMessage.classList.toggle("hidden", query === "" || anyCategoryVisible);
  }
}

function initMenuInteractivity() {
  const categoryList = document.querySelector("[data-category-list]");
  if (categoryList) {
    categoryList.addEventListener("click", (event) => {
      const toggleButton = event.target.closest("[data-category-toggle]");
      if (!toggleButton) return;
      toggleCategory(toggleButton.closest("[data-category-block]"));
    });
  }

  const searchInput = document.getElementById("menu-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => applyMenuSearch(searchInput.value));
  }
}

function renderRestaurant(restaurant) {
  const photoStyle = restaurant.logo
    ? ` style="background-image: url('${escapeHtml(restaurant.logo)}')"`
    : "";
  const photoInner = restaurant.logo
    ? ""
    : `
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
        <span class="w-10 h-10">${ICONS.plate}</span>
        <span class="text-sm font-semibold">No photo</span>
      </div>
    `;

  const statusPill = restaurant.is_open_today
    ? `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-white/95 backdrop-blur shadow-sm text-accent-deep"><span class="w-1.5 h-1.5 rounded-full bg-accent"></span>Open today</span>`
    : `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-white/95 backdrop-blur shadow-sm text-muted"><span class="w-1.5 h-1.5 rounded-full bg-muted"></span>Closed today</span>`;

  const callPill = restaurant.contact_number
    ? `<a href="tel:${escapeHtml(restaurant.contact_number.replace(/\s+/g, ""))}" class="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full bg-gradient-to-br from-accent to-accent-deep text-white shadow-accent-glow hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150"><span class="w-3 h-3">${ICONS.phone}</span>Call</a>`
    : "";

  pageContent.innerHTML = `
    <div class="relative h-72 sm:h-[420px] rounded-2xl overflow-hidden shadow-xl mb-10">
      <div class="absolute inset-0 bg-stone-200 bg-cover bg-center"${photoStyle}>${photoInner}</div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
      <div class="absolute bottom-0 inset-x-0 p-6 sm:p-9 flex flex-col gap-3 sm:gap-4">
        <h1 class="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight drop-shadow-lg">${escapeHtml(restaurant.name)}</h1>
        <div class="flex items-center gap-2.5 flex-wrap">
          ${statusPill}
          ${callPill}
        </div>
      </div>
    </div>
    <section id="menu-section">
      ${renderMenuSection(restaurant.menu_items || [])}
    </section>
  `;

  initMenuInteractivity();
}

async function loadRestaurant() {
  const slug = getSlugFromUrl();

  if (!slug) {
    renderMissingSlug();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/restaurants/${encodeURIComponent(slug)}/`);
    if (response.status === 404) {
      renderNotFound();
      return;
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const restaurant = await response.json();
    renderRestaurant(restaurant);
  } catch (err) {
    renderLoadError();
    console.error(err);
  }
}

loadRestaurant();
