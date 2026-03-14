import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function buildTripTimestamp(datum?: string | null, ido?: string | null) {
  if (!datum) return null
  const safeTime = (ido && /^\d{2}:\d{2}/.test(ido)) ? ido.slice(0, 5) : '00:00'
  const iso = `${datum}T${safeTime}:00`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

  try {
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const sentSecret = req.headers.get('x-cron-secret') || ''

    if (cronSecret && sentSecret !== cronSecret) {
      return json({ ok: false, message: 'Unauthorized cron request' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500)
    }

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch (_) {
      body = {}
    }

    const graceDays = Number(body.graceDays ?? 3)
    const dryRun = Boolean(body.dryRun ?? false)
    const now = new Date()
    const threshold = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: trips, error: tripsError } = await admin
      .from('fuvarok')
      .select('id, datum, ido, indulas, erkezes, statusz')

    if (tripsError) throw tripsError

    const expiredTrips = (trips || []).filter((trip: any) => {
      const when = buildTripTimestamp(trip?.datum, trip?.ido)
      return when && when < threshold
    })

    const expiredIds = expiredTrips.map((trip: any) => trip.id).filter(Boolean)

    const result: Record<string, unknown> = {
      ok: true,
      now: now.toISOString(),
      graceDays,
      threshold: threshold.toISOString(),
      expired_trip_count: expiredIds.length,
      expired_trip_ids: expiredIds,
      dryRun,
    }

    if (!expiredIds.length || dryRun) {
      return json(result)
    }

    const { error: ratingsError, count: ratingsDeleted } = await admin
      .from('ertekelesek')
      .delete({ count: 'exact' })
      .in('fuvar_id', expiredIds)
    if (ratingsError) throw ratingsError

    const { error: bookingsError, count: bookingsDeleted } = await admin
      .from('foglalasok')
      .delete({ count: 'exact' })
      .in('fuvar_id', expiredIds)
    if (bookingsError) throw bookingsError

    const { error: tripsDeleteError, count: tripsDeleted } = await admin
      .from('fuvarok')
      .delete({ count: 'exact' })
      .in('id', expiredIds)
    if (tripsDeleteError) throw tripsDeleteError

    result.deleted = {
      ertekelesek: ratingsDeleted || 0,
      foglalasok: bookingsDeleted || 0,
      fuvarok: tripsDeleted || 0,
    }

    return json(result)
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500)
  }
})
