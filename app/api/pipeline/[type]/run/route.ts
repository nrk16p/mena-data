import { NextRequest, NextResponse } from "next/server"

const ALLOWED = ["ld", "scco", "cpac"]

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

  const ncacUrl = process.env.NCAC_API_URL
  const apiKey = process.env.PIPELINE_API_KEY

  if (!ncacUrl || !apiKey) {
    return NextResponse.json({ error: "Pipeline runner not configured" }, { status: 503 })
  }

  try {
    const res = await fetch(`${ncacUrl}/pipeline/run/${type}`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach pipeline runner" },
      { status: 502 }
    )
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

  const ncacUrl = process.env.NCAC_API_URL
  const apiKey = process.env.PIPELINE_API_KEY

  if (!ncacUrl || !apiKey) {
    return NextResponse.json({ running: false, last_run: null }, { status: 200 })
  }

  try {
    const res = await fetch(`${ncacUrl}/pipeline/status/${type}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ running: false, last_run: null })
  }
}
