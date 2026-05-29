import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const threshold: number = Math.max(1, Math.min(Number(body.threshold) || 200, 10000))

  const client = await clientPromise
  const db = client.db("atms")

  // Only load locations that have real coordinates
  const docs = await db
    .collection("location_master")
    .find(
      { lat: { $ne: 0 }, lng: { $ne: 0 } },
      { projection: { _id: 0, รหัส: 1, ชื่อ: 1, จังหวัด: 1, อำเภอ: 1, lat: 1, lng: 1 } }
    )
    .toArray()

  const n = docs.length

  // Grid cell size slightly larger than threshold for neighbour search
  const cellDeg = (threshold / 111000) * 1.5

  const grid = new Map<string, number[]>()
  docs.forEach((doc, i) => {
    const cx = Math.floor((doc.lat as number) / cellDeg)
    const cy = Math.floor((doc.lng as number) / cellDeg)
    const key = `${cx},${cy}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(i)
  })

  // Union-Find with path compression + rank
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = new Array<number>(n).fill(0)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  function union(x: number, y: number) {
    const rx = find(x)
    const ry = find(y)
    if (rx === ry) return
    if (rank[rx] < rank[ry]) parent[rx] = ry
    else if (rank[rx] > rank[ry]) parent[ry] = rx
    else { parent[ry] = rx; rank[rx]++ }
  }

  // Compare each doc against neighbours in adjacent grid cells only
  docs.forEach((doc, i) => {
    const cx = Math.floor((doc.lat as number) / cellDeg)
    const cy = Math.floor((doc.lng as number) / cellDeg)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbours = grid.get(`${cx + dx},${cy + dy}`)
        if (!neighbours) continue
        for (const j of neighbours) {
          if (j <= i) continue
          const d = haversine(
            doc.lat as number, doc.lng as number,
            docs[j].lat as number, docs[j].lng as number
          )
          if (d <= threshold) union(i, j)
        }
      }
    }
  })

  // Collect groups
  const groupMap = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groupMap.has(root)) groupMap.set(root, [])
    groupMap.get(root)!.push(i)
  }

  // Build output — only groups with 2+ members
  type LocResult = {
    รหัส: unknown; ชื่อ: unknown; จังหวัด: unknown; อำเภอ: unknown
    lat: number; lng: number; minDist: number
  }
  type Group = { locations: LocResult[]; maxDist: number; count: number }

  const groups: Group[] = []

  for (const indices of groupMap.values()) {
    if (indices.length < 2) continue

    // Compute min distance from each member to its closest peer in the group
    const minDists = indices.map((i) => {
      let min = Infinity
      for (const j of indices) {
        if (j === i) continue
        const d = haversine(
          docs[i].lat as number, docs[i].lng as number,
          docs[j].lat as number, docs[j].lng as number
        )
        if (d < min) min = d
      }
      return min
    })

    const maxDist = Math.max(...minDists)

    groups.push({
      count: indices.length,
      maxDist: Math.round(maxDist),
      locations: indices.map((i, li) => ({
        รหัส: docs[i].รหัส,
        ชื่อ: docs[i].ชื่อ,
        จังหวัด: docs[i].จังหวัด,
        อำเภอ: docs[i].อำเภอ,
        lat: docs[i].lat as number,
        lng: docs[i].lng as number,
        minDist: Math.round(minDists[li]),
      })),
    })
  }

  // Sort: biggest groups first, then closest
  groups.sort((a, b) => b.count - a.count || a.maxDist - b.maxDist)

  const affected = groups.reduce((s, g) => s + g.count, 0)

  return NextResponse.json({
    groups,
    groupCount: groups.length,
    affected,
    checkedCount: n,
    threshold,
  })
}
