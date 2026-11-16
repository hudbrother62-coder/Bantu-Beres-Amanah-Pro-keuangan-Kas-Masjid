// Lightweight Vercel probe, independent of the restricted Supabase database.
// An unknown billing date must NOT be reported as a guaranteed restoration time.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({status:'unknown'}) }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60')
  const rawDate = process.env.SUPABASE_QUOTA_RENEW_AT
  const date = rawDate ? new Date(rawDate) : null
  const quotaRenewAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) return res.status(200).json({status:'unknown', quotaRenewAt})
  try {
    const endpoint = url.replace(/\/$/, '') + '/rest/v1/__amanah_status_probe_not_a_table?select=id&limit=0'
    const response = await fetch(endpoint, {
      headers:{apikey:key, Accept:'application/json'}, signal:AbortSignal.timeout(8000)
    })
    const body = (await response.text()).slice(0,1000)
    // Restricted projects return HTTP 402. A missing sentinel table returns PGRST205 (404) if reachable.
    const restricted = response.status === 402
    const available = response.status === 404 && /PGRST205|Could not find the table/i.test(body)
    return res.status(200).json({status:restricted?'restricted':available?'available':'unknown', quotaRenewAt})
  } catch {
    return res.status(200).json({status:'unknown', quotaRenewAt})
  }
}
