import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') || '').trim()
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || '').trim()
const RESEND_FROM_EMAIL = (Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev').trim()
const RESEND_FROM_NAME = (Deno.env.get('RESEND_FROM_NAME') || 'FuvarVelünk').trim()
const FALLBACK_ADMIN_EMAIL = ADMIN_EMAIL || 'cegweb26@gmail.com'
const TWILIO_ACCOUNT_SID = (Deno.env.get('TWILIO_ACCOUNT_SID') || '').trim()
const TWILIO_AUTH_TOKEN = (Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim()
const TWILIO_FROM_NUMBER = (Deno.env.get('TWILIO_FROM_NUMBER') || '').trim()

const ONESIGNAL_APP_ID = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim()
const ONESIGNAL_API_KEY = (Deno.env.get('ONESIGNAL_API_KEY') || '').trim()
const SITE_URL = ((Deno.env.get('SITE_URL') || 'https://fuvarvelunk.hu').trim() || 'https://fuvarvelunk.hu').replace(/\/$/, '')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

function normExternalId(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function safeUrl(path: string, params: Record<string, string | undefined> = {}, hash = '') {
  try {
    const base = SITE_URL || 'https://fuvarvelunk.hu'
    const url = new URL(path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`)
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
    })
    if (hash) url.hash = hash.startsWith('#') ? hash.slice(1) : hash
    return url.toString()
  } catch (_) {
    return SITE_URL || 'https://fuvarvelunk.hu'
  }
}

function ctaButton(label: string, href: string, tone: 'primary' | 'success' | 'dark' = 'primary') {
  const bg = tone === 'success' ? '#16a34a' : tone === 'dark' ? '#111827' : '#2563eb'
  return `<div style="margin:16px 0 10px"><a href="${esc(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">${esc(label)}</a></div>`
}

function directLinkBlock(label: string, href: string) {
  return `
    <div style="margin:14px 0 0;padding:14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:12px">
      <div style="font-weight:700;margin-bottom:8px">${esc(label)}</div>
      <div style="word-break:break-all"><a href="${esc(href)}">${esc(href)}</a></div>
    </div>`
}

function emailLayout(title: string, introHtml: string, detailsHtml: string, ctas: { label: string; href: string; tone?: 'primary'|'success'|'dark'; directLabel?: string }[] = []) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827;max-width:700px;margin:0 auto;padding:24px;background:#ffffff">
      <div style="font-size:28px;font-weight:800;line-height:1.2;margin:0 0 18px">${esc(title)}</div>
      <div style="font-size:16px;margin:0 0 18px">${introHtml}</div>
      <div style="padding:18px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa">${detailsHtml}</div>
      ${ctas.map(cta => `${ctaButton(cta.label, cta.href, cta.tone || 'primary')}${directLinkBlock(cta.directLabel || 'Közvetlen link', cta.href)}`).join('')}
      <p style="margin:18px 0 0;color:#4b5563;font-size:14px">Ha a gomb nem működik, használd a közvetlen linket. A link a megfelelő oldalra visz, hogy ne kelljen keresgélni a FuvarVelünk oldalon.</p>
    </div>`
}

async function readJsonSafe(req: Request) {
  const raw = await req.text()
  if (!raw || !raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Hibás JSON kérés: ${String(error)}`)
  }
}

async function sendMail(to: string, subject: string, html: string) {
  const cleanTo = String(to || '').trim()
  if (!cleanTo) {
    return { ok: false, skipped: true, channel: 'email', reason: 'missing_recipient' }
  }

  if (!RESEND_API_KEY) {
    return { ok: false, skipped: false, channel: 'email', to: cleanTo, subject, reason: 'missing_RESEND_API_KEY' }
  }

  if (!RESEND_FROM_EMAIL) {
    return { ok: false, skipped: false, channel: 'email', to: cleanTo, subject, reason: 'missing_RESEND_FROM_EMAIL' }
  }

  try {
    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [cleanTo],
        subject,
        html,
      })
    })

    const data = await resend.text()
    return { ok: resend.ok, skipped: false, channel: 'email', to: cleanTo, subject, status: resend.status, data }
  } catch (error) {
    return { ok: false, skipped: false, channel: 'email', to: cleanTo, subject, reason: 'fetch_error', error: String(error) }
  }
}

async function sendSms(to: string, body: string) {
  const phone = normPhone(to)
  if (!phone) return { ok: false, skipped: true, channel: 'sms', reason: 'missing_phone' }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, skipped: true, channel: 'sms', reason: 'missing_twilio_config', to: phone }
  }

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_FROM_NUMBER,
        To: phone,
        Body: body
      }).toString(),
    })

    const data = await resp.text()
    return { ok: resp.ok, skipped: false, channel: 'sms', to: phone, body, status: resp.status, data }
  } catch (error) {
    return { ok: false, skipped: false, channel: 'sms', to: phone, reason: 'fetch_error', error: String(error) }
  }
}

async function sendPush(externalIds: string[], heading: string, message: string, url?: string) {
  const ids = [...new Set((externalIds || []).map(normExternalId).filter(Boolean))]
  if (!ids.length) return { ok: false, skipped: true, channel: 'push', reason: 'missing_external_ids' }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    return { ok: false, skipped: true, channel: 'push', reason: 'missing_onesignal_config', ids }
  }

  try {
    const resp = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${ONESIGNAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        include_aliases: { external_id: ids },
        headings: { en: heading, hu: heading },
        contents: { en: message, hu: message },
        url: url || SITE_URL,
        web_url: url || SITE_URL,
      })
    })

    const data = await resp.text()
    return { ok: resp.ok, skipped: false, channel: 'push', ids, heading, message, status: resp.status, data }
  } catch (error) {
    return { ok: false, skipped: false, channel: 'push', ids, reason: 'fetch_error', error: String(error) }
  }
}

function createAdminClient() {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function writeLog(kind: string, payload: Record<string, unknown>, subject: string, results: unknown[]) {
  try {
    const admin = createAdminClient()
    if (!admin) return

    const recipient = String(
      payload.utas_email || payload.email || payload.sofor_email || payload.driver_email || ''
    )

    const emailResult = (results || []).find((x: any) => x?.channel === 'email') as any
    const smsResult = (results || []).find((x: any) => x?.channel === 'sms') as any
    const pushResult = (results || []).find((x: any) => x?.channel === 'push') as any

    await admin.from('email_naplo').insert([{
      tipus: kind || 'ismeretlen',
      cel_email: recipient,
      statusz: emailResult?.ok ? 'elkuldve' : (emailResult?.skipped ? 'kihagyva' : 'sikertelen'),
      sikeres: !!emailResult?.ok,
      targy: subject || kind || 'ertesites',
      payload: {
        ...(payload || {}),
        sms_ok: !!smsResult?.ok,
        sms_skipped: !!smsResult?.skipped,
        push_ok: !!pushResult?.ok,
        push_skipped: !!pushResult?.skipped,
        results,
      },
    }])
  } catch (err) {
    console.warn('email_naplo log hiba:', err)
  }
}

type EmailItem = { to: string; subject: string; html: string }
type SmsItem = { to: string; body: string }
type PushItem = { externalIds: string[]; heading: string; message: string; url?: string }

function buildNotification(kind: string, payload: Record<string, unknown>, adminEmail: string) {
  const route = `${esc(payload.indulas)} → ${esc(payload.erkezes || payload.cel || '')}`
  const dateTime = `${esc(payload.datum)} ${esc(payload.ido)}`.trim()
  const passengerName = esc(payload.utas_nev || payload.nev || 'Utas')
  const driverName = esc(payload.sofor_nev || payload.driver_name || payload.nev || 'Sofőr')
  const seats = esc(payload.foglalt_helyek || payload.helyek || 1)
  const payText = esc(payload.fizetesi_mod_text || payload.fizetesi_mod || '')
  const tripId = String(payload.fuvar_id || payload.trip_id || payload.id || '').trim()
  const bookingId = String(payload.foglalas_id || payload.booking_id || '').trim()
  const tripUrl = tripId ? safeUrl('/trip.html', { id: tripId, ...(bookingId ? { bookingId } : {}) }) : SITE_URL
  const driverBookingsUrl = tripId ? safeUrl('/trip.html', { id: tripId, ...(bookingId ? { bookingId } : {}) }, 'driverBookingsSection') : tripUrl
  const adminUrl = safeUrl('/admin.html', { ...(tripId ? { tripId } : {}), ...(bookingId ? { bookingId } : {}) })

  let emails: EmailItem[] = []
  let sms: SmsItem[] = []
  let push: PushItem[] = []

  switch (kind) {
    case 'uj_foglalas':
      emails = [{
        to: String(payload.sofor_email || adminEmail),
        subject: `Új foglalás érkezett: ${passengerName}`,
        html: emailLayout(
          'Új foglalás érkezett',
          `Új utas foglalt a fuvarodra. Az alábbi link rögtön a megfelelő foglaláshoz visz.`,
          `<p><strong>Foglaló:</strong> ${passengerName}</p><p><strong>Utas e-mail:</strong> ${esc(payload.utas_email || payload.email || '')}</p><p><strong>Telefon:</strong> ${esc(payload.telefon || payload.utas_telefon || '')}</p><p><strong>Foglalt helyek:</strong> ${seats}</p><p><strong>Fizetési mód:</strong> ${payText}</p><p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p>`,
          [{ label: 'Foglalás megnyitása', href: driverBookingsUrl, tone: 'success', directLabel: 'Közvetlen link a foglaláshoz' }]
        )
      }]
      sms = [{
        to: String(payload.sofor_telefon || ''),
        body: `FuvarVelünk: új foglalás érkezett a ${String(payload.indulas || '')} → ${String(payload.erkezes || '')} fuvarodra. Utas: ${String(payload.utas_nev || payload.nev || '')}, helyek: ${String(payload.foglalt_helyek || 1)}.`
      }]
      push = [{
        externalIds: [String(payload.sofor_email || '')],
        heading: 'Új foglalás érkezett',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || '')} · ${String(payload.utas_nev || payload.nev || 'Utas')}`,
        url: driverBookingsUrl
      }]
      break

    case 'utas_visszaigazolas':
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás visszaigazolás: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: emailLayout(
            'Sikeres foglalás',
            `Kedves ${passengerName}! A foglalásod rögzítve lett. Az alábbi link közvetlenül a fuvarodhoz visz.`,
            `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${driverName}</p><p><strong>Fizetési mód:</strong> ${payText}</p><p><strong>Foglalt helyek:</strong> ${seats}</p><p><strong>Kapcsolat:</strong> ${esc(payload.sofor_email || '')}</p>`,
            [{ label: 'Fuvar megnyitása', href: tripUrl, directLabel: 'Közvetlen link a fuvarhoz' }]
          )
        }]
      }
      break

    case 'foglalas_jovahagyva':
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás jóváhagyva: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: emailLayout(
            'Foglalás jóváhagyva',
            `Kedves ${passengerName}! A sofőr jóváhagyta a foglalásodat. Az alábbi link rögtön a saját foglalásodhoz visz.`,
            `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${driverName}</p><p><strong>Kapcsolat:</strong> ${esc(payload.sofor_email || '')}${payload.sofor_telefon ? ' · ' + esc(payload.sofor_telefon) : ''}</p>`,
            [{ label: 'Foglalásom megnyitása', href: tripUrl, tone: 'success', directLabel: 'Közvetlen link a foglalásomhoz' }]
          )
        }]
      }
      sms = [{
        to: String(payload.utas_telefon || payload.telefon || ''),
        body: `FuvarVelünk: a foglalásodat jóváhagyták. Fuvar: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}, indulás: ${String(payload.datum || '')} ${String(payload.ido || '')}.`
      }]
      push = [{
        externalIds: [String(payload.utas_email || payload.email || '')],
        heading: 'Foglalás jóváhagyva',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || '')} · ${String(payload.datum || '')} ${String(payload.ido || '')}`,
        url: tripUrl
      }]
      break

    case 'fizetve_jelolve':
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Fizetés visszaigazolva: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
          html: emailLayout(
            'Fizetés visszaigazolva',
            `Kedves ${passengerName}! A sofőr fizetettnek jelölte a foglalásodat.`,
            `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p>Kérjük, jelenj meg indulás előtt legalább 10 perccel.</p>`,
            [{ label: 'Fuvar megnyitása', href: tripUrl, directLabel: 'Közvetlen link a fuvarhoz' }]
          )
        }]
      }
      sms = [{
        to: String(payload.utas_telefon || payload.telefon || ''),
        body: `FuvarVelünk: a sofőr fizetettnek jelölte a foglalásodat. ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}, ${String(payload.datum || '')} ${String(payload.ido || '')}.`
      }]
      push = [{
        externalIds: [String(payload.utas_email || payload.email || '')],
        heading: 'Fizetés visszaigazolva',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || '')} · indulás előtt 10 perccel érkezz`,
        url: tripUrl
      }]
      break

    case 'sofor_indulas_emlekezteto':
      emails = [{
        to: String(payload.sofor_email || adminEmail),
        subject: `Fuvar indul 2 órán belül: ${String(payload.indulas || '')} → ${String(payload.erkezes || '')}`,
        html: emailLayout(
          'Indulási emlékeztető',
          `Kedves ${driverName}! A fuvarod 2 órán belül indul.`,
          `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p><strong>Foglalások száma:</strong> ${esc(payload.foglalas_db || 0)}</p>`,
          [{ label: 'Fuvar és foglalások megnyitása', href: driverBookingsUrl, directLabel: 'Közvetlen link a fuvarhoz' }]
        )
      }]
      sms = [{
        to: String(payload.sofor_telefon || payload.telefon || ''),
        body: `FuvarVelünk: a ${String(payload.indulas || '')} → ${String(payload.erkezes || '')} fuvarod 2 órán belül indul. Foglalások: ${String(payload.foglalas_db || 0)}.`
      }]
      push = [{
        externalIds: [String(payload.sofor_email || '')],
        heading: 'Fuvar indul 2 órán belül',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || '')} · foglalások: ${String(payload.foglalas_db || 0)}`,
        url: driverBookingsUrl
      }]
      break

    case 'uj_fuvar':
    default:
      emails = [{
        to: adminEmail,
        subject: `Új fuvar vár jóváhagyásra: ${String(payload.indulas || '')} → ${String(payload.erkezes || payload.cel || '')}`,
        html: emailLayout(
          'Új fuvar vár jóváhagyásra',
          'Új fuvar érkezett a rendszerbe. Az alábbi link közvetlenül az admin felületen a megfelelő fuvarhoz visz.',
          `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${esc(payload.nev || payload.sofor_nev || '')} (${esc(payload.email || payload.sofor_email || '')})</p><p><strong>Telefonszám:</strong> ${esc(payload.telefon || '')}</p>`,
          [{ label: 'Jóváhagyás megnyitása', href: adminUrl, tone: 'dark', directLabel: 'Közvetlen link a jóváhagyáshoz' }]
        )
      }]
      break
  }

  return { emails, sms, push }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Csak POST kérés támogatott.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors }
    })
  }

  try {
    const body = await readJsonSafe(req)
    const kind = String((body as any)?.kind || (body as any)?.tipus || 'uj_fuvar').trim()
    const payload = ((body as any)?.payload || body || {}) as Record<string, unknown>
    const adminEmail = String((body as any)?.adminEmail || payload.adminEmail || payload.admin_email || payload.sofor_email || ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL).trim()

    const notification = buildNotification(kind, payload, adminEmail)
    const results: unknown[] = []

    for (const item of notification.emails || []) results.push(await sendMail(item.to, item.subject, item.html))
    for (const item of notification.sms || []) results.push(await sendSms(item.to, item.body))
    for (const item of notification.push || []) results.push(await sendPush(item.externalIds, item.heading, item.message, item.url))

    const emailFailures = results.filter((x: any) => x.channel === 'email' && !x.ok && !x.skipped)
    const mainSubject = (notification.emails && notification.emails[0]?.subject) || kind

    await writeLog(kind, payload, mainSubject, results)

    return new Response(JSON.stringify({
      ok: emailFailures.length === 0,
      kind,
      subject: mainSubject,
      results,
      sms_enabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
      push_enabled: !!(ONESIGNAL_APP_ID && ONESIGNAL_API_KEY),
      email_enabled: !!RESEND_API_KEY,
      email_to: adminEmail,
      email_from: RESEND_FROM_EMAIL,
      site_url: SITE_URL,
    }), {
      headers: { 'Content-Type': 'application/json', ...cors }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(error),
      hint: 'Ellenőrizd a Supabase Edge Function Secrets beállításokat és a küldött JSON formátumát.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    })
  }
})
