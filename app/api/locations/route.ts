import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET() {
  try {
    const client = await clientPromise
    const db = client.db("atms")
    const docs = await db
      .collection("location_master")
      .find({}, { projection: { _id: 0 } })
      .toArray()

    return NextResponse.json({ data: docs, count: docs.length })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}
