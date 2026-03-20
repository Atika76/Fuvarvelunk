import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@fuvarvelunk.hu";
const RESEND_FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "FuvarVelünk.hu";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "cegweb26@gmail.com";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "";
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://fuvarvelunk.hu";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  if (raw.startsWith("00")) return "+" + raw.slice(2).replace(/\D/g, "");
  if (raw.startsWith("06")) return "+36" + raw.slice(2).replace(/\D/g, "");
  return raw.replace(/\D/g, "");
}

function normExternalId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function emailLayout(title: string, bodyHtml: string, buttonText: string, buttonUrl: string) {
  return `
  <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e5e7eb;">
      <div style="font-size:28px;font-weight:700;color:#111827;margin-bottom:8px;">FuvarVelünk.hu</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:24px;">Fuvar értesítés</div>
      <h2 style="margin:0 0 16px 0;color:#111827;">${title}</h2>
      <div style="font-size:15px;line-height:1.7;color:#374151;">${bodyHtml}</div>
      <div style="margin-top:24px;">
        <a href="${buttonUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${buttonText}</a>
      </div>
      <div style="margin-top:20px;font-size:13px;color:#6b7280;">
        Ha a gomb nem működik, ezt nyisd meg:<br>
        <a href="${buttonUrl}" style="color:#2563eb;">${buttonUrl}</a>
      </div>
    </div>
  </div>`;
}

async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) {
    return { ok: false, skipped: true, reason: "missing_mail_config_or_recipient", channel: "email" };
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });

  const data = await resp.text();
  return { ok: resp.ok, skipped: false, channel: "email", to, subject, status: resp.status, data };
}

async function sendSms(to: string, body: string) {
  const phone = normPhone(to);
  if (!phone) return { ok: false, skipped: true, reason: "missing_phone", channel: "sms" };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, skipped: true, reason: "missing_twilio_config", to: phone, channel: "sms" };
  }

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: TWILIO_FROM_NUMBER, To: phone, Body: body }).toString(),
  });

  const data = await resp.text();
  return { ok: resp.ok, skipped: false, channel: "sms", to: phone, body, data };
}

