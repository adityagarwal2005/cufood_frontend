const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
const backLink = document.getElementById("back-link");

// Kept outside renderCheckout() so it survives cart-quantity re-renders —
// a student shouldn't have to retake their photo just because they bumped
// an item's quantity.
let studentPhotoDataUrl = null;

// Downscales + re-encodes the picked photo to a small JPEG (max ~480px on
// the long edge) so it stays a quick upload and a reasonable amount of text
// to store, while still being clear enough for a restaurant to recognize a
// face against.
function readAndCompressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(price) {
  if (price === null || price === undefined) return "";
  const value = parseFloat(price);
  if (Number.isNaN(value)) return "";
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

function emptyCartView() {
  pageContent.innerHTML = `
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.cart}</span>
      <p class="text-muted text-[15px] mb-4">Your cart is empty.</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Browse outlets</a>
    </div>
  `;
}

function renderCartLine(key, line) {
  return `
    <div class="flex items-center justify-between gap-4 py-3 border-b border-line last:border-b-0">
      <div class="min-w-0">
        <p class="text-[15px] font-semibold text-ink truncate">${escapeHtml(line.name)}${line.sizeLabel ? ` <span class="text-muted font-medium">(${escapeHtml(line.sizeLabel)})</span>` : ""}</p>
        <p class="text-xs text-muted">${escapeHtml(formatPrice(line.unitPrice))} each</p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <div class="inline-flex items-center gap-2.5 bg-cream-alt rounded-full pl-1 pr-1 py-1">
          <button type="button" class="cart-line-remove w-7 h-7 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3.5 h-3.5 text-ink">${ICONS.minus}</span>
          </button>
          <span class="text-sm font-bold min-w-[1rem] text-center">${line.quantity}</span>
          <button type="button" class="cart-line-add w-7 h-7 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3.5 h-3.5 text-ink">${ICONS.plus}</span>
          </button>
        </div>
        <p class="text-[15px] font-bold text-accent-deep w-16 text-right">${escapeHtml(formatPrice(line.unitPrice * line.quantity))}</p>
      </div>
    </div>
  `;
}

function renderCheckout(cart) {
  const lines = Object.entries(cart.items);
  const total = getCartTotal(cart);

  pageContent.innerHTML = `
    <h1 class="text-2xl sm:text-3xl font-extrabold text-ink mb-1">Your order</h1>
    <p class="text-sm text-muted mb-6">From <span class="font-bold text-ink">${escapeHtml(cart.restaurantName)}</span></p>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-5"></div>

    <div class="bg-white border border-line rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
      <div id="cart-lines">${lines.map(([key, line]) => renderCartLine(key, line)).join("")}</div>
      <div class="flex items-center justify-between pt-4 mt-2 border-t border-line">
        <span class="text-sm font-bold text-muted uppercase tracking-wide">Total</span>
        <span class="text-xl font-extrabold text-ink">${escapeHtml(formatPrice(total))}</span>
      </div>
    </div>

    <div class="bg-cream-alt border border-line rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-4">Your details</h2>
      <form id="checkout-form" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-muted" for="student-name">Name</label>
          <input type="text" id="student-name" required
            class="rounded-xl border-2 border-line bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-muted" for="student-uid">University ID (UID)</label>
          <input type="text" id="student-uid" required
            class="rounded-xl border-2 border-line bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
          <p class="text-xs text-muted">Show this + your order code at pickup.</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-muted" for="student-photo-input">Your photo</label>
          <div class="flex items-center gap-3">
            <div id="photo-preview" class="w-16 h-16 rounded-xl bg-white border-2 ${studentPhotoDataUrl ? "border-accent" : "border-dashed border-line"} flex items-center justify-center text-muted flex-shrink-0 overflow-hidden">
              ${studentPhotoDataUrl
                ? `<img src="${studentPhotoDataUrl}" class="w-full h-full object-cover" alt="Your photo">`
                : `<span class="w-6 h-6">${ICONS.camera}</span>`}
            </div>
            <label id="photo-picker-label" for="student-photo-input" class="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep bg-accent-soft rounded-xl px-4 py-2.5 cursor-pointer hover:opacity-80 transition-opacity duration-150">
              ${studentPhotoDataUrl ? "Retake photo" : "Take / choose photo"}
            </label>
            <input type="file" id="student-photo-input" accept="image/*" capture="user" class="hidden">
          </div>
          <p class="text-xs text-muted">So the restaurant knows who to hand the order to at pickup.</p>
        </div>
        <button type="submit" id="pay-btn" class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-base px-5 py-3.5 shadow-accent-glow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 mt-1">
          Place order — ${escapeHtml(formatPrice(total))}
        </button>
        <p class="text-xs text-muted text-center leading-relaxed">No payment yet — the restaurant confirms they can make it first. You'll pay by UPI once they accept.</p>
      </form>
    </div>
  `;

  attachCheckoutListeners();
}

function attachCheckoutListeners() {
  document.querySelectorAll(".cart-line-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const line = cart && cart.items[btn.dataset.key];
      if (!line) return;
      addToCart({
        restaurantSlug: cart.restaurantSlug,
        restaurantName: cart.restaurantName,
        menuItemId: line.menuItemId,
        name: line.name,
        sizeLabel: line.sizeLabel,
        unitPrice: line.unitPrice,
      });
      refresh();
    });
  });

  document.querySelectorAll(".cart-line-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const line = cart && cart.items[btn.dataset.key];
      if (!line) return;
      removeFromCart(line.menuItemId, line.sizeLabel);
      refresh();
    });
  });

  const form = document.getElementById("checkout-form");
  if (form) form.addEventListener("submit", handleCheckoutSubmit);

  const photoInput = document.getElementById("student-photo-input");
  if (photoInput) {
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      try {
        studentPhotoDataUrl = await readAndCompressPhoto(file);
        hideError();
      } catch (err) {
        showError("Could not read that photo. Please try again.");
        console.error(err);
        return;
      }
      const preview = document.getElementById("photo-preview");
      if (preview) {
        preview.classList.remove("border-dashed", "border-line");
        preview.classList.add("border-accent");
        preview.innerHTML = `<img src="${studentPhotoDataUrl}" class="w-full h-full object-cover" alt="Your photo">`;
      }
      const label = document.getElementById("photo-picker-label");
      if (label) label.textContent = "Retake photo";
    });
  }
}

