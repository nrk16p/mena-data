import { NextRequest, NextResponse } from "next/server"

// slope-api sends no CORS headers, so the browser calls it through this route.
const SLOPE_API_URL = "https://slope-api.vercel.app/api/slope"
const TIMEOUT_MS = 25_000

export const maxDuration = 60

type Point = { lat: number; lng: number }

type SlopeResult = {
  flat_km: number
  uphill_km: number
  steep_uphill_km: number
  total_distance_km: number
}

type LegResult = { ok: true; data: SlopeResult } | { ok: false; error: string }

function parsePoint(val: unknown): Point | null {
  if (!val || typeof val !== "object") return null
  const lat = Number((val as Record<string, unknown>).lat)
  const lng = Number((val as Record<string, unknown>).lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

async function fetchLeg(origin: Point, destination: Point): Promise<LegResult> {
  try {
    const res = await fetch(SLOPE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: [origin.lat, origin.lng],
        destination: [destination.lat, destination.lng],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || typeof json.total_distance_km !== "number") {
      // slope-api reports open-elevation failures (usually HTTP 429) as a bare KeyError
      if (json?.error === "'results'") {
        return { ok: false, error: "Elevation service is busy (rate limit) — wait a minute and retry" }
      }
      return { ok: false, error: json?.error || `Slope API error (${res.status})` }
    }
    return {
      ok: true,
      data: {
        flat_km: Number(json.flat_km) || 0,
        uphill_km: Number(json.uphill_km) || 0,
        steep_uphill_km: Number(json.steep_uphill_km) || 0,
        total_distance_km: json.total_distance_km,
      },
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError"
    return { ok: false, error: timedOut ? "Slope API timed out" : "Could not reach Slope API" }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const from = parsePoint(body.from)
  const to = parsePoint(body.to)
  if (!from || !to) {
    return NextResponse.json({ error: "Invalid from/to coordinates" }, { status: 400 })
  }

  // "go" | "back" recalculates a single direction (retry); default is both.
  const only = body.only === "go" || body.only === "back" ? body.only : null

  // Sequential and spaced on purpose: the free OSRM / open-elevation servers
  // behind slope-api rate-limit aggressively (~1 req/s).
  const go = only === "back" ? null : await fetchLeg(from, to)
  if (!only) await new Promise((r) => setTimeout(r, 1000))
  const back = only === "go" ? null : await fetchLeg(to, from)

  return NextResponse.json({ go, back })
}
