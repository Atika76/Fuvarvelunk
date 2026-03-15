import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FALLBACK_ADMIN_EMAIL = 'cegweb26@gmail.com'
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') || ''

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') || ''
const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY') || ''
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://fuvarvelunk.hu').replace(/\/$/, '')
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
const APPROVAL_SIGNING_SECRET = Deno.env.get('EMAIL_APPROVAL_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const APPROVAL_TTL_SECONDS = Number(Deno.env.get('EMAIL_APPROVAL_TTL_SECONDS') || 60 * 60 * 24 * 7)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
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

function buildUrl(path: string, params: Record<string, string | undefined> = {}, hash = '') {
  const url = new URL(path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  if (hash) url.hash = hash.startsWith('#') ? hash.slice(1) : hash
  return url.toString()
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

async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) {
    return { ok: false, skipped: true, reason: 'missing_mail_config_or_recipient' }
  }

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
    body: new URLSearchParams({
      From: TWILIO_FROM_NUMBER,
      To: phone,
      Body: body
    }).toString(),
  })

  const data = await resp.text()
  return { ok: resp.ok, skipped: false, channel: 'sms', to: phone, body, data }
}

type PushTarget = { externalIds?: string[]; filters?: Array<Record<string, unknown>> }

async function sendPush(target: PushTarget, heading: string, message: string, url?: string) {
  const ids = [...new Set((target?.externalIds || []).map(normExternalId).filter(Boolean))]
  const filters = Array.isArray(target?.filters) ? target.filters.filter(Boolean) : []

  if (!ids.length && !filters.length) return { ok: false, skipped: true, reason: 'missing_push_target' }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    return { ok: false, skipped: true, reason: 'missing_onesignal_config', ids, filters_count: filters.length }
  }

  const body: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    headings: {
      en: heading,
      hu: heading
    },
    contents: {
      en: message,
      hu: message
    },
    url: url || SITE_URL,
    web_url: url || SITE_URL
  }

  if (ids.length) {
    body.include_aliases = { external_id: ids }
  } else if (filters.length) {
    body.filters = filters
  }

  const resp = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${ONESIGNAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const data = await resp.text()
  return {
    ok: resp.ok,
    skipped: false,
    channel: 'push',
    ids,
    filters_count: filters.length,
    heading,
    message,
    data
  }
}


function base64UrlEncode(bytes: Uint8Array) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlDecode(input: string) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + pad)
  return new Uint8Array([...binary].map(ch => ch.charCodeAt(0)))
}

async function signText(value: string) {
  if (!APPROVAL_SIGNING_SECRET) throw new Error('missing_approval_signing_secret')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APPROVAL_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

async function verifyTextSignature(value: string, signature: string) {
  const expected = await signText(value)
  return crypto.timingSafeEqual(base64UrlDecode(expected), base64UrlDecode(signature))
}

async function createApprovalToken(tripId: string) {
  const exp = Math.floor(Date.now() / 1000) + APPROVAL_TTL_SECONDS
  const payload = `${tripId}.${exp}.approve`
  const sig = await signText(payload)
  return `${payload}.${sig}`
}

async function verifyApprovalToken(token: string, tripId: string) {
  const parts = String(token || '').split('.')
  if (parts.length !== 4) return { ok: false, reason: 'invalid_token_format' }
  const [tokenTripId, expRaw, action, sig] = parts
  if (tokenTripId !== tripId) return { ok: false, reason: 'trip_mismatch' }
  if (action !== 'approve') return { ok: false, reason: 'invalid_action' }
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'token_expired' }
  const payload = `${tokenTripId}.${expRaw}.${action}`
  const valid = await verifyTextSignature(payload, sig)
  return valid ? { ok: true } : { ok: false, reason: 'bad_signature' }
}

function buildApprovalFunctionUrl(tripId: string, token: string) {
  if (!SUPABASE_URL) return ''
  return `${SUPABASE_URL}/functions/v1/notify-admin?action=approve_trip&tripId=${encodeURIComponent(tripId)}&token=${encodeURIComponent(token)}`
}

