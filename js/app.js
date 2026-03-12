const App = (() => {
  const tableTrips = 'fuvarok';
  const tableBookings = 'foglalasok';
  const tableSettings = 'beallitasok';
  let activeMap = null;
  let activeLine = null;
  let activeMarkers = [];

  function escapeHtml(str='') { return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
  function fmtCurrency(v){ return new Intl.NumberFormat('hu-HU').format(Number(v||0)); }
  function normStatus(s=''){ return String(s).toLowerCase(); }
  function statusBadge(status='Függőben') {
    const n = normStatus(status);
    let cls = 'info';
    if (n.includes('jóvá') || n.includes('fizetve') || n.includes('készpénz')) cls='approved';
    else if (n.includes('függ') || n.includes('vár')) cls='pending';
    else if (n.includes('töröl') || n.includes('elutas')) cls='rejected';
    return `<span class="status ${cls}">${escapeHtml(status)}</span>`;
  }
  function seatBar(free, total) {
    const t = Math.max(1, Number(total||free||0));
    const f = Math.max(0, Number(free||0));
    const used = Math.max(0, t - f);
    const percent = Math.max(0, Math.min(100, Math.round((used / t) * 100)));
    return `<div class="seat-bar-wrap"><div class="seat-bar"><span style="width:${percent}%"></span></div><small>${used}/${t} hely foglalt · ${f} szabad</small></div>`;
  }
  function starRating(value=4.8) {
    const v = Number(value || 4.8);
    const full = Math.floor(v);
    const half = v - full >= 0.5;
    let out = '';
    for (let i=0;i<5;i++) out += i < full ? '★' : (i === full && half ? '☆' : '☆');
    return `<span class="stars">${out}</span> <span class="rating-num">${v.toFixed(1)}</span>`;
  }
  function cityNorm(s='') { return String(s).toLowerCase().replace(/\s+/g,' ').trim(); }

  function getInitials(name='') {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'S';
  }
  function getStars(value=0) {
    const v = Math.max(0, Math.min(5, Number(value || 0)));
    return '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
  }
  function getRatingValue(item) {
    return Number(item?.sofor_ertekeles ?? item?.atlag ?? 0) || 0;
  }
  function rideStatus(szabad){
    return Number(szabad) <= 0 ? '<span class="status rejected">Betelt</span>' : '';
  }
  function isTripExpired(trip) {
    if (!trip?.datum) return false;
    const raw = `${trip.datum}T${trip.ido || '23:59'}`;
    const when = new Date(raw);
    return Number.isFinite(when.getTime()) && when.getTime() < Date.now();
  }

  async function fetchRatings() {
    try {
      const { data, error } = await sb.from('ertekelesek').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      return data || [];
    } catch (_) {
      return [];
    }
  }

  async function enhanceTrips(trips=[]) {
    const safeTrips = Array.isArray(trips) ? trips.filter(t => !isTripExpired(t)) : [];
    if (!safeTrips.length) return [];
    const [bookings, ratings] = await Promise.all([fetchBookings().catch(() => []), fetchRatings()]);
    const bookingMap = new Map();
    for (const b of bookings) {
      const tripId = String(b.fuvar_id ?? b.trip_id ?? '');
      if (!tripId) continue;
      const state = String(b.foglalasi_allapot || '').toLowerCase();
      if (state.includes('tör')) continue;
      bookingMap.set(tripId, (bookingMap.get(tripId) || 0) + Number(b.foglalt_helyek || 1));
    }
    const driverRatings = new Map();
    const tripRatings = new Map();
    for (const r of ratings) {
      const keyTrip = String(r.fuvar_id ?? '');
      const type = String(r.tipus || '').toLowerCase();
      if (type === 'sofor' || type === 'sofőr') {
        const trip = safeTrips.find(t => String(t.id) === keyTrip);
        const key = String(trip?.email || '');
        if (!key) continue;
        const cur = driverRatings.get(key) || { sum:0, count:0, items:[] };
        cur.sum += Number(r.csillag || 0);
        cur.count += 1;
        cur.items.push(r);
        driverRatings.set(key, cur);
      }
      if (type === 'utazas' || type === 'utazás') {
        const cur = tripRatings.get(keyTrip) || { sum:0, count:0, items:[] };
        cur.sum += Number(r.csillag || 0);
        cur.count += 1;
        cur.items.push(r);
        tripRatings.set(keyTrip, cur);
      }
    }
    return safeTrips.map(trip => {
      const total = Number(trip.auto_helyek ?? trip.osszes_hely ?? trip.helyek ?? 0);
      const booked = bookingMap.get(String(trip.id)) || 0;
      const free = Math.max(0, total - booked);
      const dAgg = driverRatings.get(String(trip.email || '')) || { sum:0, count:0, items:[] };
      const tAgg = tripRatings.get(String(trip.id)) || { sum:0, count:0, items:[] };
      return {
        ...trip,
        szabad_helyek: free,
        helyek: free,
        sofor_ertekeles: dAgg.count ? Number((dAgg.sum / dAgg.count).toFixed(1)) : Number(trip.sofor_ertekeles || 0),
        sofor_ertekeles_db: dAgg.count,
        sofor_ertekelesek: dAgg.items,
        utazas_ertekeles: tAgg.count ? Number((tAgg.sum / tAgg.count).toFixed(1)) : 0,
        utazas_ertekeles_db: tAgg.count,
        utazas_ertekelesek: tAgg.items,
        is_betelt: free <= 0,
      };
    });
  }

  async function fetchDriverReviews(driverEmail='') {
    const ratings = await fetchRatings();
    const trips = await fetchAllTripsRaw().catch(() => []);
    const ids = new Set(trips.filter(t => String(t.email || '').toLowerCase() === String(driverEmail || '').toLowerCase()).map(t => String(t.id)));
    return ratings.filter(r => ids.has(String(r.fuvar_id ?? '')) && String(r.tipus || '').toLowerCase().includes('sofor'));
  }

  async function submitReview(trip, form) {
    const ok = await AppAuth.requireAuth(`trip.html?id=${trip.id}`);
    if (!ok) throw new Error('A értékeléshez be kell jelentkezni.');
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const payload = {
      fuvar_id: trip.id,
      user_email: user?.email || '',
      user_name: fd.get('name')?.toString().trim() || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Utas',
      csillag: Number(fd.get('stars') || 0),
      szoveg: fd.get('text')?.toString().trim() || '',
      tipus: fd.get('type')?.toString().trim() || 'utazas'
    };
    if (payload.csillag < 1 || payload.csillag > 5) throw new Error('1 és 5 csillag közötti értéket adj meg.');
    const { error } = await sb.from('ertekelesek').insert([payload]);
    if (error) throw error;
    return payload;
  }

  function renderReviewList(items=[]) {
    if (!items.length) return '<div class="notice">Még nincs értékelés.</div>';
    return `<div class="review-list">${items.map(r => `
      <article class="review-item">
        <div class="review-head"><strong>${escapeHtml(r.user_name || 'Utas')}</strong><span class="rating-stars">${getStars(r.csillag || 0)}</span></div>
        <p>${escapeHtml(r.szoveg || '') || 'Szöveges megjegyzés nélkül.'}</p>
      </article>`).join('')}</div>`;
  }

  function reviewForm(trip, type, title) {
    return `
      <section class="card review-form-card">
        <h3>${title}</h3>
        <form class="form-stack js-review-form" data-trip-id="${trip.id}">
          <input type="hidden" name="type" value="${type}">
          <div class="grid-2">
            <label><span>Név</span><input name="name" placeholder="A neved"></label>
            <label><span>Csillag (1-5)</span><input name="stars" type="number" min="1" max="5" required></label>
          </div>
          <label><span>Szöveges értékelés</span><textarea name="text" placeholder="Írd le röviden a tapasztalatodat"></textarea></label>
          <div class="form-message"></div>
          <button class="btn btn-primary" type="submit">Értékelés mentése</button>
        </form>
      </section>`;
  }

  async function fetchSettings() {
    try {
      const { data } = await sb.from(tableSettings).select('*').order('id', { ascending: true }).limit(1).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  }

  async function applySettings() {
    const s = await fetchSettings();
    const visibleBrand = APP_CONFIG.brandName;
    const visibleCompany = APP_CONFIG.companyName;
    const visibleEmail = (s?.contact_email && !String(s.contact_email).includes('utazz')) ? s.contact_email : APP_CONFIG.contactEmail;
    document.querySelectorAll('[data-setting="siteName"]').forEach(el => el.textContent = visibleBrand);
    document.querySelectorAll('[data-setting="companyName"]').forEach(el => el.textContent = visibleCompany);
    document.querySelectorAll('[data-setting="email"]').forEach(el => el.textContent = visibleEmail);
    document.querySelectorAll('[data-setting="adminEmail"]').forEach(el => el.textContent = s?.admin_email || APP_CONFIG.adminEmail);
    document.querySelectorAll('[data-brand]').forEach(el => el.textContent = visibleBrand);
  }

  async function fetchApprovedTripsRaw(filters={}) {
    let q = sb.from(tableTrips).select('*').eq('statusz','Jóváhagyva').order('datum',{ascending:true}).order('ido',{ascending:true});
    if (filters.origin) q = q.ilike('indulas', `%${filters.origin}%`);
    if (filters.destination) q = q.ilike('erkezes', `%${filters.destination}%`);
    if (filters.date) q = q.eq('datum', filters.date);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function fetchApprovedTrips(filters={}) {
    return enhanceTrips(await fetchApprovedTripsRaw(filters));
  }

  async function fetchAllTripsRaw() {
    const { data, error } = await sb.from(tableTrips).select('*').order('created_at', {ascending:false});
    if (error) throw error;
    return data || [];
  }

  async function fetchAllTrips() {
    return enhanceTrips(await fetchAllTripsRaw());
  }

  async function fetchTripById(id) {
    const trips = await enhanceTrips((await fetchAllTripsRaw()).filter(t => String(t.id) === String(id)));
    return trips[0] || null;
  }

  async function fetchTrips() {
    return fetchAllTrips();
  }

  async function fetchBookings() {
    const { data, error } = await sb.from(tableBookings).select('*').order('created_at', {ascending:false});
    if (error) throw error;
    return data || [];
  }

  function buildRecommendations(trips, filters) {
    const o = cityNorm(filters.origin);
    const d = cityNorm(filters.destination);
    return trips.filter(t => {
      const ti = cityNorm(t.indulas);
      const te = cityNorm(t.erkezes);
      if (o && d) return (te.includes(d) || ti.includes(o)) && !(ti.includes(o) && te.includes(d));
      if (o) return te.includes(o) || ti.includes(o);
      if (d) return te.includes(d) || ti.includes(d);
      return false;
    }).slice(0,4);
  }

  function tripCard(trip, admin=false) {
    const free = Number(trip.szabad_helyek ?? trip.helyek ?? 0);
    const total = Number(trip.auto_helyek ?? trip.osszes_hely ?? trip.helyek ?? 0);
    const paymentMethods = (trip.fizetesi_modok && Array.isArray(trip.fizetesi_modok) ? trip.fizetesi_modok : ['transfer','cash']).map(m => m === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek').join(' · ');
    const rating = Number(trip.sofor_ertekeles || 0);
    const ratingCount = Number(trip.sofor_ertekeles_db || 0);
    const profile = `<div class="driver-mini"><strong>${escapeHtml(trip.nev || '')}</strong><span>${ratingCount ? starRating(rating) + ` <small class="muted-inline">(${ratingCount} értékelés)</small>` : '<span class="muted-inline">Még nincs értékelés</span>'}</span></div>`;
    return `
      <article class="card trip-card" data-trip-id="${trip.id}">
        <div class="trip-main">
          <div class="inline-pills"><span class="pill">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</span>${statusBadge(trip.statusz || 'Jóváhagyva')}${rideStatus(free)}</div>
          <h3>${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h3>
          ${profile}
          <div class="trip-meta">
            <span><strong>Dátum:</strong> ${escapeHtml(trip.datum || '')}</span>
            <span><strong>Idő:</strong> ${escapeHtml(trip.ido || '')}</span>
            <span><strong>Ár:</strong> ${fmtCurrency(trip.ar)} Ft / fő</span>
            <span><strong>Autó:</strong> ${escapeHtml(trip.auto_tipus || 'Személyautó')}</span>
            <span><strong>Férőhely:</strong> ${total}</span>
          </div>
          ${seatBar(free,total)}
          <p>${escapeHtml(trip.megjegyzes || '')}</p>
          <div class="trip-contact">
            <div><strong>Sofőr:</strong> ${escapeHtml(trip.nev || '')}</div>
            <div><strong>Kapcsolat:</strong> ${escapeHtml(trip.email || '')}${trip.telefon ? ' · ' + escapeHtml(trip.telefon) : ''}</div>
            <div><strong>Elfogadott fizetés:</strong> ${escapeHtml(paymentMethods)}</div>${trip.bankszamla ? `<div><strong>Utalási adat:</strong> ${escapeHtml(trip.bankszamla)}</div>` : ''}
          </div>
        </div>
        <div>
          <div class="card info-card">
            <div class="small-help">Útvonal és megosztás</div>
            <p style="margin:8px 0 0;color:var(--muted)">Térkép, külön fuvaroldal és Facebook-poszt kép.</p>
            <div class="inline-pills" style="margin-top:12px">
              <button class="btn btn-ghost js-map-focus" data-origin="${escapeHtml(trip.indulas)}" data-destination="${escapeHtml(trip.erkezes)}">Térkép</button>
              <button class="btn btn-ghost js-share-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}'>Megosztás</button>
              <a class="btn btn-ghost" href="trip.html?id=${trip.id}">Részletek</a>
              <a class="btn btn-ghost" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a>
            </div>
          </div>
        </div>
        <div class="trip-actions">
          ${admin ? `
            <button class="btn btn-success js-trip-approve" data-id="${trip.id}">Jóváhagyás</button>
            <button class="btn btn-warning js-trip-pending" data-id="${trip.id}">Függőben</button>
            <button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Törlés</button>
          ` : `
            <button class="btn btn-primary js-book-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}' ${free < 1 ? 'disabled' : ''}>${free < 1 ? 'Betelt' : 'Foglalás'}</button>
            <a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>
          `}
        </div>
      </article>`;
  }

  function bookingCard(b, tripMap={}) {
    const trip = tripMap[String(b.fuvar_id ?? b.trip_id ?? '')] || {};
    return `
      <article class="card admin-item">
        <div>
          <div class="inline-pills">${statusBadge(b.foglalasi_allapot || 'Új')} ${statusBadge(b.fizetesi_allapot || 'Függőben')}</div>
          <h3 style="margin:12px 0 8px">${escapeHtml(trip.indulas || '')} → ${escapeHtml(trip.erkezes || '')}</h3>
          <div class="trip-meta">
            <span><strong>Foglaló:</strong> ${escapeHtml(b.nev || '')}</span>
            <span><strong>E-mail:</strong> ${escapeHtml(b.email || '')}</span>
            <span><strong>Telefon:</strong> ${escapeHtml(b.telefon || '')}</span>
            <span><strong>Helyek:</strong> ${escapeHtml(String(b.foglalt_helyek || 1))}</span>
          </div>
          <p><strong>Fizetési mód:</strong> ${b.fizetesi_mod === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek'}</p>
          ${b.megjegyzes ? `<p>${escapeHtml(b.megjegyzes)}</p>` : ''}
        </div>
        <div>
          <p><strong>Foglalás:</strong> ${escapeHtml(b.foglalasi_allapot || '')}</p>
          <p><strong>Fizetés:</strong> ${escapeHtml(b.fizetesi_allapot || '')}</p>
          <p><strong>Létrehozva:</strong> ${escapeHtml(String(b.created_at || '')).slice(0,16).replace('T',' ')}</p>
        </div>
        <div class="trip-actions">
          <button class="btn btn-success js-booking-approve" data-id="${b.id}" data-trip-id="${b.fuvar_id ?? b.trip_id ?? ""}" data-seats="${b.foglalt_helyek || 1}">Jóváhagyás</button>
          <button class="btn btn-warning js-booking-paid" data-id="${b.id}">Fizetve</button>
          <button class="btn btn-danger js-booking-cancel" data-id="${b.id}" data-trip-id="${b.fuvar_id ?? b.trip_id ?? ""}" data-seats="${b.foglalt_helyek || 1}">Törlés</button>
        </div>
      </article>`;
  }

  async function geocodePlace(place) {
    const key = 'geo:' + place.toLowerCase();
    try { const cached = sessionStorage.getItem(key); if (cached) return JSON.parse(cached); } catch(_){ }
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(place + ', Hungary');
    const res = await fetch(url, { headers: { 'Accept-Language':'hu' } });
    const data = await res.json();
    const first = data && data[0] ? { lat:Number(data[0].lat), lon:Number(data[0].lon) } : null;
    if (first) try { sessionStorage.setItem(key, JSON.stringify(first)); } catch(_){ }
    return first;
  }

  async function focusRoute(origin, destination) {
    if (!document.getElementById('tripsMap')) return;
    if (!activeMap) {
      activeMap = L.map('tripsMap').setView([47.4979,19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }
    activeMarkers.forEach(m => activeMap.removeLayer(m));
    activeMarkers = [];
    if (activeLine) activeMap.removeLayer(activeLine);
    const a = await geocodePlace(origin);
    const b = await geocodePlace(destination);
    if (!a && !b) return;
    const points = [];
    if (a) {
      const m = L.marker([a.lat, a.lon]).addTo(activeMap).bindPopup('Indulás: ' + origin);
      activeMarkers.push(m); points.push([a.lat,a.lon]);
    }
    if (b) {
      const m = L.marker([b.lat, b.lon]).addTo(activeMap).bindPopup('Érkezés: ' + destination);
      activeMarkers.push(m); points.push([b.lat,b.lon]);
    }
    if (points.length === 2) {
      activeLine = L.polyline(points, { color:'#63a4ff', weight:4 }).addTo(activeMap);
      activeMap.fitBounds(activeLine.getBounds(), { padding:[32,32] });
    } else if (points.length === 1) {
      activeMap.setView(points[0], 9);
    }
  }

  function shareCanvasDataUrl(trip) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0,0,1200,630); g.addColorStop(0,'#0d1d39'); g.addColorStop(1,'#10254a');
    ctx.fillStyle = g; ctx.fillRect(0,0,1200,630);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(48,48,1104,534);
    ctx.fillStyle = '#eef4ff'; ctx.font = 'bold 68px Arial';
    ctx.fillText(`${trip.indulas} → ${trip.erkezes}`, 72, 170);
    ctx.font = '36px Arial'; ctx.fillStyle = '#dbe8ff';
    ctx.fillText(`${trip.datum} • ${trip.ido}`, 72, 245);
    ctx.fillText(`${fmtCurrency(trip.ar)} Ft / fő`, 72, 300);
    ctx.fillText(`${trip.szabad_helyek ?? trip.helyek ?? 0} szabad hely`, 72, 355);
    ctx.font = '30px Arial'; ctx.fillStyle = '#b8c9ea';
    ctx.fillText(APP_CONFIG.brandName + ' • Foglalás: ' + APP_CONFIG.siteUrl, 72, 560);
    return c.toDataURL('image/png');
  }

  async function shareTrip(trip) {
    const url = APP_CONFIG.siteUrl + 'trip.html?id=' + trip.id;
    const text = `${trip.indulas} → ${trip.erkezes} | ${trip.datum} ${trip.ido} | ${fmtCurrency(trip.ar)} Ft / fő | Foglalás: ${APP_CONFIG.siteUrl}`;
    const dataUrl = shareCanvasDataUrl(trip);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'fuvarvelunk-poszt.png', { type:'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
      try { await navigator.share({ title: APP_CONFIG.brandName, text, url, files:[file] }); return; } catch(_) {}
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'fuvarvelunk-poszt.png'; a.click();
  }

  function openModal(html) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="card modal">${html}</div>`;
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.dataset.close === '1') wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  async function notifyAdmin(type, payload) {
    if (!APP_CONFIG.notificationFunctionUrl) return;
    try {
      await fetch(APP_CONFIG.notificationFunctionUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type, payload, adminEmail: await AppAuth.fetchAdminEmail() })
      });
    } catch (_) {}
  }

  async function submitTrip(form) {
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const totalSeats = Number(fd.get('osszHely') || 0);
    const freeSeats = Number(fd.get('szabadHely') || totalSeats || 0);
    const payment = Array.from(form.querySelectorAll('input[name="fizetesiMod"]:checked')).map(x => x.value === 'barion' ? 'transfer' : x.value);
    const payload = {
      user_id: user?.id || null,
      nev: fd.get('driverName')?.toString().trim() || '',
      email: user?.email || fd.get('contactEmail')?.toString().trim() || '',
      telefon: fd.get('phone')?.toString().trim() || '',
      indulas: fd.get('origin')?.toString().trim() || '',
      erkezes: fd.get('destination')?.toString().trim() || '',
      datum: fd.get('date')?.toString() || '',
      ido: fd.get('time')?.toString() || '',
      helyek: freeSeats,
      szabad_helyek: freeSeats,
      osszes_hely: totalSeats,
      auto_helyek: totalSeats,
      auto_tipus: fd.get('carType')?.toString().trim() || '',
      ar: Number(fd.get('price') || 0),
      megjegyzes: fd.get('note')?.toString().trim() || '',
      statusz: 'Függőben',
      fizetesi_modok: payment.length ? payment : ['cash'],
      bankszamla: fd.get('bankAccount')?.toString().trim() || '',
      sofor_ertekeles: 5
    };
    const { error } = await sb.from(tableTrips).insert([payload]);
    if (error) throw error;
    await notifyAdmin('uj_fuvar', payload);
  }

  async function submitBooking(trip, form) {
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const seats = Number(fd.get('seats') || 1);
    const method = fd.get('paymentMethod')?.toString() || 'cash';
    const phone = fd.get('phone')?.toString().trim() || '';
    const note = fd.get('note')?.toString().trim() || '';
    const userEmail = user?.email || '';
    const freeNow = Number(trip.szabad_helyek ?? trip.helyek ?? 0);
    if (seats < 1) throw new Error('Legalább 1 helyet válassz.');
    if (seats > freeNow) throw new Error('Nincs ennyi szabad hely.');
    const booking = {
      fuvar_id: trip.id,
      user_id: user?.id || null,
      nev: fd.get('name')?.toString().trim() || '',
      email: userEmail,
      telefon: phone,
      foglalt_helyek: seats,
      fizetesi_mod: method,
      fizetesi_allapot: method === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek',
      foglalasi_allapot: method === 'cash' ? 'Jóváhagyva' : 'Fizetésre vár',
      megjegyzes: note,
      utas_email: userEmail,
      utas_nev: fd.get('name')?.toString().trim() || ''
    };

    const { error } = await sb.from(tableBookings).insert([booking]);
    if (error) throw error;

    if (method === 'cash') {
      const { error: tripError } = await sb.from(tableTrips).update({
        helyek: freeNow - seats,
        szabad_helyek: freeNow - seats
      }).eq('id', trip.id);
      if (tripError) throw tripError;
    }
    await notifyAdmin('uj_foglalas', booking);
    return booking;
  }

  function bindGlobalActions() {
    document.body.addEventListener('click', async (e) => {
      const mapBtn = e.target.closest('.js-map-focus');
      if (mapBtn) {
        await focusRoute(mapBtn.dataset.origin, mapBtn.dataset.destination);
        document.getElementById('tripsMap')?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
      const shareBtn = e.target.closest('.js-share-trip');
      if (shareBtn) {
        await shareTrip(JSON.parse(decodeURIComponent(shareBtn.dataset.trip)));
        return;
      }
      const bookBtn = e.target.closest('.js-book-trip');
      if (bookBtn) {
        const ok = await AppAuth.requireAuth('fuvarok.html');
        if (!ok) return;
        const trip = JSON.parse(decodeURIComponent(bookBtn.dataset.trip));
        const session = await AppAuth.getSession();
        const wrap = openModal(`
          <div class="section-head"><div><span class="eyebrow">Foglalás</span><h2 style="margin:8px 0 0">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h2></div><button class="btn btn-secondary" data-close="1">Bezárás</button></div>
          <form id="bookingForm" class="form-stack">
            <div class="grid-2">
              <label><span>Név</span><input name="name" required></label>
              <label><span>E-mail</span><input value="${escapeHtml(session?.user?.email || '')}" disabled></label>
            </div>
            <div class="grid-2">
              <label><span>Telefonszám</span><input name="phone" required></label>
              <label><span>Foglalt helyek</span><input name="seats" type="number" min="1" max="${trip.szabad_helyek ?? trip.helyek}" value="1" required></label>
            </div>
            <div class="grid-2">
              <label><span>Fizetési mód</span><select name="paymentMethod"><option value="transfer">Utalás a sofőrnek</option><option value="cash">Készpénz a sofőrnek</option></select></label>
              <label><span>Megjegyzés</span><input name="note" placeholder="pl. 1 nagy bőrönd"></label>
            </div>
            <div class="notice warn">A fizetés nem a weboldalon keresztül történik. Utalással a sofőrnek vagy készpénzben a sofőrnek tudsz fizetni.</div>
            <div class="form-message" id="bookingMsg"></div>
            <button class="btn btn-primary" type="submit">Foglalás rögzítése</button>
          </form>
        `);
        wrap.querySelector('#bookingForm').addEventListener('submit', async ev => {
          ev.preventDefault();
          const msg = wrap.querySelector('#bookingMsg'); msg.textContent = 'Mentés...';
          try {
            const booking = await submitBooking(trip, ev.currentTarget);
            msg.textContent = booking.fizetesi_mod === 'cash' ? 'Sikeres foglalás. A hely igényed rögzítve lett.' : 'Foglalás rögzítve. A fizetés a sofőrrel egyeztetve történik.';
            msg.className = 'form-message';
            setTimeout(() => location.reload(), 1000);
          } catch(err) { msg.textContent = err.message || 'Nem sikerült a foglalás.'; }
        });
        return;
      }
      const approveTrip = e.target.closest('.js-trip-approve');
      if (approveTrip) { await sb.from(tableTrips).update({ statusz:'Jóváhagyva' }).eq('id', approveTrip.dataset.id); location.reload(); return; }
      const pendingTrip = e.target.closest('.js-trip-pending');
      if (pendingTrip) { await sb.from(tableTrips).update({ statusz:'Függőben' }).eq('id', pendingTrip.dataset.id); location.reload(); return; }
      const deleteTrip = e.target.closest('.js-trip-delete');
      if (deleteTrip) { if (confirm('Biztosan törlöd ezt a fuvart?')) { await sb.from(tableTrips).delete().eq('id', deleteTrip.dataset.id); location.reload(); } return; }
      const approveBooking = e.target.closest('.js-booking-approve');
      if (approveBooking) {
        const id = approveBooking.dataset.id, tripId = approveBooking.dataset.tripId, seats = Number(approveBooking.dataset.seats || 1);
        const { data: trip } = await sb.from(tableTrips).select('helyek, szabad_helyek').eq('id', tripId).single();
        const free = Number(trip?.szabad_helyek ?? trip?.helyek ?? 0);
        if (trip && free >= seats) {
          await sb.from(tableTrips).update({ helyek: free - seats, szabad_helyek: free - seats }).eq('id', tripId);
          await sb.from(tableBookings).update({ foglalasi_allapot:'Jóváhagyva', fizetesi_allapot:'Készpénz a sofőrnek' }).eq('id', id);
        }
        location.reload(); return;
      }
      const paidBooking = e.target.closest('.js-booking-paid');
      if (paidBooking) { await sb.from(tableBookings).update({ fizetesi_allapot:'Fizetve', foglalasi_allapot:'Jóváhagyva' }).eq('id', paidBooking.dataset.id); location.reload(); return; }
      const cancelBooking = e.target.closest('.js-booking-cancel');
      if (cancelBooking) { if (confirm('Biztosan törlöd ezt a foglalást?')) { await sb.from(tableBookings).delete().eq('id', cancelBooking.dataset.id); location.reload(); } return; }
    });
  }

  async function initHome() {
    const featured = document.getElementById('featuredTrips');
    if (!featured) return;
    try {
      const trips = (await fetchApprovedTrips({})).slice(0,3);
      featured.innerHTML = trips.length ? trips.map(t => `
        <article class="card">
          <div class="inline-pills">${statusBadge('Jóváhagyva')}</div>
          <h3>${escapeHtml(t.indulas)} → ${escapeHtml(t.erkezes)}</h3>
          <p class="lead">${escapeHtml(t.datum)} • ${escapeHtml(t.ido)} • ${fmtCurrency(t.ar)} Ft / fő</p>
          ${seatBar(Number(t.szabad_helyek ?? t.helyek ?? 0), Number(t.auto_helyek ?? t.osszes_hely ?? t.helyek ?? 0))}
          <p>${escapeHtml(t.megjegyzes || '')}</p>
          <a class="btn btn-secondary" href="trip.html?id=${t.id}">Részletek</a>
        </article>`).join('') : '<div class="empty-state">Még nincs jóváhagyott fuvar.</div>';
    } catch (_) { featured.innerHTML = '<div class="empty-state">A fuvarok betöltése átmenetileg nem elérhető.</div>'; }
    document.getElementById('quickSearchForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      [['quickOrigin','origin'],['quickDestination','destination'],['quickDate','date']].forEach(([id,key]) => { const v = document.getElementById(id)?.value?.trim(); if (v) p.set(key, v); });
      location.href = 'fuvarok.html?' + p.toString();
    });
  }

  async function initTripsPage() {
    if (!document.getElementById('tripsList')) return;
    if (document.getElementById('tripsMap')) {
      activeMap = L.map('tripsMap').setView([47.4979, 19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }
    const params = new URLSearchParams(location.search);
    const originInput = document.getElementById('filterOrigin');
    const destinationInput = document.getElementById('filterDestination');
    const dateInput = document.getElementById('filterDate');
    originInput.value = params.get('origin') || '';
    destinationInput.value = params.get('destination') || '';
    dateInput.value = params.get('date') || '';
    const list = document.getElementById('tripsList');
    const recWrap = document.getElementById('recommendedTrips');

    async function render() {
      list.innerHTML = '<div class="empty-state">Betöltés...</div>';
      if (recWrap) recWrap.innerHTML = '';
      try {
        const filters = { origin:originInput.value.trim(), destination:destinationInput.value.trim(), date:dateInput.value };
        const trips = await fetchApprovedTrips(filters);
        list.innerHTML = trips.length ? trips.map(t => tripCard(t, false)).join('') : '<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>';
        if (trips[0]) focusRoute(trips[0].indulas, trips[0].erkezes);
        if (!trips.length && recWrap) {
          const all = await fetchApprovedTrips({});
          const rec = buildRecommendations(all, filters);
          recWrap.innerHTML = rec.length ? `<h3>Ajánlott fuvarok</h3>${rec.map(t=>tripCard(t,false)).join('')}` : '';
        }
      } catch (e) { list.innerHTML = '<div class="empty-state">A fuvarok jelenleg nem tölthetők be.</div>'; }
    }
    await render();
    document.getElementById('tripFilterForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); await render(); });
  }

  async function initTripFormPage() {
    const form = document.getElementById('tripForm');
    if (!form) return;
    const ok = await AppAuth.requireAuth('fuvar-feladas.html');
    if (!ok) return;
    const session = await AppAuth.getSession();
    const user = session?.user;
    form.querySelector('[name="contactEmail"]').value = user?.email || '';
    form.querySelector('[name="contactEmail"]').readOnly = true;
    const driverNameInput = form.querySelector('[name="driverName"]');
    if (driverNameInput && !driverNameInput.value) {
      driverNameInput.value = user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email ? String(user.email).split('@')[0] : '');
    }
    const total = form.querySelector('[name="osszHely"]');
    const free = form.querySelector('[name="szabadHely"]');
    total.addEventListener('input', () => free.value = total.value);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('tripFormMsg');
      msg.textContent = 'Mentés...';
      try {
        await submitTrip(form);
        msg.textContent = 'A fuvar rögzítve lett. Admin jóváhagyás után megjelenik a listában.';
        form.reset();
        form.querySelector('[name="contactEmail"]').value = user?.email || '';
      } catch (err) {
        msg.textContent = err.message || 'Nem sikerült menteni.';
      }
    });
  }

  async function initAuthPage() {
    if (!document.getElementById('loginForm')) return;
    const { session } = await AppAuth.updateNav();
    AppAuth.bindLogout();
    AppAuth.watchAuth();
    if (session) {
      location.href = (await AppAuth.isAdmin()) ? 'admin.html' : 'index.html';
      return;
    }
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    document.getElementById('facebookLoginBtn')?.addEventListener('click', async () => {
      const msg = document.getElementById('loginMsg');
      msg.textContent = 'Facebook belépés indítása...';
      const { error } = await AppAuth.signInWithFacebook();
      if (error) msg.textContent = error.message || 'A Facebook belépés jelenleg nem elérhető.';
    });
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const msg = document.getElementById('loginMsg');
      msg.textContent = 'Belépés...';
      const { error } = await AppAuth.signIn(fd.get('email'), fd.get('password'));
      if (error) {
        msg.textContent = error.message || 'Nem sikerült a belépés. Ellenőrizd az e-mail címet és a jelszót.';
      } else {
        msg.textContent = 'Sikeres belépés...';
        const admin = await AppAuth.isAdmin();
        location.href = admin ? 'admin.html' : AppAuth.consumeNext('index.html');
      }
    });
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const msg = document.getElementById('registerMsg');
      msg.textContent = 'Regisztráció...';
      const { error } = await AppAuth.signUp(fd.get('email'), fd.get('password'), fd.get('name'));
      msg.textContent = error ? (error.message || 'Nem sikerült a regisztráció.') : 'Sikeres regisztráció. Ellenőrizd az emailedet, majd erősítsd meg a fiókot.';
    });
  }

  async function initAdminPage() {
    if (!document.getElementById('adminTrips')) return;
    const ok = await AppAuth.requireAdmin(); if (!ok) return;
    const tripsWrap = document.getElementById('adminTrips');
    const bookingsWrap = document.getElementById('adminBookings');
    const settingsForm = document.getElementById('settingsForm');
    const msg = document.getElementById('settingsMsg');
    const settings = await fetchSettings();
    if (settingsForm) {
      settingsForm.siteName.value = APP_CONFIG.brandName;
      settingsForm.companyName.value = APP_CONFIG.companyName;
      settingsForm.email.value = (settings?.contact_email && !String(settings.contact_email).includes('utazz')) ? settings.contact_email : APP_CONFIG.contactEmail;
      settingsForm.adminEmail.value = settings?.admin_email || APP_CONFIG.adminEmail;
      settingsForm.description.value = settings?.description || 'Gyors és biztonságos fuvarmegosztó felület utasoknak és sofőröknek.';
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(settingsForm);
        msg.textContent = 'Mentés...';
        const payload = {
          site_name: fd.get('siteName'), company_name: fd.get('companyName'), contact_email: fd.get('email'),
          admin_email: fd.get('adminEmail'), description: fd.get('description')
        };
        if (settings?.id) payload.id = settings.id;
        let error = null;
        if (settings?.id) ({ error } = await sb.from(tableSettings).update(payload).eq('id', settings.id));
        else ({ error } = await sb.from(tableSettings).insert([payload]));
        msg.textContent = error ? 'Nem sikerült menteni.' : 'Mentve.';
      });
    }
    try {
      const [trips, bookings, ratings] = await Promise.all([fetchAllTrips(), fetchBookings(), fetchRatings()]);
      const approved = trips.filter(t => String(t.statusz || '').toLowerCase().includes('jóvá')).length;
      const full = trips.filter(t => Number(t.szabad_helyek || 0) <= 0).length;
      const pending = trips.filter(t => String(t.statusz || '').toLowerCase().includes('függ')).length;
      const totalSeats = trips.reduce((sum, t) => sum + Number(t.auto_helyek ?? t.osszes_hely ?? t.helyek ?? 0), 0);
      const stats = `
        <section class="admin-stats-grid">
          <article class="card stat-card"><small>Összes fuvar</small><strong>${trips.length}</strong></article>
          <article class="card stat-card"><small>Jóváhagyott</small><strong>${approved}</strong></article>
          <article class="card stat-card"><small>Függőben</small><strong>${pending}</strong></article>
          <article class="card stat-card"><small>Betelt fuvar</small><strong>${full}</strong></article>
          <article class="card stat-card"><small>Foglalások</small><strong>${bookings.length}</strong></article>
          <article class="card stat-card"><small>Értékelések</small><strong>${ratings.length}</strong></article>
          <article class="card stat-card"><small>Összes utashely</small><strong>${totalSeats}</strong></article>
        </section>`;
      tripsWrap.insertAdjacentHTML('beforebegin', stats);
      tripsWrap.innerHTML = trips.length ? trips.map(t => tripCard(t, true)).join('') : '<div class="empty-state">Még nincs beküldött fuvar.</div>';
      const tripMap = Object.fromEntries(trips.map(t => [String(t.id), t]));
      bookingsWrap.innerHTML = bookings.length ? bookings.map(b => bookingCard(b, tripMap)).join('') : '<div class="empty-state">Még nincs foglalás.</div>';
    } catch (e) {
      tripsWrap.innerHTML = '<div class="empty-state">A fuvarok betöltése nem sikerült.</div>';
      bookingsWrap.innerHTML = '<div class="empty-state">A foglalások betöltése nem sikerült.</div>';
    }
  }


  async function initDriverPage(){
    const box = document.getElementById('driverProfileCard');
    if (!box) return;
    const params = new URLSearchParams(location.search);
    const email = params.get('email');
    const name = params.get('name');
    const allTrips = await fetchAllTrips().catch(() => []);
    const trips = allTrips.filter(t => (email && t.email === email) || (name && t.nev === name));
    const trip = trips[0] || { nev: name || 'Ismeretlen sofőr', email: email || '', telefon: '', sofor_ertekeles: 0, sofor_ertekeles_db: 0 };
    const rating = getRatingValue(trip);
    box.innerHTML = `
      <div class="driver-avatar">${getInitials(trip.nev)}</div>
      <div class="driver-meta">
        <h2>${trip.nev || 'Ismeretlen sofőr'}</h2>
        <div class="rating-stars">${getStars(rating)} <span style="color:#cddcff;letter-spacing:0">${rating ? rating.toFixed(1) : '0.0'}</span></div>
        <p style="margin:10px 0 0">Kapcsolat: ${trip.email || '-'}</p>
        <p style="margin:8px 0 0">Aktív fuvarok száma: ${trips.length}</p>
        <p style="margin:8px 0 0">Értékelések száma: ${trip.sofor_ertekeles_db || 0}</p>
      </div>`;
    const tripsBox = document.getElementById('driverTrips');
    if (tripsBox){
      tripsBox.innerHTML = trips.length ? trips.map(t => `
        <article class="trip-card card">
          <div class="eyebrow">${t.indulas || ''} → ${t.erkezes || ''}</div>
          <h3>${t.indulas || ''} → ${t.erkezes || ''}</h3>
          <p>${t.datum || ''} ${t.ido || ''} · ${t.ar || t.ar_ft || ''} Ft/fő</p>
          <a class="btn btn-secondary" href="trip.html?id=${t.id}">Részletek</a>
        </article>`).join('') : '<div class="notice">Ennél a sofőrnél még nincs aktív fuvar.</div>';
    }
    const contact = document.getElementById('driverContactBox');
    if (contact) {
      const reviews = await fetchDriverReviews(trip.email || '');
      contact.innerHTML = `<strong>${trip.nev || 'Sofőr'}</strong><br>${trip.email || '-'}<div style="margin-top:14px"><h3 style="margin:0 0 10px">Utasvélemények</h3>${renderReviewList(reviews)}</div>`;
    }
  }

  async function initTripEnhancements(trip){
    const card = document.getElementById('tripDriverProfile');
    if (card){
      const rating = getRatingValue(trip);
      card.innerHTML = `
        <div class="driver-mini">
          <div class="driver-avatar">${getInitials(trip.nev)}</div>
          <div>
            <strong>${trip.nev || 'Sofőr'}</strong><br>
            <span class="rating-stars">${getStars(rating)}</span>
            <span style="color:#cddcff">${rating.toFixed(1)}</span>
          </div>
        </div>
        <div class="trip-tools">
          <a class="btn btn-secondary" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a>
          <a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>
        </div>`;
    }
    const map = document.getElementById('routeMapFrame');
    if (map){
      map.src = buildGoogleMapsEmbedUrl(trip.indulas || '', trip.erkezes || '');
    }
    const openBtn = document.getElementById('openGoogleMaps');
    if (openBtn){
      openBtn.href = buildGoogleMapsDirectionsUrl(trip.indulas || '', trip.erkezes || '');
    }
    const imgBtn = document.getElementById('generateFacebookImage');
    if (imgBtn){
      imgBtn.addEventListener('click', async () => {
        const dataUrl = await generateFacebookPostImage(trip);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `fuvarvelunk-poszt-${trip.id || 'fuvar'}.png`;
        a.click();
      });
    }
    const shareBtn = document.getElementById('shareFacebookText');
    if (shareBtn){
      shareBtn.addEventListener('click', async () => {
        const text = buildFacebookShareText(trip);
        try{
          await navigator.clipboard.writeText(text);
          shareBtn.textContent = 'Szöveg vágólapra másolva';
          setTimeout(() => shareBtn.textContent = 'Facebook szöveg másolása', 2200);
        }catch(e){}
      });
    }
  }


  async function initContactPage() {
    const form = document.getElementById('contactForm');
    const driverForm = document.getElementById('driverQuestionForm');
    const driverSection = document.getElementById('driverQuestionSection');
    const params = new URLSearchParams(location.search);

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const subject = encodeURIComponent('Weboldal kérdés / hibajelzés - FuvarVelünk');
        const body = encodeURIComponent(`Név: ${fd.get('name')}\nE-mail: ${fd.get('email')}\n\nÜzenet:\n${fd.get('message')}`);
        location.href = `mailto:${APP_CONFIG.contactEmail}?subject=${subject}&body=${body}`;
      });
    }

    if (!driverForm) return;
    if (driverSection) driverSection.style.display = params.get('driverEmail') || params.get('driverName') ? '' : 'none';

    const session = await AppAuth.getSession();
    if (session?.user?.email) {
      const emailInput = driverForm.querySelector('[name="email"]');
      if (emailInput) emailInput.value = session.user.email;
      const nameInput = driverForm.querySelector('[name="name"]');
      if (nameInput && !nameInput.value) {
        nameInput.value = session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
      }
    }

    driverForm.querySelector('[name="tripId"]').value = params.get('tripId') || '';
    driverForm.querySelector('[name="driverName"]').value = params.get('driverName') || '';
    driverForm.querySelector('[name="driverEmail"]').value = params.get('driverEmail') || '';

    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('driverQuestionMsg');
      const ok = await AppAuth.requireAuth('kapcsolat.html');
      if (!ok) return;
      const fd = new FormData(driverForm);
      const subject = encodeURIComponent(`Kérdés a sofőrnek - ${fd.get('driverName') || ''}`);
      const body = encodeURIComponent(
        `Fuvar azonosító: ${fd.get('tripId') || '-'}\n` +
        `Feladó neve: ${fd.get('name')}\n` +
        `Feladó e-mail: ${fd.get('email')}\n\n` +
        `Üzenet:\n${fd.get('message')}`
      );
      const driverEmail = fd.get('driverEmail') || APP_CONFIG.contactEmail;
      msg.textContent = 'Megnyílik az üzenet küldése...';
      location.href = `mailto:${driverEmail}?subject=${subject}&body=${body}`;
    });
  }

  async function initTripDetailPage() {
    const wrap = document.getElementById('tripDetail');
    if (!wrap) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { wrap.innerHTML = '<div class="empty-state">A fuvar nem található.</div>'; return; }
    try {
      const trip = await fetchTripById(id);
      if (!trip) { wrap.innerHTML = '<div class="empty-state">A fuvar nem található.</div>'; return; }
      const ratings = await fetchRatings();
      const tripReviews = ratings.filter(r => String(r.fuvar_id) === String(trip.id) && String(r.tipus || '').toLowerCase().includes('utaz'));
      const driverReviews = ratings.filter(r => String(r.fuvar_id) === String(trip.id) && String(r.tipus || '').toLowerCase().includes('sofor'));
      const extra = `
        <section class="card detail-extra">
          <h2>Sofőr profil</h2>
          <p><strong>${escapeHtml(trip.nev || '')}</strong></p>
          <p>${trip.sofor_ertekeles_db ? starRating(trip.sofor_ertekeles || 0) + ` <small class="muted-inline">(${trip.sofor_ertekeles_db} értékelés)</small>` : 'Még nincs sofőr értékelés.'}</p>
          <p>Kapcsolat: ${escapeHtml(trip.email || '')}</p>
          ${trip.bankszamla ? `<p><strong>Bankszámla:</strong> ${escapeHtml(trip.bankszamla)}</p>` : ''}
          <div class="inline-pills" style="margin-top:12px"><a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a><a class="btn btn-secondary" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a></div>
        </section>
        <section class="review-grid section">
          <section class="card"><h2>Sofőr értékelései</h2>${renderReviewList(driverReviews)}${reviewForm(trip, 'sofor', 'Sofőr értékelése')}</section>
          <section class="card"><h2>Utazás értékelései</h2>${renderReviewList(tripReviews)}${reviewForm(trip, 'utazas', 'Utazás értékelése')}</section>
        </section>`;
      wrap.innerHTML = tripCard(trip, false) + extra;
      await focusRoute(trip.indulas, trip.erkezes);
      wrap.querySelectorAll('.js-review-form').forEach(form => {
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const msg = form.querySelector('.form-message');
          msg.textContent = 'Mentés...';
          try {
            await submitReview(trip, form);
            msg.textContent = 'Értékelés mentve.';
            setTimeout(() => location.reload(), 700);
          } catch (err) {
            msg.textContent = err.message || 'Nem sikerült menteni az értékelést.';
          }
        });
      });
    } catch (_) {
      wrap.innerHTML = '<div class="empty-state">A fuvar betöltése nem sikerült.</div>';
    }
  }

  async function init() {
    await AppAuth.updateNav();
    AppAuth.bindLogout();
    AppAuth.watchAuth();
    await applySettings();
    bindGlobalActions();
    await initHome();
    await initTripsPage();
    await initTripFormPage();
    await initAuthPage();
    await initAdminPage();
    await initContactPage();
    await initDriverPage();
    await initTripDetailPage();
  }

  return { init, focusRoute };
})();

document.addEventListener('DOMContentLoaded', () => { App.init(); });
