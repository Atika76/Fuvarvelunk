import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FALLBACK_ADMIN_EMAIL = 'cegweb26@gmail.com'
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') || ''

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' }

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normPhone(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '')
  if (raw.startsWith('00')) return '+' + raw.slice(2).replace(/\D/g, '')
  if (raw.startsWith('06')) return '+36' + raw.slice(2).replace(/\D/g, '')
  return raw.replace(/\D/g, '')
}

async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return { ok: false, skipped: true, reason: 'missing_mail_config_or_recipient' }
  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'FuvarVelünk <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    })
  })
  const data = await resend.text()
  return { ok: resend.ok, skipped: false, channel: 'email', to, subject, data }
}

async function sendSms(to: string, body: string) {
  const phone = normPhone(to)
  if (!phone) return { ok: false, skipped: true, reason: 'missing_phone' }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, skipped: true, reason: 'missing_twilio_config', to: phone }
  }
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: TWILIO_FROM_NUMBER, To: phone, Body: body }).toString(),
  })
  const data = await resp.text()
  return { ok: resp.ok, skipped: false, channel: 'sms', to: phone, body, data }
}

function buildNotification(kind: string, payload: Record<string, unknown>, adminEmail: string) {
  const route = `${esc(payload.indulas)} → ${esc(payload.erkezes || payload.cel || '')}`
  const dateTime = `${esc(payload.datum)} ${esc(payload.ido)}`.trim()
  const passengerName = esc(payload.utas_nev || payload.nev || 'Utas')
  const driverName = esc(payload.sofor_nev || payload.driver_name || payload.nev || 'Sofőr')
  const seats = esc(payload.foglalt_helyek || payload.helyek || 1)
  const payText = esc(payload.fizetesi_mod_text || payload.fizetesi_mod || '')

  switch (kind) {
    case 'uj_foglalas':
      return {
        emails: [{
          to: String(payload.sofor_email || adminEmail),
          subject: `Új foglalás érkezett: ${passengerName}`,
          html: `<h2>Új foglalás érkezett</h2><p>Foglaló: <strong>${passengerName}</strong></p><p>Utas e-mail: ${esc(payload.utas_email || payload.email || '')}</p><p>Telefon: ${esc(payload.telefon || payload.utas_telefon || '')}</p><p>Foglalt helyek: ${seats}</p><p>Fizetési mód: ${payText}</p><p>Sofőr: ${driverName} (${esc(payload.sofor_email || '')})</p><p>Fuvar: ${route}</p><p>Dátum: ${dateTime}</p>`
        }],
        sms: [{
          to: String(payload.sofor_telefon || ''),
          body: `FuvarVelünk: új foglalás érkezett a ${String(payload.indulas || '')} → ${String(payload.erkezes || '')} fuvarodra. Utas: ${String(payload.utas_nev || payload.nev || '')}, helyek: ${String(payload.foglalt_helyek || 1)}.`
        }]
      }
    case 'utas_visszaigazolas':
      return {
        emails: (payload.utas_email || payload.email) ? [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás visszaigazolás: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: `<h2>Sikeres foglalás</h2><p>Kedves ${passengerName}!</p><p>A foglalásod rögzítve lett a következő útra:</p><p><strong>${route}</strong></p><p>Dátum: ${dateTime}</p><p>Sofőr: ${driverName}</p><p>Fizetési mód: ${payText}</p><p>Foglalt helyek: ${seats}</p><p>Kapcsolat: ${esc(payload.sofor_email || '')}</p>`
        }] : [],
        sms: []
      }
    case 'foglalas_jovahagyva':
      return {
        emails: (payload.utas_email || payload.email) ? [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás jóváhagyva: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: `<h2>Foglalás jóváhagyva</h2><p>Kedves ${passengerName}!</p><p>A sofőr jóváhagyta a foglalásodat.</p><p><strong>${route}</strong></p><p>Dátum: ${dateTime}</p><p>Sofőr: ${driverName}</p><p>Kapcsolat: ${esc(payload.sofor_email || '')}${payload.sofor_telefon ? ' · ' + esc(payload.sofor_telefon) : ''}</p>`
        }] : [],
        sms: [{
          to: String(payload.utas_telefon || payload.telefon || ''),
          body: `FuvarVelünk: a foglalásodat jóváhagyták. Fuvar: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}, indulás: ${String(payload.datum || '')} ${String(payload.ido || '')}.`
        }]
      }
    case 'fizetve_jelolve':
      return {
        emails: (payload.utas_email || payload.email) ? [{
          to: String(payload.utas_email || payload.email),
          subject: `Fizetés visszaigazolva: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: `<h2>Fizetés visszaigazolva</h2><p>Kedves ${passengerName}!</p><p>A sofőr fizetettnek jelölte a foglalásodat.</p><p><strong>${route}</strong></p><p>Dátum: ${dateTime}</p><p>Kérjük, jelenj meg indulás előtt legalább 10 perccel.</p>`
        }] : [],
        sms: [{
          to: String(payload.utas_telefon || payload.telefon || ''),
          body: `FuvarVelünk: a sofőr fizetettnek jelölte a foglalásodat. ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}, ${String(payload.datum || '')} ${String(payload.ido || '')}.`
        }]
      }
    case 'sofor_indulas_emlekezteto':
      return {
        emails: [{
          to: String(payload.sofor_email || adminEmail),
          subject: `Fuvar indul 2 órán belül: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: `<h2>Indulási emlékeztető</h2><p>Kedves ${driverName}!</p><p>A fuvarod 2 órán belül indul.</p><p><strong>${route}</strong></p><p>Dátum: ${dateTime}</p><p>Foglalások száma: ${esc(payload.foglalas_db || 0)}</p>`
        }],
        sms: [{
          to: String(payload.sofor_telefon || payload.telefon || ''),
          body: `FuvarVelünk: a ${String(payload.indulas || '')} → ${String(payload.erkezes || '')} fuvarod 2 órán belül indul. Foglalások: ${String(payload.foglalas_db || 0)}.`
        }]
      }
    case 'uj_fuvar':
    default:
      return {
        emails: [{
          to: adminEmail,
          subject: `Új fuvar vár jóváhagyásra: ${String(payload.indulas || '')} → ${String(payload.erkezes || payload.cel || '')}`,
          html: `<h2>Új fuvar vár jóváhagyásra</h2><p><strong>${route}</strong></p><p>Dátum: ${dateTime}</p><p>Sofőr: ${esc(payload.nev || payload.sofor_nev || '')} (${esc(payload.email || payload.sofor_email || '')})</p><p>Telefonszám: ${esc(payload.telefon || '')}</p>`
        }],
        sms: []
      }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json()
    const kind = body.kind || body.tipus || ''
    const payload = body.payload || body || {}
    const adminEmail = body.adminEmail || FALLBACK_ADMIN_EMAIL

    const notification = buildNotification(kind, payload, adminEmail)
    const results = []

    for (const item of notification.emails || []) results.push(await sendMail(item.to, item.subject, item.html))
    for (const item of notification.sms || []) results.push(await sendSms(item.to, item.body))

    const emailFailures = results.filter((x: any) => x.channel === 'email' && !x.ok && !x.skipped)
    const mainSubject = (notification.emails && notification.emails[0]?.subject) || kind

    return new Response(JSON.stringify({
      ok: emailFailures.length === 0,
      subject: mainSubject,
      results,
      sms_enabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
    }), { headers: { 'Content-Type': 'application/json', ...cors } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
  }
})