function refresh() {
  const cart = getCart();
  if (!cart || getCartItemCount(cart) === 0) {
    emptyCartView();
    return;
  }
  renderCheckout(cart);
}

function hideError() {
  const banner = document.getElementById("error-banner");
  if (banner) banner.classList.add("hidden");
}

function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function resetPlaceOrderButton() {
  const payBtn = document.getElementById("pay-btn");
  const cart = getCart();
  if (!payBtn || !cart) return;
  payBtn.disabled = false;
  payBtn.textContent = `Place order — ${formatPrice(getCartTotal(cart))}`;
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  hideError();

  const cart = getCart();
  if (!cart || getCartItemCount(cart) === 0) {
    refresh();
    return;
  }

  const studentName = document.getElementById("student-name").value.trim();
  const studentUid = document.getElementById("student-uid").value.trim();
  if (!studentName || !studentUid) {
    showError("Please fill in your name and UID.");
    return;
  }
  if (!studentPhotoDataUrl) {
    showError("Please add a photo so the restaurant can identify you at pickup.");
    return;
  }

  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Placing order...";

  const items = Object.values(cart.items).map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    size_label: line.sizeLabel,
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_slug: cart.restaurantSlug,
        student_name: studentName,
        student_uid: studentUid,
        student_photo: studentPhotoDataUrl,
        items,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || "Could not place your order. Please try again.");
      resetPlaceOrderButton();
      return;
    }
    clearCart();
    window.location.href = `order-status.html?code=${encodeURIComponent(data.order_code)}`;
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    resetPlaceOrderButton();
  }
}

if (backLink) {
  const cart = getCart();
  backLink.href = cart && cart.restaurantSlug
    ? `restaurant.html?slug=${encodeURIComponent(cart.restaurantSlug)}`
    : "location-select.html";
}

refresh();