function approvalResultHtml(opts: { ok: boolean; title: string; message: string; tripId?: string; actionUrl?: string }) {
  const adminUrl = buildUrl('/admin.html', opts.tripId ? { tripId: opts.tripId } : {})
  return `<!doctype html>
  <html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(opts.title)}</title></head>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:24px;color:#111827">
    <div style="max-width:720px;margin:40px auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.08)">
      <div style="font-size:30px;font-weight:800;margin-bottom:12px">${esc(opts.title)}</div>
      <p style="font-size:17px;line-height:1.6;margin:0 0 18px">${opts.message}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px">
        ${opts.ok ? `<a href="${esc(adminUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">Admin felület megnyitása</a>` : ''}
        ${opts.actionUrl ? `<a href="${esc(opts.actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">Próbáld újra</a>` : ''}
        <a href="${esc(SITE_URL)}" style="display:inline-block;background:#f3f4f6;color:#111827;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700;border:1px solid #d1d5db">FuvarVelünk főoldal</a>
      </div>
    </div>
  </body></html>`
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
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
      },
    }])
  } catch (err) {
    console.warn('email_naplo log hiba:', err)
  }
}

type EmailItem = { to: string; subject: string; html: string }
type SmsItem = { to: string; body: string }
type PushItem = { externalIds?: string[]; filters?: Array<Record<string, unknown>>; heading: string; message: string; url?: string }

