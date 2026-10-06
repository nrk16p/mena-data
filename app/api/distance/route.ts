import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// slope-api sends no CORS headers, so the browser calls it through this route.
// One direction per request: the page queues ขาไป then ขากลับ, so each call gets
// its own time budget and the free upstream services see one request at a time.
const SLOPE_API_URL = process.env.SLOPE_API_URL || "https://slope-api.vercel.app/api/slope"
const TIMEOUT_MS = 55_000

export const maxDuration = 60

type Point = { lat: number; lng: number }

type SlopeResult = {
  flat_km: number
  uphill_km: number
  steep_uphill_km: number
  total_distance_km: number
  elevation_source: string | null
}

type CacheDoc = SlopeResult & {
  _id: string
  origin: Point
  destination: Point
  calculated_at: Date
}

function parsePoint(val: unknown): Point | null {
  if (!val || typeof val !== "object") return null
  const lat = Number((val as Record<string, unknown>).lat)
  const lng = Number((val as Record<string, unknown>).lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

function cacheKey(o: Point, d: Point): string {
  return `${o.lat.toFixed(6)},${o.lng.toFixed(6)}>${d.lat.toFixed(6)},${d.lng.toFixed(6)}`
}

async function cacheCollection() {
  const client = await clientPromise
  return client.db("atms").collection<CacheDoc>("distance_cache")
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const from = parsePoint(body.from)
  const to = parsePoint(body.to)
  if (!from || !to) {
    return NextResponse.json({ error: "Invalid from/to coordinates" }, { status: 400 })
  }
  const key = cacheKey(from, to)

  // A cache problem must never block a calculation, so both reads and writes are best-effort.
  if (!body.refresh) {
    try {
      const hit = await (await cacheCollection()).findOne({ _id: key })
      if (hit) {
        const { flat_km, uphill_km, steep_uphill_km, total_distance_km, elevation_source } = hit
        return NextResponse.json({
          ok: true,
          data: { flat_km, uphill_km, steep_uphill_km, total_distance_km, elevation_source },
          cachedAt: hit.calculated_at,
        })
      }
    } catch (err) {
      console.error("distance_cache read failed", err)
    }
  }

  let res: Response
  try {
    res = await fetch(SLOPE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: [from.lat, from.lng], destination: [to.lat, to.lng] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError"
    return NextResponse.json(
      timedOut
        ? { ok: false, busy: true, retryAfter: 15, error: "Slope API timed out" }
        : { ok: false, error: "Could not reach Slope API" }
    )
  }

  const json = await res.json().catch(() => null)
  if (!res.ok || !json || typeof json.total_distance_km !== "number") {
    if (res.status === 503 || res.status === 429) {
      const retryAfter = Number(json?.retry_after ?? res.headers.get("Retry-After")) || 15
      return NextResponse.json({
        ok: false,
        busy: true,
        retryAfter,
        error: json?.error || "Map services are busy",
      })
    }
    return NextResponse.json({ ok: false, error: json?.error || `Slope API error (${res.status})` })
  }

  const data: SlopeResult = {
    flat_km: Number(json.flat_km) || 0,
    uphill_km: Number(json.uphill_km) || 0,
    steep_uphill_km: Number(json.steep_uphill_km) || 0,
    total_distance_km: json.total_distance_km,
    elevation_source: typeof json.elevation_source === "string" ? json.elevation_source : null,
  }

  try {
    await (await cacheCollection()).replaceOne(
      { _id: key },
      { origin: from, destination: to, ...data, calculated_at: new Date() },
      { upsert: true }
    )
  } catch (err) {
    console.error("distance_cache write failed", err)
  }

  return NextResponse.json({ ok: true, data, cachedAt: null })
}
