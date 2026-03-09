
window.AppAuth = (() => {
  let sessionCache = null;
  let adminEmailCache = null;

  async function getAdminEmail() {
    if (adminEmailCache) return adminEmailCache;
    try {
      const { data } = await sb.from('beallitasok').select('admin_email').eq('id', 1).maybeSingle();
      adminEmailCache = (data?.admin_email || APP_CONFIG.adminEmail || '').toLowerCase();
      return adminEmailCache;
    } catch (_) {
      adminEmailCache = (APP_CONFIG.adminEmail || '').toLowerCase();
      return adminEmailCache;
    }
  }

  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) return null;
    sessionCache = data.session || null;
    return sessionCache;
  }

  async function getUser() {
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function isAdmin() {
    const user = await getUser();
    const adminEmail = await getAdminEmail();
    return !!user && !!adminEmail && user.email?.toLowerCase() === adminEmail;
  }

  function saveNext(url) {
    try { sessionStorage.setItem('nextAfterAuth', url); } catch(_) {}
  }

  function consumeNext(defaultUrl='index.html') {
    try {
      const next = sessionStorage.getItem('nextAfterAuth');
      sessionStorage.removeItem('nextAfterAuth');
      return next || defaultUrl;
    } catch(_) { return defaultUrl; }
  }

  async function requireAuth(next='auth.html') {
    const session = await getSession();
    if (!session) {
      saveNext(location.pathname.split('/').pop() + location.search + location.hash);
      location.href = next;
      return false;
    }
    return true;
  }

  async function requireAdmin() {
    const ok = await requireAuth('auth.html');
    if (!ok) return false;
    const admin = await isAdmin();
    if (!admin) {
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function signOut() {
    await sb.auth.signOut();
    location.href = 'index.html';
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({ email, password });
  }

  async function signUp(email, password, fullName='') {
    return sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: APP_CONFIG.siteUrl + 'auth.html',
        data: { full_name: fullName }
      }
    });
  }

  async function updateNav() {
    const session = await getSession();
    const admin = session ? await isAdmin() : false;
    document.querySelectorAll('[data-auth="guest"]').forEach(el => el.classList.toggle('hidden', !!session));
    document.querySelectorAll('[data-auth="user"]').forEach(el => el.classList.toggle('hidden', !session));
    document.querySelectorAll('[data-auth="admin"]').forEach(el => el.classList.toggle('hidden', !admin));
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = session?.user?.email || '');
    document.querySelectorAll('[data-logout]').forEach(el => {
      el.onclick = async (e) => { e.preventDefault(); await signOut(); };
    });
    return { session, admin };
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    sessionCache = session || null;
    await updateNav();
    if (event === 'SIGNED_IN' && location.pathname.endsWith('auth.html')) {
      setTimeout(async () => {
        const adminEmail = await getAdminEmail();
        const target = ((session?.user?.email || '').toLowerCase() === adminEmail) ? 'admin.html' : consumeNext('index.html');
        location.href = target;
      }, 300);
    }
  });

  return { getSession, getUser, isAdmin, requireAuth, requireAdmin, signOut, signIn, signUp, updateNav, saveNext, consumeNext, getAdminEmail };
})();
