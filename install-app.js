// Decides whether to offer the app, and which way to offer it.
//
// The section starts hidden in the markup and is only revealed once we
// know it can actually do something. Three cases matter:
//
//   already installed  show nothing — offering to install the app you are
//                      currently inside is confusing, not helpful
//   Android            the APK, which is the real point of this: the app
//                      is not on the Play Store, so the website is the
//                      only way to get it
//   everything else    iPhones cannot install an APK at all, and desktop
//                      does not want one. Both get Add to Home Screen,
//                      which is the same app either way — this site is a
//                      PWA and the Android build is only a wrapper around
//                      it — so nobody is being fobbed off with a lesser
//                      thing.

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isIos() {
  // iPadOS 13+ reports itself as a Mac, so the touch check is what
  // separates an iPad from an actual desktop Safari.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAlreadyInstalled() {
  return (
    (document.referrer || "").startsWith("android-app://") ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

(function setUpInstallPrompt() {
  const section = document.getElementById("install-app");
  if (!section || isAlreadyInstalled()) return;

  const cta = document.getElementById("install-cta");
  const label = document.getElementById("install-cta-label");
  const note = document.getElementById("install-note");
  const blurb = document.getElementById("install-blurb");
  const help = document.getElementById("install-help");

  if (!isAndroid()) {
    // No APK to give them, so point at the install path their device
    // actually has. The APK-specific help text would only confuse here.
    cta.removeAttribute("href");
    cta.removeAttribute("download");
    cta.setAttribute("role", "button");
    cta.classList.add("pointer-events-none", "opacity-90");
    label.textContent = isIos() ? "Tap Share, then Add to Home Screen" : "Install from your browser menu";
    note.textContent = isIos()
      ? "Free · Works like an app, straight from Safari"
      : "Free · Install from your browser's menu";
    blurb.textContent =
      "Add CUFood to your home screen and it opens like an app — same ordering, one tap away.";
    if (help) help.remove();
  }

  section.classList.remove("hidden");
})();
