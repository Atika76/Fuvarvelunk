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
    const targetEmail = kind === 'uj_foglalas' ? (payload.sofor_email || body.sofor_email || adminEmail) : adminEmail

    if (!RESEND_API_KEY || !targetEmail) {
      return new Response(JSON.stringify({ ok: false, message: 'Missing config' }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })
    }

    const subject = kind === 'uj_foglalas'
      ? `Új foglalás érkezett: ${payload.utas_nev || payload.nev || ''}`
      : `Új fuvar vár jóváhagyásra: ${payload.indulas || ''} → ${payload.erkezes || payload.cel || ''}`

    const html = kind === 'uj_foglalas'
      ? `<h2>Új foglalás érkezett</h2><p>Foglaló: <strong>${payload.utas_nev || payload.nev || ''}</strong></p><p>Utas e-mail: ${payload.utas_email || payload.email || ''}</p><p>Telefon: ${payload.telefon || ''}</p><p>Foglalt helyek: ${payload.foglalt_helyek || payload.helyek || 1}</p><p>Fizetési mód: ${payload.fizetesi_mod || ''}</p><p>Sofőr: ${payload.sofor_nev || ''} (${payload.sofor_email || ''})</p><p>Fuvar ID: ${payload.fuvar_id || ''}</p>`
      : `<h2>Új fuvar vár jóváhagyásra</h2><p><strong>${payload.indulas || ''}</strong> → <strong>${payload.erkezes || payload.cel || ''}</strong></p><p>Dátum: ${payload.datum || ''} ${payload.ido || ''}</p><p>Sofőr: ${payload.nev || ''} (${payload.email || payload.sofor_email || ''})</p><p>Telefonszám: ${payload.telefon || ''}</p>`

    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FuvarVelünk <onboarding@resend.dev>',
        to: [targetEmail],
        subject,
        html,
      })
    })

    const data = await resend.text()
    return new Response(JSON.stringify({ ok: resend.ok, data }), { headers: { 'Content-Type': 'application/json', ...cors } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
  }
})
