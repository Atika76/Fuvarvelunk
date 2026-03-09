function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminEmail(email) {
  return normalizeEmail(email) === normalizeEmail(ADMIN_EMAIL);
}

async function getAuthSession() {
  if (!supabaseClient?.auth) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return null;
  return data.session || null;
}

async function getCurrentUser() {
  if (!supabaseClient?.auth) return null;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user || null;
}

async function updateNavigationByAuth() {
  const session = await getAuthSession();
  const email = session?.user?.email || '';
  const isAdmin = !!session && isAdminEmail(email);

  document.querySelectorAll('[data-guest-link]').forEach((el) => { el.hidden = !!session; });
  document.querySelectorAll('[data-user-badge]').forEach((el) => { el.hidden = !session; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = email; });
  document.querySelectorAll('[data-admin-link]').forEach((el) => { el.hidden = !isAdmin; });
  document.querySelectorAll('[data-admin-email-display]').forEach((el) => { el.textContent = ADMIN_EMAIL; });
  document.querySelectorAll('[data-logout-button]').forEach((btn) => {
    btn.onclick = async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    };
  });
  return { session, email, isAdmin };
}

async function requireAdminAccess() {
  const state = await updateNavigationByAuth();
  if (!state.isAdmin) {
    window.location.href = 'belepes.html?next=admin';
    return false;
  }
  return true;
}

function getRedirectAfterLogin() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  if (next === 'admin') return 'admin.html';
  return 'index.html';
}

async function initAuthPage() {
  const form = document.getElementById('authForm');
  if (!form || !supabaseClient?.auth) return;
  const modeInput = document.getElementById('authMode');
  const switchBtn = document.getElementById('authModeSwitch');
  const title = document.getElementById('authModeLabel');
  const submit = document.getElementById('authSubmitBtn');
  const message = document.getElementById('authMessage');

  let mode = 'signin';
  const existing = await getAuthSession();
  if (existing) {
    window.location.href = getRedirectAfterLogin();
    return;
  }

  function renderMode() {
    modeInput.value = mode;
    if (mode === 'signin') {
      title.textContent = 'Belépés';
      submit.textContent = 'Belépés';
      switchBtn.textContent = 'Még nincs fiókom, regisztrálok';
    } else {
      title.textContent = 'Regisztráció';
      submit.textContent = 'Regisztráció';
      switchBtn.textContent = 'Már van fiókom, belépek';
    }
    message.textContent = '';
  }

  switchBtn.addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    renderMode();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    if (password.length < 6) {
      message.textContent = 'A jelszó legalább 6 karakter legyen.';
      return;
    }

    try {
      if (mode === 'signup') {
        const { error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}belepes.html` }
        });
        if (error) throw error;
        message.textContent = 'A regisztráció elkészült. Ha kapsz megerősítő e-mailt, nyisd meg, utána már be tudsz lépni.';
        mode = 'signin';
        renderMode();
        return;
      }

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = getRedirectAfterLogin();
    } catch (error) {
      const safe = String(error?.message || 'Sikertelen művelet.');
      if (safe.toLowerCase().includes('email not confirmed')) {
        message.textContent = 'Az e-mail címet még meg kell erősíteni. Ellenőrizd a postafiókodat.';
      } else {
        message.textContent = safe;
      }
    }
  });

  renderMode();
}

document.addEventListener('DOMContentLoaded', async () => {
  await updateNavigationByAuth();
  if (document.body.hasAttribute('data-require-admin')) {
    const allowed = await requireAdminAccess();
    if (!allowed) return;
  }
  if (document.body.hasAttribute('data-auth-page')) {
    await initAuthPage();
  }

  supabaseClient?.auth?.onAuthStateChange(async () => {
    await updateNavigationByAuth();
  });
});
