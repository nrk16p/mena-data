"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { Download, FileSpreadsheet, ChevronDown, ChevronUp, RefreshCw, Database, Search, X, Play, Loader2 } from "lucide-react"

type RunInfo = {
  id: string
  name: string
  run_date: string | null
  ldt_count: number | null
  new_ship_to_count: number | null
  created_at: string
  source: "mongodb" | "filesystem"
}

type TableData = {
  headers: string[]
  rows: Record<string, unknown>[]
  total: number
}

type PreviewData = {
  ldt: TableData
  shipto: TableData
}

type TabKey = "ticket" | "shipto"

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
}

function DataTable({ data, search }: { data: TableData; search: string }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return data.rows
    const q = search.trim().toLowerCase()
    return data.rows.filter((row) =>
      data.headers.some((h) => String(row[h] ?? "").toLowerCase().includes(q))
    )
  }, [data, search])

  if (data.rows.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">No data</p>
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-400">
        {search.trim()
          ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""} — from first ${data.rows.length} of ${data.total} rows`
          : `Showing ${data.rows.length} of ${data.total} rows`}
      </p>
      <div className="overflow-auto max-h-80 rounded-xl border border-gray-200 dark:border-white/8">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">No rows match &ldquo;{search}&rdquo;</p>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-100 dark:bg-white/8">
              <tr>
                {data.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-transparent divide-y divide-gray-50 dark:divide-white/5">
              {filtered.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/3">
                  {data.headers.map((h) => {
                    const cell = String(row[h] ?? "")
                    const isMatch = search.trim() && cell.toLowerCase().includes(search.trim().toLowerCase())
                    return (
                      <td key={h} className="whitespace-nowrap px-3 py-1.5 text-gray-700 dark:text-gray-300">
                        {isMatch ? (
                          <Highlight text={cell} query={search.trim()} />
                        ) : (
                          cell
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function PipelinePage({ type, title }: { type: string; title: string }) {
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>("ticket")
  const [search, setSearch] = useState("")
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const res = await fetch(`/api/pipeline/${type}`)
      if (!res.ok) throw new Error("Failed to fetch runs")
      const data = await res.json()
      setRuns(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [type])

  // Poll pipeline status while running
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/${type}/run`)
      if (!res.ok) return
      const data = await res.json()
      if (data.running) {
        setPipelineRunning(true)
        pollRef.current = setTimeout(pollStatus, 8000)
      } else {
        setPipelineRunning(false)
        if (data.last_run) {
          setRunMsg({ text: "Pipeline finished — refreshing runs…", ok: true })
          await fetchRuns()
          setTimeout(() => setRunMsg(null), 4000)
        }
      }
    } catch {
      setPipelineRunning(false)
    }
  }, [type, fetchRuns])

  async function triggerRun() {
    setRunMsg(null)
    try {
      const res = await fetch(`/api/pipeline/${type}/run`, { method: "POST" })
      const data = await res.json()
      if (data.status === "started") {
        setPipelineRunning(true)
        setRunMsg({ text: "Pipeline started — this takes 5–15 min…", ok: true })
        pollRef.current = setTimeout(pollStatus, 10000)
      } else if (data.status === "already_running") {
        setRunMsg({ text: "Pipeline already running…", ok: true })
        setPipelineRunning(true)
        pollRef.current = setTimeout(pollStatus, 10000)
      } else if (data.error === "Pipeline runner not configured") {
        setRunMsg({ text: "Run Now not configured (NCAC_API_URL missing)", ok: false })
      } else {
        setRunMsg({ text: data.error ?? "Unknown response", ok: false })
      }
    } catch (err: unknown) {
      setRunMsg({ text: err instanceof Error ? err.message : "Failed to trigger pipeline", ok: false })
    }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  async function togglePreview(run: RunInfo) {
    if (openId === run.id) {
      setOpenId(null)
      setPreview(null)
      setSearch("")
      return
    }
    setOpenId(run.id)
    setPreview(null)
    setActiveTab("ticket")
    setSearch("")
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/pipeline/${type}/${encodeURIComponent(run.id)}`)
      if (!res.ok) throw new Error("Failed to load preview")
      setPreview(await res.json())
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function downloadRun(run: RunInfo) {
    window.location.href = `/api/pipeline/${type}/${encodeURIComponent(run.id)}?action=download`
  }

  useEffect(() => { fetchRuns() }, [type, fetchRuns])

  // Reset search when switching tabs
  function handleTabChange(tab: TabKey) {
    setActiveTab(tab)
    setSearch("")
  }

  const tabs: { key: TabKey; label: string; count: (r: RunInfo) => number | null }[] = [
    { key: "ticket", label: "Ticket", count: (r) => r.ldt_count },
    { key: "shipto", label: "Ship To", count: (r) => r.new_ship_to_count },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {runs[0]?.created_at
              ? <>Last updated: <span className="font-medium text-gray-700 dark:text-gray-300">{formatDate(runs[0].created_at)}</span></>
              : "Pipeline runs — updated daily at 02:00 AM"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerRun}
            disabled={pipelineRunning}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {pipelineRunning
              ? <Loader2 size={14} className="animate-spin" />
              : <Play size={14} />}
            {pipelineRunning ? "Running…" : "Run Now"}
          </button>
          <button
            onClick={fetchRuns}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/8 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {runMsg && (
        <div className={`rounded-xl border p-3 text-sm ${
          runMsg.ok
            ? "border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
            : "border-red-200 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
        }`}>
          {runMsg.text}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] shadow-sm">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px_180px_120px] gap-4 border-b border-gray-100 dark:border-white/8 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <span>Run</span>
          <span className="text-right">Tickets</span>
          <span className="text-right">New ST</span>
          <span className="text-right">Created</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>}
        {!loading && runs.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No pipeline runs found.</div>
        )}

        {runs.map((run) => (
          <div key={run.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
            {/* Row */}
            <div className="grid grid-cols-[1fr_80px_80px_180px_120px] gap-4 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
              <button onClick={() => togglePreview(run)} className="flex items-center gap-2.5 text-left">
                {run.source === "mongodb"
                  ? <Database size={16} className="shrink-0 text-blue-500" />
                  : <FileSpreadsheet size={16} className="shrink-0 text-green-600" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{run.name}</p>
                  {run.run_date && (
                    <p className="text-xs text-gray-400">{run.run_date}</p>
                  )}
                </div>
                {openId === run.id
                  ? <ChevronUp size={14} className="shrink-0 text-gray-400 ml-auto" />
                  : <ChevronDown size={14} className="shrink-0 text-gray-400 ml-auto" />}
              </button>

              <span className="text-right text-xs text-gray-500 font-medium">
                {run.ldt_count != null ? run.ldt_count.toLocaleString() : "—"}
              </span>
              <span className="text-right text-xs text-gray-500 font-medium">
                {run.new_ship_to_count != null ? run.new_ship_to_count.toLocaleString() : "—"}
              </span>
              <span className="text-right text-xs text-gray-400">{formatDate(run.created_at)}</span>

              <div className="flex justify-end">
                <button
                  onClick={() => downloadRun(run)}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-950 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>
            </div>

            {/* Expandable preview with tabs + search */}
            {openId === run.id && (
              <div className="border-t border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-black/20">
                {previewLoading && (
                  <p className="px-5 py-6 text-sm text-gray-400">Loading preview...</p>
                )}
                {!previewLoading && !preview && (
                  <p className="px-5 py-6 text-sm text-red-500">Failed to load preview.</p>
                )}
                {!previewLoading && preview && (
                  <div>
                    {/* Tab bar + search bar */}
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/8 px-5">
                      {/* Tabs */}
                      <div className="flex items-center gap-0">
                        {tabs.map((tab) => {
                          const count = tab.count(run)
                          const isActive = activeTab === tab.key
                          return (
                            <button
                              key={tab.key}
                              onClick={() => handleTabChange(tab.key)}
                              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                isActive
                                  ? "border-gray-900 dark:border-white text-gray-900 dark:text-white"
                                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                              }`}
                            >
                              {tab.label}
                              {count != null && (
                                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                                  isActive
                                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                                    : "bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400"
                                }`}>
                                  {count.toLocaleString()}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Search input */}
                      <div className="relative flex items-center py-2">
                        <Search size={13} className="absolute left-2.5 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search rows…"
                          className="w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 pl-8 pr-7 py-1.5 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                        />
                        {search && (
                          <button
                            onClick={() => setSearch("")}
                            className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tab content */}
                    <div className="px-5 py-4">
                      {activeTab === "ticket" && <DataTable data={preview.ldt} search={search} />}
                      {activeTab === "shipto" && <DataTable data={preview.shipto} search={search} />}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
