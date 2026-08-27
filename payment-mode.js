// Chooses how Razorpay Checkout reports its result, based on where the
// page is running.
//
// In a browser tab, Checkout's handler/ondismiss callbacks fire normally
// and we keep them: the student stays on the page and nothing reloads.
//
// Inside the installed Android app (a TWA) that assumption breaks. Paying
// by UPI hands control to PhonePe/GPay/Paytm, and on the way back the
// page that opened Checkout may already have been torn down — so neither
// handler nor ondismiss is guaranteed to run. That's what stranded
// students on "Waiting for payment" after they had actually paid, and
// what produced "the id provided does not exist" when Checkout came back
// to a context that no longer knew about its own payment.
//
// Redirect mode doesn't depend on any of that surviving: Razorpay POSTs
// the result to the backend (see RazorpayCallbackView) and the browser is
// sent to the order-status page. Payment confirmation itself is still
// server-side and signature-verified either way.

function isInstalledApp() {
  // android-app:// referrer is the documented TWA signal; display-mode
  // also catches a PWA installed to the home screen, which reaches
  // Checkout through the same app-switch.
  return (
    (document.referrer || "").startsWith("android-app://") ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// Returns the Checkout options unchanged in a normal tab. In the app,
// switches to redirect mode — where Checkout ignores handler/ondismiss,
// so callers must not rely on them for anything the payment depends on.
function withAppPaymentMode(options) {
  if (!isInstalledApp()) return options;
  return {
    ...options,
    redirect: true,
    // Deliberately the site's own domain rather than the Cloud Run URL,
    // for two reasons. Razorpay refuses a callback_url whose domain isn't
    // allowlisted on the merchant account, and only cufood.in is. And a
    // callback on any other host would fall outside the TWA's scope, so
    // the app would boot the student into an external browser tab
    // mid-payment. Vercel proxies this path through to the backend —
    // see the rewrite in vercel.json.
    callback_url: `${window.location.origin}/api/payments/callback/`,
  };
}
