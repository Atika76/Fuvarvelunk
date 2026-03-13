import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FALLBACK_ADMIN_EMAIL = 'cegweb26@gmail.com'

serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json()
    const kind = body.kind || body.tipus || ''
    const payload = body.payload || body || {}
    const adminEmail = body.adminEmail || FALLBACK_ADMIN_EMAIL

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, message: 'Missing config' }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })
    }

    const sends = []

    if (kind === 'uj_foglalas') {
      sends.push({
        to: payload.sofor_email || body.sofor_email || adminEmail,
        subject: `Új foglalás érkezett: ${payload.utas_nev || payload.nev || ''}`,
        html: `<h2>Új foglalás érkezett</h2><p>Foglaló: <strong>${payload.utas_nev || payload.nev || ''}</strong></p><p>Utas e-mail: ${payload.utas_email || payload.email || ''}</p><p>Telefon: ${payload.telefon || ''}</p><p>Foglalt helyek: ${payload.foglalt_helyek || payload.helyek || 1}</p><p>Fizetési mód: ${payload.fizetesi_mod_text || payload.fizetesi_mod || ''}</p><p>Sofőr: ${payload.sofor_nev || ''} (${payload.sofor_email || ''})</p><p>Fuvar: ${payload.indulas || ''} → ${payload.erkezes || ''}</p><p>Dátum: ${payload.datum || ''} ${payload.ido || ''}</p>`
      })
    } else if (kind === 'utas_visszaigazolas') {
      if (payload.utas_email || payload.email) {
        sends.push({
          to: payload.utas_email || payload.email,
          subject: `Foglalás visszaigazolás: ${payload.indulas || ''} → ${payload.erkezes || ''}`,
          html: `<h2>Sikeres foglalás</h2><p>Kedves ${payload.utas_nev || payload.nev || 'Utas'}!</p><p>A foglalásod rögzítve lett a következő útra:</p><p><strong>${payload.indulas || ''} → ${payload.erkezes || ''}</strong></p><p>Dátum: ${payload.datum || ''} ${payload.ido || ''}</p><p>Sofőr: ${payload.sofor_nev || ''}</p><p>Fizetési mód: ${payload.fizetesi_mod_text || payload.fizetesi_mod || ''}</p><p>Foglalt helyek: ${payload.foglalt_helyek || 1}</p><p>Kapcsolat: ${payload.sofor_email || ''}</p>`
        })
      }
    } else {
      sends.push({
        to: adminEmail,
        subject: `Új fuvar vár jóváhagyásra: ${payload.indulas || ''} → ${payload.erkezes || payload.cel || ''}`,
        html: `<h2>Új fuvar vár jóváhagyásra</h2><p><strong>${payload.indulas || ''}</strong> → <strong>${payload.erkezes || payload.cel || ''}</strong></p><p>Dátum: ${payload.datum || ''} ${payload.ido || ''}</p><p>Sofőr: ${payload.nev || ''} (${payload.email || payload.sofor_email || ''})</p><p>Telefonszám: ${payload.telefon || ''}</p>`
      })
    }

    const results = []
    for (const item of sends) {
      const resend = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'FuvarVelünk <onboarding@resend.dev>',
          to: [item.to],
          subject: item.subject,
          html: item.html,
        })
      })
      const data = await resend.text()
      results.push({ ok: resend.ok, to: item.to, subject: item.subject, data })
    }

    if (results.some(x => !x.ok)) {
      return new Response(JSON.stringify({ ok: false, results }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
    }
    return new Response(JSON.stringify({ ok: true, subject: results[0]?.subject || kind, results }), { headers: { 'Content-Type': 'application/json', ...cors } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
  }
})
