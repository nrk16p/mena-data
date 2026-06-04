import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import * as XLSX from "xlsx"

const ALLOWED_TYPES = ["ld", "cpac", "scco"]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  const { type, filename } = await params
  const action = req.nextUrl.searchParams.get("action")

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

  // Prevent path traversal
  const safeName = path.basename(filename)
  const filePath = path.join(process.cwd(), "scripts", type, "output", safeName)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  if (action === "download") {
    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
      },
    })
  }

  // Preview — return first 200 rows as JSON
  try {
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: unknown[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })
    const preview = rows.slice(0, 200)
    const headers = preview.length > 0 ? Object.keys(preview[0] as object) : []
    return NextResponse.json({ headers, rows: preview, total: rows.length })
  } catch {
    return NextResponse.json({ error: "Failed to parse Excel file" }, { status: 500 })
  }
}
