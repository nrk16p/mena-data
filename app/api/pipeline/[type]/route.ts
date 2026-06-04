import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const ALLOWED_TYPES = ["ld", "cpac", "scco"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

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
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        }
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())

    return NextResponse.json(files)
  } catch {
    return NextResponse.json({ error: "Failed to read output directory" }, { status: 500 })
  }
}
