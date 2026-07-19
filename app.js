const API_BASE_URL = "https://cufood-backend.onrender.com";

const restaurantRow = document.getElementById("restaurant-row");
const restaurantRowSection = document.getElementById("restaurant-row-section");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const locationIndicator = document.getElementById("location-indicator");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");
const outletStats = document.getElementById("outlet-stats");
const openOnlyToggle = document.getElementById("open-only-toggle");

let searchDebounceTimer = null;
let currentLocationName = "";
let allRestaurants = [];
let openOnlyFilter = false;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const currentLocation = new URLSearchParams(window.location.search).get("location");

if (!currentLocation) {
  window.location.href = "location-select.html";
}

function restaurantUrl(slug) {
  return `restaurant.html?slug=${encodeURIComponent(slug)}&location=${encodeURIComponent(currentLocation)}`;
}

function renderEmptyState(container, message) {
  container.innerHTML = `
    <div class="col-span-full text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.plate}</span>
      <p class="text-muted text-[15px] mb-4">${message}</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Switch location</a>
    </div>
  `;
}

function updateOutletStats(restaurants) {
  if (!outletStats) return;
  if (restaurants.length === 0) {
    outletStats.textContent = "";
    return;
  }
  const openCount = restaurants.filter((r) => r.is_open_today).length;
  const outletWord = restaurants.length === 1 ? "outlet" : "outlets";
  outletStats.textContent = `${restaurants.length} ${outletWord} · ${openCount} open right now`;
}

function applyRestaurantFilter() {
  const filtered = openOnlyFilter ? allRestaurants.filter((r) => r.is_open_today) : allRestaurants;

  if (allRestaurants.length > 0 && filtered.length === 0) {
    renderEmptyState(restaurantRow, "No outlets are open right now — try again later.");
    return;
  }

  renderRestaurants(filtered);
}

function renderRestaurants(restaurants) {
  restaurantRow.innerHTML = "";

  if (restaurants.length === 0) {
    const locationLabel = escapeHtml(currentLocationName || "this location");
    renderEmptyState(
      restaurantRow,
      `No outlets listed at ${locationLabel} yet — check back soon.`
    );
    return;
  }

  restaurants.forEach((restaurant) => {
    const card = document.createElement("a");
    card.href = restaurantUrl(restaurant.slug);
    card.className =
      "group relative block aspect-[16/10] sm:aspect-[2/1] rounded-3xl overflow-hidden shadow-md ring-1 ring-black/5 hover:shadow-2xl hover:-translate-y-1.5 active:translate-y-0 transition-all duration-300 bg-stone-200";

    const photo = document.createElement("div");
    if (restaurant.logo) {
      photo.className =
        "absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" +
        (restaurant.is_open_today ? "" : " grayscale opacity-60");
      photo.style.backgroundImage = `url("${restaurant.logo}")`;
    } else {
      photo.className =
        "absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted" +
        (restaurant.is_open_today ? "" : " grayscale opacity-60");
      photo.innerHTML = `
        <span class="w-10 h-10 opacity-60">${ICONS.plate}</span>
        <span class="text-xs font-semibold">No photo</span>
      `;
    }

    const scrim = document.createElement("div");
    scrim.className = "absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent";

    const badge = document.createElement("span");
    badge.className = restaurant.is_open_today
      ? "absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full shadow-sm bg-white/95 backdrop-blur text-accent-deep"
      : "absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full shadow-sm bg-white/80 backdrop-blur text-muted";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${restaurant.is_open_today ? "bg-accent" : "bg-muted"}"></span>${restaurant.is_open_today ? "Open" : "Closed today"}`;

    const arrowChip = document.createElement("span");
    arrowChip.className =
      "absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white/15 border border-white/25 backdrop-blur text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300";
    arrowChip.innerHTML = `<span class="w-4 h-4">${ICONS.arrowRight}</span>`;

    const nameWrap = document.createElement("div");
    nameWrap.className = "absolute bottom-0 inset-x-0 p-5 sm:p-6 flex items-end justify-between gap-3";
    nameWrap.innerHTML = `
      <h3 class="font-extrabold text-xl sm:text-2xl leading-snug text-white drop-shadow-md">${escapeHtml(restaurant.name)}</h3>
      <span class="hidden sm:inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-white/80 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 whitespace-nowrap">View menu &rarr;</span>
    `;

    card.appendChild(photo);
    card.appendChild(scrim);
    card.appendChild(badge);
    card.appendChild(arrowChip);
    card.appendChild(nameWrap);
    restaurantRow.appendChild(card);
  });
}