async function sendPush(externalIds: string[], heading: string, message: string, url?: string) {
  const ids = [...new Set((externalIds || []).map(normExternalId).filter(Boolean))];
  if (!ids.length) return { ok: false, skipped: true, reason: "missing_external_ids", channel: "push" };
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    return { ok: false, skipped: true, reason: "missing_onesignal_config", ids, channel: "push" };
  }

  const resp = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      Authorization: `Key ${ONESIGNAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: ids },
      headings: { en: heading, hu: heading },
      contents: { en: message, hu: message },
      url: url || SITE_URL,
      web_url: url || SITE_URL,
    }),
  });

  const data = await resp.text();
  return { ok: resp.ok, skipped: false, channel: "push", ids, heading, message, status: resp.status, data };
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function writeLog(kind: string, payload: Record<string, unknown>, subject: string, results: any[]) {
  try {
    const admin = createAdminClient();
    if (!admin) return;

    const recipient = String(payload.utas_email || payload.email || payload.sofor_email || payload.driver_email || "");
    const emailResult = results.find((x) => x?.channel === "email");
    const pushResult = results.find((x) => x?.channel === "push");

    await admin.from("email_naplo").insert([{
      tipus: kind || "ismeretlen",
      cel_email: recipient,
      statusz: emailResult?.ok ? "elkuldve" : (emailResult?.skipped ? "kihagyva" : "sikertelen"),
      sikeres: !!emailResult?.ok,
      targy: subject || kind || "ertesites",
      payload: {
        ...(payload || {}),
        email_result: emailResult || null,
        push_ok: !!pushResult?.ok,
        push_result: pushResult || null,
      },
    }]);
  } catch (err) {
    console.warn("email_naplo log hiba:", err);
  }
}

type EmailItem = { to: string; subject: string; html: string };
type SmsItem = { to: string; body: string };
type PushItem = { externalIds: string[]; heading: string; message: string; url?: string };

function buildNotification(kind: string, payload: Record<string, unknown>, adminEmail: string) {
  const route = `${esc(payload.indulas)} → ${esc(payload.erkezes || payload.cel || "")}`;
  const dateTime = `${esc(payload.datum)} ${esc(payload.ido)}`.trim();
  const passengerName = esc(payload.utas_nev || payload.nev || "Utas");
  const driverName = esc(payload.sofor_nev || payload.driver_name || payload.nev || "Sofőr");
  const seats = esc(payload.foglalt_helyek || payload.helyek || 1);
  const payText = esc(payload.fizetesi_mod_text || payload.fizetesi_mod || "");
  const tripId = String(payload.fuvar_id || payload.trip_id || "").trim();
  const tripUrl = tripId ? `${SITE_URL}/trip.html?id=${encodeURIComponent(tripId)}` : SITE_URL;
  const adminUrl = `${SITE_URL}/admin.html`;

  let emails: EmailItem[] = [];
  let sms: SmsItem[] = [];
  let push: PushItem[] = [];
  let frontendMessage = "Az értesítés feldolgozva.";

  switch (kind) {
    case "uj_foglalas":
      emails = [{
        to: String(payload.sofor_email || adminEmail),
        subject: `Új foglalás érkezett – ${route}`,
        html: emailLayout(
          "Új foglalás érkezett",
          `<p><strong>Foglaló:</strong> ${passengerName}</p><p><strong>Utas e-mail:</strong> ${esc(payload.utas_email || payload.email || "")}</p><p><strong>Telefon:</strong> ${esc(payload.telefon || payload.utas_telefon || "")}</p><p><strong>Foglalt helyek:</strong> ${seats}</p><p><strong>Fizetési mód:</strong> ${payText}</p><p><strong>Fuvar:</strong> ${route}</p><p><strong>Indulás:</strong> ${dateTime}</p><p><strong>Oldal:</strong> FuvarVelünk.hu</p>`,
          "Foglalás megnyitása",
          tripUrl,
        ),
      }];
      push = [{
        externalIds: [String(payload.sofor_email || "")],
        heading: "Új foglalás érkezett",
        message: `${String(payload.indulas || "")} → ${String(payload.erkezes || "")} · ${String(payload.utas_nev || payload.nev || "Utas")}`,
        url: tripUrl,
      }];
      sms = [{
        to: String(payload.sofor_telefon || ""),
        body: `FuvarVelünk: új foglalás érkezett a ${String(payload.indulas || "")} → ${String(payload.erkezes || "")} fuvarodra. Utas: ${String(payload.utas_nev || payload.nev || "")}, helyek: ${String(payload.foglalt_helyek || 1)}.`,
      }];
      frontendMessage = "Foglalás elküldve. Az értesítés e-mailben is elindult.";
      break;

    case "utas_visszaigazolas":
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás visszaigazolás – ${route}`,
          html: emailLayout(
            "Foglalás visszaigazolás",
            `<p>Kedves ${passengerName}!</p><p>A foglalásod rögzítve lett a következő útra:</p><p><strong>${route}</strong></p><p><strong>Indulás:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${driverName}</p><p><strong>Fizetési mód:</strong> ${payText}</p><p><strong>Foglalt helyek:</strong> ${seats}</p><p><strong>Oldal:</strong> FuvarVelünk.hu</p>`,
            "Fuvar megnyitása",
            tripUrl,
          ),
        }];
      }
      frontendMessage = "Az utas visszaigazoló e-mailje is elindult.";
      break;

    case "foglalas_jovahagyva":
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Foglalás jóváhagyva – ${route}`,
          html: emailLayout(
            "Foglalás jóváhagyva",
            `<p>Kedves ${passengerName}!</p><p>A sofőr jóváhagyta a foglalásodat.</p><p><strong>${route}</strong></p><p><strong>Indulás:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${driverName}</p><p><strong>Kapcsolat:</strong> ${esc(payload.sofor_email || "")}${payload.sofor_telefon ? " · " + esc(payload.sofor_telefon) : ""}</p>`,
            "Fuvar megnyitása",
            tripUrl,
          ),
        }];
      }
      push = [{
        externalIds: [String(payload.utas_email || payload.email || "")],
        heading: "Foglalás jóváhagyva",
        message: `${String(payload.indulas || "")} → ${String(payload.erkezes || "")} · ${String(payload.datum || "")} ${String(payload.ido || "")}`,
        url: tripUrl,
      }];
      frontendMessage = "A jóváhagyási értesítés elindult.";
      break;

    case "fizetve_jelolve":
      if (payload.utas_email || payload.email) {
        emails = [{
          to: String(payload.utas_email || payload.email),
          subject: `Fizetés visszaigazolva – ${route}`,
          html: emailLayout(
            "Fizetés visszaigazolva",
            `<p>Kedves ${passengerName}!</p><p>A sofőr fizetettnek jelölte a foglalásodat.</p><p><strong>${route}</strong></p><p><strong>Indulás:</strong> ${dateTime}</p><p>Kérjük, jelenj meg indulás előtt legalább 10 perccel.</p>`,
            "Fuvar megnyitása",
            tripUrl,
          ),
        }];
      }
      push = [{
        externalIds: [String(payload.utas_email || payload.email || "")],
        heading: "Fizetés visszaigazolva",
        message: `${String(payload.indulas || "")} → ${String(payload.erkezes || "")} · indulás előtt 10 perccel érkezz`,
        url: tripUrl,
      }];
      frontendMessage = "A fizetési visszaigazolás elindult.";
      break;

    case "sofor_indulas_emlekezteto":
      emails = [{
        to: String(payload.sofor_email || adminEmail),
        subject: `Fuvar indul 2 órán belül – ${route}`,
        html: emailLayout(
          "Indulási emlékeztető",
          `<p>Kedves ${driverName}!</p><p>A fuvarod 2 órán belül indul.</p><p><strong>${route}</strong></p><p><strong>Indulás:</strong> ${dateTime}</p><p><strong>Foglalások száma:</strong> ${esc(payload.foglalas_db || 0)}</p>`,
          "Fuvar megnyitása",
          tripUrl,
        ),
      }];
      push = [{
        externalIds: [String(payload.sofor_email || "")],
        heading: "Fuvar indul 2 órán belül",
        message: `${String(payload.indulas || "")} → ${String(payload.erkezes || "")} · foglalások: ${String(payload.foglalas_db || 0)}`,
        url: tripUrl,
      }];
      frontendMessage = "Az indulási emlékeztető elindult.";
      break;

    case "uj_fuvar":
    default:
      emails = [{
        to: adminEmail,
        subject: `Új fuvar jóváhagyásra vár – ${route}`,
        html: emailLayout(
          "Új fuvar jóváhagyásra vár",
          `<p><strong>Fuvar:</strong> ${route}</p><p><strong>Indulás:</strong> ${dateTime}</p><p><strong>Sofőr:</strong> ${esc(payload.nev || payload.sofor_nev || "")}</p><p><strong>E-mail:</strong> ${esc(payload.email || payload.sofor_email || "")}</p><p><strong>Telefon:</strong> ${esc(payload.telefon || "")}</p><p><strong>Oldal:</strong> FuvarVelünk.hu</p><p>Kattints a gombra a jóváhagyás megnyitásához.</p>`,
          "Jóváhagyás megnyitása",
          adminUrl,
        ),
      }];
      push = [{
        externalIds: [adminEmail],
        heading: "Új fuvar jóváhagyásra vár",
        message: `${String(payload.indulas || "")} → ${String(payload.erkezes || payload.cel || "")} · ${String(payload.datum || "")} ${String(payload.ido || "")}`,
        url: adminUrl,
      }];
      frontendMessage = "Fuvar sikeresen elküldve. Az admin e-mail értesítés elindult.";
      break;
  }

  return { emails, sms, push, frontendMessage };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      message: "notify-admin működik",
      resend_configured: !!RESEND_API_KEY,
      from_email: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
      admin_email: ADMIN_EMAIL,
      push_enabled: !!(ONESIGNAL_APP_ID && ONESIGNAL_API_KEY),
      sms_enabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
    }), { headers: { "Content-Type": "application/json", ...cors } });
  }

  try {
    const body = await req.json();
    const kind = body.kind || body.tipus || "uj_fuvar";
    const payload = body.payload || body || {};
    const adminEmail = body.adminEmail || ADMIN_EMAIL;

    const notification = buildNotification(kind, payload, adminEmail);
    const results: any[] = [];

    for (const item of notification.emails || []) results.push(await sendMail(item.to, item.subject, item.html));
    for (const item of notification.sms || []) results.push(await sendSms(item.to, item.body));
    for (const item of notification.push || []) results.push(await sendPush(item.externalIds, item.heading, item.message, item.url));

    const emailResult = results.find((x) => x?.channel === "email") || null;
    const pushResult = results.find((x) => x?.channel === "push") || null;
    const emailFailures = results.filter((x) => x?.channel === "email" && !x.ok && !x.skipped);
    const mainSubject = (notification.emails && notification.emails[0]?.subject) || kind;

    await writeLog(kind, payload, mainSubject, results);

    return new Response(JSON.stringify({
      ok: emailFailures.length === 0,
      subject: mainSubject,
      result: emailResult,
      push: pushResult,
      results,
      frontendMessage: notification.frontendMessage,
      sms_enabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
      push_enabled: !!(ONESIGNAL_APP_ID && ONESIGNAL_API_KEY),
    }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
