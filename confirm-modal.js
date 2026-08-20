// Replaces window.confirm() everywhere — the native dialog can't be
// themed at all (wrong colors, wrong font, jarring against the rest of
// the app), so anywhere a yes/no confirmation is needed uses this instead.
// Promise-based to read the same as window.confirm() at call sites:
//   const ok = await showConfirmModal("Delete this?");
//   if (!ok) return;
function showConfirmModal(message, { confirmLabel = "Continue", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center p-6 bg-cream/80 backdrop-blur-sm animate-fade-in-up";
    overlay.innerHTML = `
      <div class="w-full max-w-sm bg-cream-alt border border-line rounded-2xl p-6 shadow-2xl animate-scale-in">
        <p id="confirm-modal-message" class="text-sm font-medium text-ink leading-relaxed mb-6"></p>
        <div class="flex items-center gap-3">
          <button type="button" id="confirm-modal-cancel" class="btn-secondary btn-sm flex-1"></button>
          <button type="button" id="confirm-modal-ok" class="btn-sm flex-1"></button>
        </div>
      </div>
    `;
    // Set via textContent, not interpolated into the innerHTML string above —
    // messages here often include restaurant/item names pulled from the
    // database, so this keeps it safe regardless of what's in them.
    overlay.querySelector("#confirm-modal-message").textContent = message;
    const cancelBtn = overlay.querySelector("#confirm-modal-cancel");
    const okBtn = overlay.querySelector("#confirm-modal-ok");
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;
    okBtn.classList.add(danger ? "btn-destructive" : "btn-primary");

    document.body.appendChild(overlay);

    function cleanup(result) {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(result);
    }
    function onKeydown(event) {
      if (event.key === "Escape") cleanup(false);
    }

    cancelBtn.addEventListener("click", () => cleanup(false));
    okBtn.addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup(false);
    });
    document.addEventListener("keydown", onKeydown);
    okBtn.focus();
  });
}
