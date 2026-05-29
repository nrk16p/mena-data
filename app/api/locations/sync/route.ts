import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import https from "node:https"
import clientPromise from "@/lib/mongodb"

const EXPORT_URL =
  "https://www.mena-atms.com/tms/location/index.export/?page=1&order_by=l.name%20asc&search-toggle-status=&order_by=l.name%20asc"

const agent = new https.Agent({ rejectUnauthorized: false })

function fetchAtms(phpsessid: string): Promise<{ contentType: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(EXPORT_URL)

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      agent,
      timeout: 30000,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
        Connection: "keep-alive",
        Cookie: `PHPSESSID=${phpsessid}`,
        Referer: "https://www.mena-atms.com/tms/location/index/?order_by=l.name%20asc",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      },
    }

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () =>
        resolve({
          contentType: (res.headers["content-type"] as string) || "",
          buffer: Buffer.concat(chunks),
        })
      )
      res.on("error", reject)
    })

    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Request timed out"))
    })

    req.on("error", reject)
    req.end()
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const phpsessid: string = body.phpsessid || process.env.ATMS_SESSION || ""

  if (!phpsessid) {
    return NextResponse.json({ error: "PHPSESSID is required" }, { status: 400 })
  }

  let result: { contentType: string; buffer: Buffer }
  try {
    result = await fetchAtms(phpsessid)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to reach ATMS server: ${msg}` }, { status: 502 })
  }

  const { contentType, buffer } = result

  if (!contentType.includes("excel") && !contentType.includes("spreadsheet")) {
    return NextResponse.json(
      { error: "Session expired — paste a new PHPSESSID and try again" },
      { status: 401 }
    )
  }

  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data in file" }, { status: 422 })
  }

  const syncedAt = new Date()
  const docs = rows.map((row) => ({ ...row, synced_at: syncedAt }))

  const client = await clientPromise
  const db = client.db("atms")
  const collection = db.collection("location_master")

  await collection.deleteMany({})
  await collection.insertMany(docs)

  return NextResponse.json({ count: docs.length, synced_at: syncedAt })
}
