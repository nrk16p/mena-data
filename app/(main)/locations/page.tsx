"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import * as XLSX from "xlsx"
import {
  RefreshCw,
  Search,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Key,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  ChevronDown,
  ChevronUp,
  ScanSearch,
  X,
  PlusCircle,
  Navigation,
  Download,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationDoc = Record<string, unknown>

type DupLocation = {
  รหัส: unknown
  ชื่อ: unknown
  จังหวัด: unknown
  อำเภอ: unknown
  lat: number
  lng: number
  minDist: number
}

type DupGroup = {
  locations: DupLocation[]
  maxDist: number
  count: number
}

type DupResult = {
  groups: DupGroup[]
  groupCount: number
  affected: number
  checkedCount: number
  threshold: number
}

type PointResult = {
  รหัส: unknown
  ชื่อ: unknown
  จังหวัด: unknown
  อำเภอ: unknown
  lat: number
  lng: number
  distance: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDate(val: unknown): string {
  if (!val) return "—"
  const d = new Date(val as string)
  if (isNaN(d.getTime())) return String(val)
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
}

function cellValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—"
  if (typeof val === "object") return JSON.stringify(val)
  return String(val)
}

function distColor(m: number, threshold: number) {
  const ratio = m / threshold
  if (ratio <= 0.25) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  if (ratio <= 0.5)  return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDuplicatesToExcel(result: DupResult) {
  const ts = new Date().toLocaleString("th-TH")

  // Summary sheet
  const summaryData = [
    ["Duplicate Location Report"],
    ["Generated", ts],
    ["Threshold", `${result.threshold} meters`],
    ["Locations checked (with coordinates)", result.checkedCount],
    ["Duplicate groups found", result.groupCount],
    ["Locations affected", result.affected],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary["!cols"] = [{ wch: 38 }, { wch: 22 }]

  // Detail sheet — flat rows, one row per location
  const headers = [
    "Group",
    "No. in Group",
    "รหัส",
    "ชื่อสถานที่",
    "จังหวัด",
    "อำเภอ",
    "Lat",
    "Lng",
    "ระยะห่างใกล้สุด (m)",
    "Max Distance ในกลุ่ม (m)",
  ]
  const rows: (string | number)[][] = [headers]

  result.groups.forEach((group, gi) => {
    group.locations.forEach((loc, li) => {
      rows.push([
        gi + 1,
        li + 1,
        String(loc.รหัส ?? ""),
        String(loc.ชื่อ ?? ""),
        String(loc.จังหวัด ?? ""),
        String(loc.อำเภอ ?? ""),
        loc.lat,
        loc.lng,
        li === 0 ? "reference" : loc.minDist,
        group.maxDist,
      ])
    })
  })

  const wsDetail = XLSX.utils.aoa_to_sheet(rows)
  wsDetail["!cols"] = [
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 48 },
    { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    { wch: 22 }, { wch: 24 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary")
  XLSX.utils.book_append_sheet(wb, wsDetail, "Duplicate Groups")

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  XLSX.writeFile(wb, `duplicate_locations_${date}_${result.threshold}m.xlsx`)
}

// ─── Duplicate panel ──────────────────────────────────────────────────────────

function DuplicatePanel({ data }: { data: LocationDoc[] }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"bulk" | "point">("bulk")
  const [threshold, setThreshold] = useState(200)

  // Bulk check state
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<DupResult | null>(null)
  const [bulkError, setBulkError] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  // Point check state
  const [inputLat, setInputLat] = useState("")
  const [inputLng, setInputLng] = useState("")
  const [pointResults, setPointResults] = useState<PointResult[] | null>(null)
  const [pointError, setPointError] = useState("")
  const [pointChecking, setPointChecking] = useState(false)

  const validDocs = useMemo(
    () => data.filter((d) => d.lat && d.lng && Number(d.lat) !== 0 && Number(d.lng) !== 0),
    [data]
  )

  // ── Bulk check ──────────────────────────────────────────────────────────────
  async function runBulkCheck() {
    setChecking(true)
    setBulkError("")
    setResult(null)
    setExpandedGroups(new Set())
    try {
      const res = await fetch("/api/locations/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Check failed")
      setResult(json)
      setExpandedGroups(new Set([0, 1, 2]))
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setChecking(false)
    }
  }

  function toggleGroup(i: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  // ── Point check ─────────────────────────────────────────────────────────────
  function runPointCheck() {
    const lat = parseFloat(inputLat)
    const lng = parseFloat(inputLng)

    if (isNaN(lat) || isNaN(lng)) {
      setPointError("Enter valid latitude and longitude values")
      return
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setPointError("Coordinates out of range (lat: ±90, lng: ±180)")
      return
    }

    setPointError("")
    setPointChecking(true)
    setPointResults(null)

    // Run in next tick so the loading state renders
    setTimeout(() => {
      const results: PointResult[] = validDocs
        .map((doc) => ({
          รหัส: doc.รหัส,
          ชื่อ: doc.ชื่อ,
          จังหวัด: doc.จังหวัด,
          อำเภอ: doc.อำเภอ,
          lat: Number(doc.lat),
          lng: Number(doc.lng),
          distance: Math.round(haversine(lat, lng, Number(doc.lat), Number(doc.lng))),
        }))
        .filter((r) => r.distance <= threshold)
        .sort((a, b) => a.distance - b.distance)

      setPointResults(results)
      setPointChecking(false)
    }, 0)
  }

  function pasteFromClipboard() {
    navigator.clipboard.readText().then((text) => {
      // Support "lat,lng" or "lat lng" or Google Maps style "lat, lng"
      const parts = text.trim().split(/[\s,]+/)
      if (parts.length >= 2) {
        const a = parseFloat(parts[0])
        const b = parseFloat(parts[1])
        if (!isNaN(a) && !isNaN(b)) {
          setInputLat(String(a))
          setInputLng(String(b))
          setPointResults(null)
        }
      }
    }).catch(() => {})
  }

  // ── Shared controls ──────────────────────────────────────────────────────────
  const PRESETS = [50, 100, 200, 500]

  const thresholdBar = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
        Distance
      </label>
      <input
        type="number"
        min={1}
        max={10000}
        value={threshold}
        onChange={(e) => {
          setThreshold(Math.max(1, Number(e.target.value)))
          setPointResults(null)
          setResult(null)
        }}
        className="w-24 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <span className="text-[13px] text-gray-500">m</span>
      {PRESETS.map((v) => (
        <button
          key={v}
          onClick={() => { setThreshold(v); setPointResults(null); setResult(null) }}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
            threshold === v
              ? "bg-violet-600 text-white"
              : "bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
          }`}
        >
          {v}m
        </button>
      ))}
      <span className="ml-auto text-[11px] text-gray-400">
        {validDocs.length.toLocaleString()} / {data.length.toLocaleString()} with coordinates
      </span>
    </div>
  )

  return (
    <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden">
      {/* Panel header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/3 transition"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
            <ScanSearch size={15} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
              Duplicate Location Check
            </p>
            <p className="text-[11px] text-gray-400">
              Bulk scan existing data · Check a new lat/lng before adding
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {result.groupCount} groups
            </span>
          )}
          {pointResults !== null && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              pointResults.length === 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            }`}>
              {pointResults.length === 0 ? "No nearby" : `${pointResults.length} nearby`}
            </span>
          )}
          {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-white/6">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-white/6 px-5 pt-3 gap-1">
            {(["bulk", "point"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[12px] font-semibold transition border-b-2 -mb-px ${
                  tab === t
                    ? "border-violet-600 text-violet-700 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-900/10"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {t === "bulk" ? <ScanSearch size={13} /> : <PlusCircle size={13} />}
                {t === "bulk" ? "Bulk Scan" : "Check New Point"}
              </button>
            ))}
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* ── BULK SCAN TAB ── */}
            {tab === "bulk" && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {thresholdBar}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={runBulkCheck}
                    disabled={checking || data.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-[13px] rounded-xl transition"
                  >
                    {checking ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
                    {checking ? "Scanning…" : "Run Bulk Scan"}
                  </button>
                  {result && (
                    <button onClick={() => setResult(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <X size={13} />
                    </button>
                  )}
                </div>

                {bulkError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[12px]">
                    <AlertCircle size={13} />{bulkError}
                  </div>
                )}

                {result && (
                  <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-white/6">
                    <div className="flex flex-wrap items-center gap-3">
                      {result.groupCount === 0 ? (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[13px] font-medium">
                          <CheckCircle size={15} />
                          No duplicates found within {result.threshold}m
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-white">
                            <AlertCircle size={15} className="text-orange-500" />
                            {result.groupCount} duplicate group{result.groupCount > 1 ? "s" : ""} found
                          </div>
                          <span className="text-[12px] text-gray-400">{result.affected} locations affected</span>
                          <span className="text-[12px] text-gray-400">·</span>
                          <span className="text-[12px] text-gray-400">{result.checkedCount.toLocaleString()} checked · threshold {result.threshold}m</span>
                          <button
                            onClick={() => exportDuplicatesToExcel(result)}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition"
                          >
                            <Download size={13} />
                            Export Excel
                          </button>
                        </>
                      )}
                    </div>

                    {result.groups.map((group, gi) => (
                      <div key={gi} className="rounded-xl border border-gray-200 dark:border-white/8 overflow-hidden">
                        <button
                          onClick={() => toggleGroup(gi)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-white/3 hover:bg-gray-100 dark:hover:bg-white/5 transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                              Group {gi + 1}
                            </span>
                            <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                              {group.count} locations
                            </span>
                            <span className="text-[11px] text-gray-400">max {group.maxDist}m apart</span>
                          </div>
                          {expandedGroups.has(gi) ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                        </button>

                        {expandedGroups.has(gi) && (
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-white/6">
                                <th className="px-4 py-2 text-left font-semibold text-gray-400 w-8">#</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">รหัส</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">ชื่อสถานที่</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">จังหวัด</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">Lat</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">Lng</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-400">ใกล้ที่สุด</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-white/4">
                              {group.locations.map((loc, li) => (
                                <tr key={li} className="hover:bg-gray-50 dark:hover:bg-white/2 transition-colors">
                                  <td className="px-4 py-2.5 text-gray-400 font-mono">{li + 1}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {cellValue(loc.รหัส)}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 max-w-[280px]">
                                    <span title={cellValue(loc.ชื่อ)} className="block truncate">{cellValue(loc.ชื่อ)}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {cellValue(loc.จังหวัด) || cellValue(loc.อำเภอ)}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{loc.lat.toFixed(6)}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{loc.lng.toFixed(6)}</td>
                                  <td className="px-4 py-2.5">
                                    {li === 0 ? (
                                      <span className="text-[11px] text-gray-400">reference</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${distColor(loc.minDist, result.threshold)}`}>
                                        {loc.minDist}m
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── CHECK NEW POINT TAB ── */}
            {tab === "point" && (
              <>
                <p className="text-[12px] text-gray-500">
                  Enter a new location's coordinates to check if any existing locations fall within the distance threshold.
                </p>

                {thresholdBar}

                {/* Coordinate inputs */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <Navigation size={10} /> Latitude
                    </label>
                    <input
                      type="text"
                      value={inputLat}
                      onChange={(e) => { setInputLat(e.target.value); setPointResults(null) }}
                      placeholder="13.756331"
                      className="w-40 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <Navigation size={10} className="rotate-90" /> Longitude
                    </label>
                    <input
                      type="text"
                      value={inputLng}
                      onChange={(e) => { setInputLng(e.target.value); setPointResults(null) }}
                      placeholder="100.501762"
                      className="w-40 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <button
                    onClick={pasteFromClipboard}
                    title="Paste 'lat, lng' from clipboard"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[12px] text-gray-600 hover:border-gray-300 transition"
                  >
                    <Copy size={12} /> Paste coords
                  </button>

                  <button
                    onClick={runPointCheck}
                    disabled={pointChecking || !inputLat || !inputLng || data.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-[13px] rounded-xl transition"
                  >
                    {pointChecking ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
                    {pointChecking ? "Checking…" : "Check Point"}
                  </button>

                  {pointResults !== null && (
                    <button onClick={() => setPointResults(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <X size={13} />
                    </button>
                  )}
                </div>

                {pointError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[12px]">
                    <AlertCircle size={13} />{pointError}
                  </div>
                )}

                {/* Point results */}
                {pointResults !== null && (
                  <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-white/6">
                    {pointResults.length === 0 ? (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[13px] font-medium py-2">
                        <CheckCircle size={15} />
                        No existing locations within {threshold}m — safe to add
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-white">
                          <AlertCircle size={15} className="text-orange-500" />
                          {pointResults.length} existing location{pointResults.length > 1 ? "s" : ""} within {threshold}m of this point
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-white/8 overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-white/3 border-b border-gray-100 dark:border-white/6">
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400 w-8">#</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">รหัส</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">ชื่อสถานที่</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">จังหวัด</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">Lat</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">Lng</th>
                                <th className="px-4 py-2.5 text-left font-semibold text-gray-400">ระยะห่าง</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-white/4">
                              {pointResults.map((loc, i) => (
                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/2 transition-colors">
                                  <td className="px-4 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {cellValue(loc.รหัส)}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 max-w-[280px]">
                                    <span title={cellValue(loc.ชื่อ)} className="block truncate">{cellValue(loc.ชื่อ)}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {cellValue(loc.จังหวัด) || cellValue(loc.อำเภอ)}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{loc.lat.toFixed(6)}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{loc.lng.toFixed(6)}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${distColor(loc.distance, threshold)}`}>
                                      {loc.distance}m
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const [data, setData] = useState<LocationDoc[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<{
    type: "success" | "error"
    msg: string
  } | null>(null)
  const [phpsessid, setPhpsessid] = useState("")
  const [showCookieInput, setShowCookieInput] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("atms_phpsessid")
    if (stored) setPhpsessid(stored)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/locations")
      const json = await res.json()
      const docs: LocationDoc[] = json.data || []
      setData(docs)
      if (docs.length > 0) {
        const cols = Object.keys(docs[0]).filter((k) => k !== "synced_at")
        setColumns(cols)
        const syncVal = docs[0].synced_at
        if (syncVal) setLastSync(formatDate(syncVal))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q))
    )
  }, [data, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncStatus(null)
    if (phpsessid) localStorage.setItem("atms_phpsessid", phpsessid)

    const res = await fetch("/api/locations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phpsessid }),
    })
    const json = await res.json()

    if (res.ok) {
      setSyncStatus({ type: "success", msg: `Synced ${json.count.toLocaleString()} records` })
      await fetchData()
    } else {
      setSyncStatus({ type: "error", msg: json.error || "Sync failed" })
      if (res.status === 401) setShowCookieInput(true)
    }

    setSyncing(false)
    setTimeout(() => setSyncStatus(null), 5000)
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-8">
      {/* Title + stats */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={16} className="text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Location Master</h1>
          </div>
          <p className="text-[13px] text-gray-500">Location data synced from ATMS system</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#161b27] rounded-xl border border-gray-200 dark:border-white/8">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
              {data.length.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-400">Records</span>
          </div>
          {lastSync && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#161b27] rounded-xl border border-gray-200 dark:border-white/8">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-gray-400">Last sync</span>
              <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{lastSync}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sync action bar */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search locations…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={() => setShowCookieInput(!showCookieInput)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition ${
              showCookieInput
                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
            }`}
          >
            <Key size={13} />
            Session Cookie
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-[13px] rounded-xl transition"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? "Syncing…" : "Sync from ATMS"}
          </button>
        </div>

        {showCookieInput && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-500 whitespace-nowrap">PHPSESSID</span>
            <input
              type="text"
              value={phpsessid}
              onChange={(e) => setPhpsessid(e.target.value)}
              placeholder="Paste cookie value from browser DevTools…"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[12px] font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {syncStatus && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium ${
              syncStatus.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
            }`}
          >
            {syncStatus.type === "success" ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {syncStatus.msg}
          </div>
        )}
      </div>

      {/* ── Duplicate check panel ── */}
      <DuplicatePanel data={data} />

      {/* Locations table */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <MapPin size={24} className="opacity-40" />
            <p className="text-[13px]">
              {data.length === 0
                ? "No data — click Sync from ATMS to load locations"
                : "No results match your search"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 dark:border-white/8">
                    <th className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 w-12">#</th>
                    {columns.map((col) => (
                      <th key={col} className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {paginated.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 font-mono">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] truncate"
                          title={cellValue(row[col])}
                        >
                          {cellValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
              <span className="text-[12px] text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length.toLocaleString()}
                {search && ` (filtered from ${data.length.toLocaleString()})`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p = i + 1
                  if (totalPages > 5) {
                    if (page <= 3) p = i + 1
                    else if (page >= totalPages - 2) p = totalPages - 4 + i
                    else p = page - 2 + i
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-[12px] font-medium transition ${
                        page === p ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
