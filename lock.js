// =============================================================
// Login gate for the dashboard (Supabase Auth, email + password).
// Include on every page AFTER the supabase-js CDN script:
//     <script src="lock.js" defer></script>
//
// How it works:
//  - Checks for a Supabase Auth session (stored in localStorage,
//    so you stay logged in per device).
//  - No session -> covers the page with a login screen.
//  - Session    -> page loads normally. All other Supabase clients
//    on the page (sync.js, gym.html, topbar.js) automatically pick
//    up the same session and make authenticated requests, which is
//    what the row-level-security policies require.
//  - Skips entirely inside iframes (the water embed on health.html)
//    because the parent page is already gated.
//
// NOTE: the real protection is the RLS policies in Supabase — this
// screen is just the front door. Sign out from the console with:
//     dashSignOut()
// =============================================================
(function () {
  'use strict';

  const LOCK_SUPABASE_URL = 'https://ttjtfpigiowhncopcios.supabase.co';
  const LOCK_SUPABASE_KEY = 'sb_publishable_-YJi8miADCT5dCcNQg_Ukg_8s6-G92U';

  // Never gate inside an iframe — the parent page is already gated.
  try { if (window.self !== window.top) return; } catch (e) { return; }

  // If the supabase library failed to load (offline), fail open:
  // the page is usable but every cloud call will fail anyway, and
  // the data itself is protected server-side by RLS.
  if (!window.supabase) return;

  // Hide the page while we check for a session (it's a local check,
  // so this resolves in a few ms — no visible flash either way).
  const rootEl = document.documentElement;
  const prevVisibility = rootEl.style.visibility;
  rootEl.style.visibility = 'hidden';
  function unhide() { rootEl.style.visibility = prevVisibility || ''; }

  const supa = window.supabase.createClient(LOCK_SUPABASE_URL, LOCK_SUPABASE_KEY);
  window.dashSignOut = function () {
    supa.auth.signOut().then(() => window.location.reload());
  };

  const css = `
.lock-screen {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: #050506;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.lock-screen::before {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 82% 14%, rgba(224, 118, 88, 0.16), transparent 45%),
    radial-gradient(circle at 18% 90%, rgba(180, 180, 200, 0.06), transparent 50%);
  filter: blur(40px);
  pointer-events: none;
}
.lock-card {
  position: relative;
  width: 100%; max-width: 360px;
  padding: 28px 24px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
}
.lock-title {
  margin: 0 0 4px;
  font-size: 24px; font-weight: 700; letter-spacing: -0.025em;
  background: linear-gradient(180deg, #FFFFFF 0%, #C7C4BC 120%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.lock-sub {
  margin: 0 0 20px;
  font-size: 12px; color: #76746E;
}
.lock-field { margin-bottom: 10px; }
.lock-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  background: rgba(0,0,0,0.28);
  color: #FAFAFA;
  font-family: inherit; font-size: 15px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
}
.lock-input::placeholder { color: #76746E; }
.lock-input:focus { border-color: rgba(255,255,255,0.28); background: rgba(0,0,0,0.36); }
.lock-btn {
  width: 100%;
  margin-top: 6px;
  padding: 12px;
  border: 0; border-radius: 12px;
  background: linear-gradient(180deg, #FFFFFF 0%, #E8E5DD 100%);
  color: #0A0A0B;
  font-family: inherit; font-size: 14px; font-weight: 700;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.9),
    0 2px 8px rgba(0,0,0,0.35),
    0 8px 22px rgba(0,0,0,0.25);
  transition: transform 0.1s, filter 0.15s, opacity 0.15s;
}
.lock-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.lock-btn:active { transform: translateY(0); }
.lock-btn:disabled { opacity: 0.6; cursor: wait; transform: none; }
.lock-error {
  min-height: 16px;
  margin-top: 10px;
  font-size: 12px; color: #FF6B6B;
  text-align: center;
}
`;

  function showLockScreen() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'lock-screen';
    overlay.innerHTML =
      '<div class="lock-card">' +
        '<h1 class="lock-title">Dashboard</h1>' +
        '<p class="lock-sub">Sign in to continue</p>' +
        '<form id="lockForm">' +
          '<div class="lock-field">' +
            '<input class="lock-input" id="lockEmail" type="email" placeholder="Email" autocomplete="email" required>' +
          '</div>' +
          '<div class="lock-field">' +
            '<input class="lock-input" id="lockPassword" type="password" placeholder="Password" autocomplete="current-password" required>' +
          '</div>' +
          '<button class="lock-btn" id="lockSubmit" type="submit">Sign in</button>' +
          '<div class="lock-error" id="lockError"></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);
    unhide();

    const form = overlay.querySelector('#lockForm');
    const emailEl = overlay.querySelector('#lockEmail');
    const passEl = overlay.querySelector('#lockPassword');
    const btn = overlay.querySelector('#lockSubmit');
    const errEl = overlay.querySelector('#lockError');
    emailEl.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const { error } = await supa.auth.signInWithPassword({
          email: emailEl.value.trim(),
          password: passEl.value,
        });
        if (error) {
          errEl.textContent = 'Wrong email or password.';
          btn.disabled = false;
          btn.textContent = 'Sign in';
          return;
        }
        // Reload so every script on the page re-initialises with the
        // authenticated session (sync pulls, realtime, photos, …).
        window.location.reload();
      } catch (err) {
        errEl.textContent = 'Could not reach the server — try again.';
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  }

  supa.auth.getSession().then(({ data }) => {
    if (data && data.session) {
      unhide();
    } else {
      showLockScreen();
    }
  }).catch(unhide);
})();
