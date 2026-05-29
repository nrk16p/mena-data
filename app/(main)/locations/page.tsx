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
} from "lucide-react"

type LocationDoc = Record<string, unknown>

const PAGE_SIZE = 50

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

    if (phpsessid) {
      localStorage.setItem("atms_phpsessid", phpsessid)
    }

    const res = await fetch("/api/locations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phpsessid }),
    })
    const json = await res.json()

    if (res.ok) {
      setSyncStatus({
        type: "success",
        msg: `Synced ${json.count.toLocaleString()} records`,
      })
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Location Master
            </h1>
          </div>
          <p className="text-[13px] text-gray-500">
            Location data synced from ATMS system
          </p>
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
              <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                {lastSync}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
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
            {syncing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {syncing ? "Syncing…" : "Sync from ATMS"}
          </button>
        </div>

        {showCookieInput && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-500 whitespace-nowrap">
              PHPSESSID
            </span>
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
            {syncStatus.type === "success" ? (
              <CheckCircle size={13} />
            ) : (
              <AlertCircle size={13} />
            )}
            {syncStatus.msg}
          </div>
        )}
      </div>

      {/* Table */}
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
                    <th className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 w-12">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap"
                      >
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

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
              <span className="text-[12px] text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
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
                        page === p
                          ? "bg-blue-600 text-white"
                          : "text-gray-500 hover:bg-gray-100"
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
