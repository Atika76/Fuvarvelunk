// ===============================
// SUPABASE AUTH RENDSZER
// ===============================

const sb = window.supabaseClient;

// -------------------------------
// MENÜ FRISSÍTÉSE
// -------------------------------

async function updateMenu() {

  const { data } = await sb.auth.getSession();
  const session = data.session;

  const guestEls = document.querySelectorAll('[data-auth="guest"]');
  const userEls = document.querySelectorAll('[data-auth="user"]');
  const adminEls = document.querySelectorAll('[data-auth="admin"]');

  if (!session) {

    // nincs belépve
    guestEls.forEach(el => el.style.display = "");
    userEls.forEach(el => el.style.display = "none");
    adminEls.forEach(el => el.style.display = "none");

    return;
  }

  // be van lépve
  guestEls.forEach(el => el.style.display = "none");
  userEls.forEach(el => el.style.display = "");

  const email = session.user.email;

  // admin email lekérése
  const { data: settings } = await sb
    .from("beallitasok")
    .select("admin_email")
    .limit(1)
    .single();

  const adminEmail = settings?.admin_email;

  if (email === adminEmail) {

    adminEls.forEach(el => el.style.display = "");

  } else {

    adminEls.forEach(el => el.style.display = "none");

  }

}

// -------------------------------
// KILÉPÉS
// -------------------------------

async function logout() {

  try {
    await sb.auth.signOut();
  } catch (err) {
    console.error("Kilépési hiba:", err);
  }

  try {
    sessionStorage.removeItem("nextAfterLogin");
  } catch (_) {}

  // menü frissítése
  updateMenu();

  // vissza a főoldalra
  window.location.href = "index.html";
}


// -------------------------------
// KILÉPÉS GOMB
// -------------------------------

function bindLogout() {

  document.querySelectorAll("[data-logout]").forEach(btn => {

    btn.addEventListener("click", async (e) => {

      e.preventDefault();

      await logout();

    });

  });

}


// -------------------------------
// ADMIN OLDAL VÉDELEM
// -------------------------------

async function requireAdmin() {

  const { data } = await sb.auth.getSession();
  const session = data.session;

  if (!session) {

    window.location.href = "belepes.html";
    return;

  }

  const email = session.user.email;

  const { data: settings } = await sb
    .from("beallitasok")
    .select("admin_email")
    .limit(1)
    .single();

  const adminEmail = settings?.admin_email;

  if (email !== adminEmail) {

    window.location.href = "index.html";

  }

}


// -------------------------------
// AUTH FIGYELÉS
// -------------------------------

function watchAuth() {

  sb.auth.onAuthStateChange(() => {

    updateMenu();

  });

}


// -------------------------------
// INDÍTÁS
// -------------------------------

document.addEventListener("DOMContentLoaded", () => {

  updateMenu();
  bindLogout();
  watchAuth();

});
