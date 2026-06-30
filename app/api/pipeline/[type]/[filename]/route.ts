import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"

const PIPELINE_MAP: Record<string, string> = {
  ld: "asia",
  cpac: "cpac",
  scco: "scco",
}

const ALLOWED_TYPES = Object.keys(PIPELINE_MAP)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  const { type, filename: idOrName } = await params
  const action = req.nextUrl.searchParams.get("action")

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid pipeline type" }, { status: 400 })
  }

  // Try MongoDB by ObjectId
  if (ObjectId.isValid(idOrName)) {
    try {
      const client = await clientPromise
      const db = client.db("atms")
      const run = await db.collection("ldt_runs").findOne({ _id: new ObjectId(idOrName) })

      if (run) {
        const rows = (run.ldt_rows as Record<string, unknown>[]) ?? []
        const filename = (run.filename as string) ?? `${run.pipeline}_${run.run_date}.xlsx`

        if (action === "download") {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, "LDT")

          if (run.new_ship_to_rows && Array.isArray(run.new_ship_to_rows) && run.new_ship_to_rows.length > 0) {
            const ws2 = XLSX.utils.json_to_sheet(run.new_ship_to_rows as Record<string, unknown>[])
            XLSX.utils.book_append_sheet(wb, ws2, "New Ship To")
          }

          const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
          return new NextResponse(buffer, {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            },
          })
        }

        // Preview — return both ldt and shipto tabs
        const shipToRows = (run.new_ship_to_rows as Record<string, unknown>[]) ?? []
        const ldtPreview = rows.slice(0, 200)
        const stPreview = shipToRows.slice(0, 200)
        return NextResponse.json({
          ldt: {
            headers: ldtPreview.length > 0 ? Object.keys(ldtPreview[0]) : [],
            rows: ldtPreview,
            total: rows.length,
          },
          shipto: {
            headers: stPreview.length > 0 ? Object.keys(stPreview[0]) : [],
            rows: stPreview,
            total: shipToRows.length,
          },
        })
      }
    } catch {
      // fall through to filesystem
    }
  }

  // Filesystem fallback
  const safeName = path.basename(idOrName)
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

  try {
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheet0 = workbook.Sheets[workbook.SheetNames[0]]
    const ldtRows = XLSX.utils.sheet_to_json(sheet0, { defval: "" }) as Record<string, unknown>[]
    const ldtPreview = ldtRows.slice(0, 200)

    let stPreview: Record<string, unknown>[] = []
    if (workbook.SheetNames[1]) {
      const sheet1 = workbook.Sheets[workbook.SheetNames[1]]
      stPreview = (XLSX.utils.sheet_to_json(sheet1, { defval: "" }) as Record<string, unknown>[]).slice(0, 200)
    }

    return NextResponse.json({
      ldt: {
        headers: ldtPreview.length > 0 ? Object.keys(ldtPreview[0]) : [],
        rows: ldtPreview,
        total: ldtRows.length,
      },
      shipto: {
        headers: stPreview.length > 0 ? Object.keys(stPreview[0]) : [],
        rows: stPreview,
        total: stPreview.length,
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 })
  }
}
