const API_BASE_URL = "http://localhost:8000";

const restaurantRow = document.getElementById("restaurant-row");
const restaurantRowSection = document.getElementById("restaurant-row-section");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const locationIndicator = document.getElementById("location-indicator");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");

let searchDebounceTimer = null;
let currentLocationName = "";

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
      "group block rounded-2xl overflow-hidden bg-white border border-line shadow-sm hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 transition-all duration-300";

    const media = document.createElement("div");
    media.className = "relative aspect-video overflow-hidden bg-stone-100";

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
        <span class="w-8 h-8 opacity-60">${ICONS.plate}</span>
        <span class="text-xs font-semibold">No photo</span>
      `;
    }

    const badge = document.createElement("span");
    badge.className = restaurant.is_open_today
      ? "absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm bg-white text-accent-deep"
      : "absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm bg-stone-100 text-muted";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${restaurant.is_open_today ? "bg-accent" : "bg-muted"}"></span>${restaurant.is_open_today ? "Open" : "Closed today"}`;

    media.appendChild(photo);
    media.appendChild(badge);

    const body = document.createElement("div");
    body.className = "p-4";

    const name = document.createElement("h3");
    name.className = "font-bold text-sm leading-snug " + (restaurant.is_open_today ? "text-ink" : "text-muted");
    name.textContent = restaurant.name;

    body.appendChild(name);

    card.appendChild(media);
    card.appendChild(body);
    restaurantRow.appendChild(card);
  });
}

async function loadRestaurants() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/?location=${encodeURIComponent(currentLocation)}`
    );
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const restaurants = await response.json();
    renderRestaurants(restaurants);
  } catch (err) {
    renderEmptyState(restaurantRow, "Could not load restaurants. Is the backend running?");
    console.error(err);
  }
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
      "block rounded-2xl bg-white border border-line shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 px-5 py-4 text-[15px] text-ink";
    item.href = restaurantUrl(result.restaurant_slug);
    const itemWord = result.matching_item_count === 1 ? "item" : "items";
    item.innerHTML = `<strong class="font-bold text-accent-deep">${result.restaurant_name}</strong> — ${result.matching_item_count} matching ${itemWord}`;
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
