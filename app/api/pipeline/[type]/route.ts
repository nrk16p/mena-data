import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import fs from "fs"
import path from "path"

const PIPELINE_MAP: Record<string, string> = {
  ld: "asia",
  cpac: "cpac",
  scco: "scco",
}

const ALLOWED_TYPES = Object.keys(PIPELINE_MAP)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

  const pipeline = PIPELINE_MAP[type]

  // Try MongoDB first
  try {
    const client = await clientPromise
    const db = client.db("atms")
    const runs = await db
      .collection("ldt_runs")
      .find({ pipeline })
      .sort({ run_date: -1 })
      .limit(30)
      .project({ ldt_rows: 0, new_ship_to_rows: 0 })
      .toArray()

    if (runs.length > 0) {
      return NextResponse.json(
        runs.map((r) => ({
          id: r._id.toString(),
          name: r.filename as string,
          run_date: r.run_date as string,
          ldt_count: r.ldt_count as number,
          new_ship_to_count: (r.new_ship_to_count as number) ?? 0,
          created_at: (r.created_at as Date).toISOString(),
          source: "mongodb",
        }))
      )
    }
  } catch {
    // fall through to filesystem
  }

  // Filesystem fallback (local dev before first pipeline run)
  const outputDir = path.join(process.cwd(), "scripts", type, "output")
  if (!fs.existsSync(outputDir)) {
    return NextResponse.json([])
  }

  try {
    const files = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith(".xlsx") || f.endsWith(".xls"))
      .map((name) => {
        const stat = fs.statSync(path.join(outputDir, name))
        return {
          id: name,
          name,
          run_date: null,
          ldt_count: null,
          new_ship_to_count: null,
          created_at: stat.mtime.toISOString(),
          source: "filesystem",
        }
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(files)
  } catch {
    return NextResponse.json({ error: "Failed to read output directory" }, { status: 500 })
  }
}