async function buildNotification(kind: string, payload: Record<string, unknown>, adminEmail: string) {
  const route = `${esc(payload.indulas)} → ${esc(payload.erkezes || payload.cel || '')}`
  const dateTime = `${esc(payload.datum)} ${esc(payload.ido)}`.trim()
  const passengerName = esc(payload.utas_nev || payload.nev || 'Utas')
  const driverName = esc(payload.sofor_nev || payload.driver_name || payload.nev || 'Sofőr')
  const seats = esc(payload.foglalt_helyek || payload.helyek || 1)
  const payText = esc(payload.fizetesi_mod_text || payload.fizetesi_mod || '')
  const tripId = String(payload.fuvar_id || payload.trip_id || payload.id || '').trim()
  const bookingId = String(payload.foglalas_id || payload.booking_id || '').trim()
  const tripUrl = tripId ? buildUrl('/trip.html', { id: tripId, ...(bookingId ? { bookingId } : {}) }) : SITE_URL
  const driverBookingsUrl = tripId ? buildUrl('/trip.html', { id: tripId, ...(bookingId ? { bookingId } : {}) }, 'driverBookingsSection') : tripUrl
  const adminUrl = buildUrl('/admin.html', { ...(tripId ? { tripId } : {}), ...(bookingId ? { bookingId } : {}) })

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
        filters: [{ field: 'tag', key: 'email', relation: '=', value: String(payload.sofor_email || '') }],
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
        filters: [{ field: 'tag', key: 'email', relation: '=', value: String(payload.utas_email || payload.email || '') }],
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
        filters: [{ field: 'tag', key: 'email', relation: '=', value: String(payload.utas_email || payload.email || '') }],
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
        filters: [{ field: 'tag', key: 'email', relation: '=', value: String(payload.sofor_email || '') }],
        heading: 'Fuvar indul 2 órán belül',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || '')} · foglalások: ${String(payload.foglalas_db || 0)}`,
        url: driverBookingsUrl
      }]
      break

    case 'uj_fuvar':
    default:
      {
        const approvalToken = tripId ? await createApprovalToken(tripId).catch(() => '') : ''
        const oneClickApproveUrl = approvalToken && tripId ? buildApprovalFunctionUrl(tripId, approvalToken) : ''
        emails = [{
          to: adminEmail,
          subject: `Új fuvar vár jóváhagyásra: ${String(payload.indulas || '')} → ${String(payload.erkezes || payload.cel || '')}`,
          html: emailLayout(
            'Új fuvar vár jóváhagyásra',
            `Új fuvar érkezett a rendszerbe. ${oneClickApproveUrl ? 'Az első gombbal azonnal jóvá tudod hagyni admin oldal megnyitása nélkül.' : 'Az alábbi link közvetlenül az admin felületen a megfelelő fuvarhoz visz.'}${tripId ? ` Fuvar azonosító: <strong>${esc(tripId)}</strong>.` : ''}`,
            `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Dátum:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${esc(payload.nev || payload.sofor_nev || '')} (${esc(payload.email || payload.sofor_email || '')})</p><p><strong>Telefonszám:</strong> ${esc(payload.telefon || '')}</p>${tripId ? `<p><strong>Fuvar ID:</strong> ${esc(tripId)}</p>` : ''}`,
            [
              ...(oneClickApproveUrl ? [{ label: 'Azonnali jóváhagyás', href: oneClickApproveUrl, tone: 'success' as const, directLabel: 'Közvetlen egykattintásos jóváhagyó link' }] : []),
              { label: 'Jóváhagyás megnyitása', href: adminUrl, tone: 'dark' as const, directLabel: 'Közvetlen link a jóváhagyáshoz' }
            ]
          )
        }]
      }
      push = [{
        externalIds: [String(adminEmail || '')],
        filters: [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }],
        heading: 'Új fuvar vár jóváhagyásra',
        message: `${String(payload.indulas || '')} → ${String(payload.erkezes || payload.cel || '')}${tripId ? ` · ID: ${tripId}` : ''}`,
        url: adminUrl
      }]
      break
  }

  return { emails, sms, push }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url)
      const action = url.searchParams.get('action') || ''
      if (action !== 'approve_trip') {
        return new Response(approvalResultHtml({ ok: false, title: 'Ismeretlen művelet', message: 'A megnyitott link nem támogatott FuvarVelünk művelet.' }), {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      const tripId = (url.searchParams.get('tripId') || '').trim()
      const token = (url.searchParams.get('token') || '').trim()
      const verified = await verifyApprovalToken(token, tripId)
      if (!verified.ok) {
        return new Response(approvalResultHtml({ ok: false, title: 'A jóváhagyó link nem érvényes', message: 'Ez a link hibás, lejárt vagy már nem használható. Nyisd meg az admin felületet, és onnan hagyd jóvá a fuvart.', tripId }), {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      const admin = createAdminClient()
      if (!admin || !tripId) {
        return new Response(approvalResultHtml({ ok: false, title: 'Hiányzó szerver beállítás', message: 'A jóváhagyás most nem végezhető el, mert hiányzik a szerveroldali konfiguráció.', tripId }), {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      const { data: trip, error: fetchError } = await admin.from('fuvarok').select('*').eq('id', tripId).maybeSingle()
      if (fetchError || !trip) {
        return new Response(approvalResultHtml({ ok: false, title: 'A fuvar nem található', message: 'A jóváhagyandó fuvar nem található az adatbázisban.', tripId }), {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      if (String(trip.statusz || '').trim() === 'Jóváhagyva') {
        return new Response(approvalResultHtml({ ok: true, title: 'A fuvar már jóváhagyva', message: 'Ez a fuvar már korábban jóvá lett hagyva. Megnyithatod az admin felületet is.', tripId }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      const { error: updateError } = await admin.from('fuvarok').update({ statusz: 'Jóváhagyva' }).eq('id', tripId)
      if (updateError) {
        return new Response(approvalResultHtml({ ok: false, title: 'A jóváhagyás nem sikerült', message: 'A szerver nem tudta jóváhagyni ezt a fuvart. Nyisd meg az admin felületet, és próbáld meg ott.', tripId }), {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
        })
      }

      await writeLog('egy_kattintasos_jovahagyas', { trip_id: tripId, statusz: 'Jóváhagyva', email: trip.email || trip.sofor_email || '' }, `Fuvar egykattintásos jóváhagyás: ${tripId}`, [{ channel: 'email', ok: true }])

      return new Response(approvalResultHtml({ ok: true, title: 'A fuvar sikeresen jóváhagyva', message: 'A hirdetés most már jóvá lett hagyva, nem kellett hozzá megnyitni az admin oldalt.', tripId }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
      })
    } catch (error) {
      return new Response(approvalResultHtml({ ok: false, title: 'Sikertelen jóváhagyás', message: `Hiba történt: ${esc(String(error))}` }), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
      })
    }
  }

  try {
    const body = await req.json()
    const kind = body.kind || body.tipus || ''
    const payload = body.payload || body || {}
    const adminEmail = body.adminEmail || FALLBACK_ADMIN_EMAIL

    const notification = await buildNotification(kind, payload, adminEmail)
    const results: unknown[] = []

    for (const item of notification.emails || []) {
      results.push(await sendMail(item.to, item.subject, item.html))
    }

    for (const item of notification.sms || []) {
      results.push(await sendSms(item.to, item.body))
    }

    for (const item of notification.push || []) {
      const first = await sendPush({ externalIds: item.externalIds }, item.heading, item.message, item.url)
      results.push(first)
      if ((!first.ok || first.skipped) && item.filters?.length) {
        results.push(await sendPush({ filters: item.filters }, item.heading, item.message, item.url))
      }
    }

    const emailFailures = results.filter((x: any) => x.channel === 'email' && !x.ok && !x.skipped)
    const mainSubject = (notification.emails && notification.emails[0]?.subject) || kind

    await writeLog(kind, payload, mainSubject, results)

    return new Response(JSON.stringify({
      ok: emailFailures.length === 0,
      subject: mainSubject,
      results,
      sms_enabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
      push_enabled: !!(ONESIGNAL_APP_ID && ONESIGNAL_API_KEY),
    }), {
      headers: { 'Content-Type': 'application/json', ...cors }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    })
  }
})
