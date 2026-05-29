"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Duplicate panel ──────────────────────────────────────────────────────────

function DuplicatePanel({ data }: { data: LocationDoc[] }) {
  const [open, setOpen] = useState(false)
  const [threshold, setThreshold] = useState(200)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<DupResult | null>(null)
  const [error, setError] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  const withCoords = useMemo(
    () => data.filter((d) => d.lat && d.lng && d.lat !== 0 && d.lng !== 0).length,
    [data]
  )

  async function runCheck() {
    setChecking(true)
    setError("")
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
      // auto-expand first 3 groups
      setExpandedGroups(new Set([0, 1, 2]))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
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

  return (
    <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden">
      {/* Header */}
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
              Find locations within a set distance of each other using lat/lng
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {result.groupCount} groups
            </span>
          )}
          {open ? (
            <ChevronUp size={15} className="text-gray-400" />
          ) : (
            <ChevronDown size={15} className="text-gray-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-white/6 px-5 py-4 space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Distance Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={threshold}
                  onChange={(e) => setThreshold(Math.max(1, Number(e.target.value)))}
                  className="w-28 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <span className="text-[13px] text-gray-500">meters</span>
                {/* quick presets */}
                {[50, 100, 200, 500].map((v) => (
                  <button
                    key={v}
                    onClick={() => setThreshold(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                      threshold === v
                        ? "bg-violet-600 text-white"
                        : "bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {v}m
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={runCheck}
              disabled={checking || data.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-[13px] rounded-xl transition"
            >
              {checking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ScanSearch size={14} />
              )}
              {checking ? "Checking…" : "Run Check"}
            </button>

            {data.length > 0 && (
              <p className="text-[11px] text-gray-400 ml-auto">
                {withCoords.toLocaleString()} / {data.length.toLocaleString()} locations have coordinates
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[12px]">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-3 py-3 border-t border-gray-100 dark:border-white/6">
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
                    <span className="text-[12px] text-gray-400">
                      {result.affected} locations affected
                    </span>
                    <span className="text-[12px] text-gray-400">·</span>
                    <span className="text-[12px] text-gray-400">
                      {result.checkedCount.toLocaleString()} locations checked (with coordinates)
                    </span>
                    <span className="text-[12px] text-gray-400">·</span>
                    <span className="text-[12px] text-gray-400">
                      threshold {result.threshold}m
                    </span>
                    <button
                      onClick={() => setResult(null)}
                      className="ml-auto p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>

              {/* Groups */}
              {result.groups.map((group, gi) => (
                <div
                  key={gi}
                  className="rounded-xl border border-gray-200 dark:border-white/8 overflow-hidden"
                >
                  {/* Group header */}
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
                      <span className="text-[11px] text-gray-400">
                        max {group.maxDist}m apart
                      </span>
                    </div>
                    {expandedGroups.has(gi) ? (
                      <ChevronUp size={13} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={13} className="text-gray-400" />
                    )}
                  </button>

                  {/* Group rows */}
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
                          <tr
                            key={li}
                            className="hover:bg-gray-50 dark:hover:bg-white/2 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-gray-400 font-mono">{li + 1}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {cellValue(loc.รหัส)}
                                <button
                                  onClick={() => navigator.clipboard.writeText(String(loc.รหัส))}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500"
                                  title="Copy code"
                                >
                                  <Copy size={10} />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 max-w-[280px]">
                              <span title={cellValue(loc.ชื่อ)} className="block truncate">
                                {cellValue(loc.ชื่อ)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {cellValue(loc.จังหวัด) || cellValue(loc.อำเภอ)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">
                              {loc.lat.toFixed(6)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">
                              {loc.lng.toFixed(6)}
                            </td>
                            <td className="px-4 py-2.5">
                              {li === 0 ? (
                                <span className="text-[11px] text-gray-400">reference</span>
                              ) : (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${distColor(
                                    loc.minDist,
                                    result.threshold
                                  )}`}
                                >
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