async function loadRestaurants() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/?location=${encodeURIComponent(currentLocation)}`
    );
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    allRestaurants = await response.json();
    updateOutletStats(allRestaurants);
    applyRestaurantFilter();
  } catch (err) {
    renderEmptyState(restaurantRow, "Could not load restaurants. Is the backend running?");
    console.error(err);
  }
}

if (openOnlyToggle) {
  openOnlyToggle.addEventListener("click", () => {
    openOnlyFilter = !openOnlyFilter;
    openOnlyToggle.classList.toggle("bg-gradient-to-br", openOnlyFilter);
    openOnlyToggle.classList.toggle("from-accent", openOnlyFilter);
    openOnlyToggle.classList.toggle("to-accent-deep", openOnlyFilter);
    openOnlyToggle.classList.toggle("text-white", openOnlyFilter);
    openOnlyToggle.classList.toggle("shadow-accent-glow", openOnlyFilter);
    openOnlyToggle.classList.toggle("bg-white", !openOnlyFilter);
    openOnlyToggle.classList.toggle("text-ink", !openOnlyFilter);
    applyRestaurantFilter();
  });
}

function renderSearchResults(results) {
  searchResults.innerHTML = "";

  if (results.length === 0) {
    const locationLabel = escapeHtml(currentLocationName || "this location");
    renderEmptyState(searchResults, `No matching items found at ${locationLabel}.`);
    return;
  }

  results.forEach((result) => {
    const item = document.createElement("a");
    item.className =
      "group flex items-center gap-4 rounded-2xl bg-white border border-line shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-accent-soft transition-all duration-200 px-5 py-4";
    item.href = restaurantUrl(result.restaurant_slug);
    const itemWord = result.matching_item_count === 1 ? "item" : "items";
    item.innerHTML = `
      <span class="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-soft text-accent-deep flex-shrink-0 p-2.5">${ICONS.plate}</span>
      <span class="flex-1 min-w-0 text-[15px] text-ink">
        <strong class="font-bold text-ink">${escapeHtml(result.restaurant_name)}</strong>
        <span class="text-muted"> — ${result.matching_item_count} matching ${itemWord}</span>
      </span>
      <span class="w-4 h-4 text-muted flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">${ICONS.arrowRight}</span>
    `;
    searchResults.appendChild(item);
  });
}

async function runSearch(term) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/search/?q=${encodeURIComponent(term)}&location=${encodeURIComponent(currentLocation)}`
    );
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const results = await response.json();
    renderSearchResults(results);
  } catch (err) {
    renderEmptyState(searchResults, "Search failed. Is the backend running?");
    console.error(err);
  }
}

function setSearchActive(isActive) {
  searchResults.classList.toggle("hidden", !isActive);
  restaurantRowSection.classList.toggle("hidden", isActive);
}

searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim();

  clearTimeout(searchDebounceTimer);

  if (term === "") {
    setSearchActive(false);
    searchResults.innerHTML = "";
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    setSearchActive(true);
    runSearch(term);
  }, 300);
});

async function loadLocationName() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/locations/`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const locations = await response.json();
    const match = locations.find((location) => location.slug === currentLocation);
    if (match) {
      currentLocationName = match.name;
      locationIndicator.innerHTML = `📍 ${escapeHtml(match.name)} <span aria-hidden="true">⌄</span>`;
      heroTitle.textContent = `Shops in ${match.name}`;
      heroSubtitle.textContent = `Find what's cooking at ${match.name} right now — search a dish or browse every outlet.`;
    }
  } catch (err) {
    console.error(err);
  }
}

if (currentLocation) {
  loadLocationName();
  loadRestaurants();
}
