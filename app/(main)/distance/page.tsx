"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import {
  Ruler,
  Search,
  X,
  ArrowLeftRight,
  ArrowRight,
  Loader2,
  AlertCircle,
  RotateCw,
  ExternalLink,
  MapPin,
  Copy,
  Check,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Loc = {
  id: number
  code: string
  name: string
  province: string
  district: string
  lat: number
  lng: number
  haystack: string
}

type SlopeResult = {
  flat_km: number
  uphill_km: number
  steep_uphill_km: number
  total_distance_km: number
}

type LegResult = { ok: true; data: SlopeResult } | { ok: false; error: string }

type LegState =
  | { status: "loading" }
  | { status: "ok"; data: SlopeResult }
  | { status: "error"; error: string }

type Calc = { from: Loc; to: Loc; go: LegState; back: LegState }

type Leg = "go" | "back"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_OPTIONS = 50

const TERRAIN = [
  { key: "flat_km", label: "ทางเรียบ", color: "bg-emerald-500" },
  { key: "uphill_km", label: "ขึ้นเขา", color: "bg-amber-400" },
  { key: "steep_uphill_km", label: "ขึ้นเขาสูง", color: "bg-red-500" },
] as const

// ATMS ship.to distance fields, in form order (see api-ncac routes/atms_tms.py).
// หนัก = ขาไป (From→To), เบา = ขากลับ (To→From); the rest are not calculated.
const ATMS_FIELDS: { label: string; leg: Leg | null; key?: (typeof TERRAIN)[number]["key"] }[] = [
  { label: "ระยะทาง", leg: null },
  { label: "ตีเปล่า", leg: null },
  { label: "ทางเรียบหนัก", leg: "go", key: "flat_km" },
  { label: "ขึ้นเขาหนัก", leg: "go", key: "uphill_km" },
  { label: "ขึ้นเขาสูงหนัก", leg: "go", key: "steep_uphill_km" },
  { label: "ทางเรียบ", leg: "back", key: "flat_km" },
  { label: "ขึ้นเขา", leg: "back", key: "uphill_km" },
  { label: "ขึ้นเขาสูง", leg: "back", key: "steep_uphill_km" },
  { label: "สำรอง", leg: null },
]

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

function fmtKm(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 })
}

function str(val: unknown): string {
  return val === null || val === undefined ? "" : String(val).trim()
}

function toLocs(docs: Record<string, unknown>[]): Loc[] {
  const out: Loc[] = []
  docs.forEach((d, i) => {
    const lat = Number(d.lat)
    const lng = Number(d.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return
    const code = str(d.รหัส)
    const name = str(d.ชื่อ)
    const province = str(d.จังหวัด)
    const district = str(d.อำเภอ)
    out.push({
      id: i,
      code,
      name,
      province,
      district,
      lat,
      lng,
      haystack: `${code} ${name} ${district} ${province}`.toLowerCase(),
    })
  })
  return out
}

function legState(r: LegResult | null | undefined): LegState {
  if (!r) return { status: "error", error: "No response" }
  return r.ok ? { status: "ok", data: r.data } : { status: "error", error: r.error }
}

function mapsUrl(from: Loc, to: Loc): string {
  const p = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: "driving",
  })
  return `https://www.google.com/maps/dir/?${p}`
}

// ─── Location picker ──────────────────────────────────────────────────────────

function LocationPicker({
  label,
  locations,
  value,
  onChange,
  disabled,
}: {
  label: string
  locations: Loc[]
  value: Loc | null
  onChange: (loc: Loc | null) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const hits = terms.length
      ? locations.filter((l) => terms.every((t) => l.haystack.includes(t)))
      : locations
    return { total: hits.length, shown: hits.slice(0, MAX_OPTIONS) }
  }, [query, locations])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [active])

  function select(loc: Loc) {
    onChange(loc)
    setQuery("")
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, matches.shown.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const loc = matches.shown[active]
      if (open && loc) select(loc)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="flex-1 min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>

      {value ? (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-900/10">
          <MapPin size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">
              {value.name || "—"}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {[value.code, value.district, value.province].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[11px] font-mono text-gray-400">
              {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
            </p>
          </div>
          <button
            onClick={clear}
            disabled={disabled}
            title="Change location"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 transition"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder="Search รหัส / ชื่อ / อำเภอ / จังหวัด…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[13px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
          />

          {open && (
            <div
              ref={listRef}
              className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-lg"
            >
              {matches.shown.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-gray-400">No matching locations</p>
              ) : (
                <>
                  {matches.shown.map((loc, i) => (
                    <button
                      key={loc.id}
                      data-idx={i}
                      // mousedown fires before the input's blur closes the list
                      onMouseDown={(e) => {
                        e.preventDefault()
                        select(loc)
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={`block w-full text-left px-3 py-2 transition ${
                        i === active ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      }`}
                    >
                      <p className="text-[13px] text-gray-900 dark:text-white truncate">
                        <span className="font-mono text-[11px] text-gray-400 mr-2">{loc.code}</span>
                        {loc.name || "—"}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {[loc.district, loc.province].filter(Boolean).join(", ") || "—"}
                      </p>
                    </button>
                  ))}
                  {matches.total > MAX_OPTIONS && (
                    <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100 dark:border-white/6">
                      Showing {MAX_OPTIONS} of {matches.total.toLocaleString()} — type more to narrow down
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function LegCard({
  title,
  load,
  from,
  to,
  state,
  onRetry,
}: {
  title: string
  load: string
  from: Loc
  to: Loc
  state: LegState
  onRetry: () => void
}) {
  const straightKm = haversine(from.lat, from.lng, to.lat, to.lng) / 1000

  return (
    <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-gray-900 dark:text-white">{title}</p>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-400">
              {load}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-gray-500 min-w-0">
            <span className="truncate">{from.name || from.code}</span>
            <ArrowRight size={12} className="shrink-0" />
            <span className="truncate">{to.name || to.code}</span>
          </p>
        </div>
        <a
          href={mapsUrl(from, to)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Google Maps <ExternalLink size={11} />
        </a>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center gap-2 py-8 justify-center text-[13px] text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          Calculating route…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-[12px] font-medium text-red-700 dark:text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{state.error}</span>
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-white/10 border border-red-200 dark:border-red-500/30 hover:bg-red-50 transition"
          >
            <RotateCw size={12} />
            Retry
          </button>
        </div>
      )}

      {state.status === "ok" && (() => {
        const d = state.data
        const bucketSum = d.flat_km + d.uphill_km + d.steep_uphill_km
        return (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
                {fmtKm(d.total_distance_km)}
              </span>
              <span className="text-[13px] text-gray-400">km by road</span>
            </div>

            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
              {bucketSum > 0 &&
                TERRAIN.map((t) =>
                  d[t.key] > 0 ? (
                    <div
                      key={t.key}
                      className={t.color}
                      style={{ width: `${(d[t.key] / bucketSum) * 100}%` }}
                      title={`${t.label} ${fmtKm(d[t.key])} km`}
                    />
                  ) : null
                )}
            </div>

            <p className="text-[11px] text-gray-400">
              Straight line {fmtKm(straightKm)} km
              {straightKm > 0 && ` · road ÷ straight = ${(d.total_distance_km / straightKm).toFixed(2)}×`}
            </p>
          </>
        )
      })()}
    </div>
  )
}

// ─── ATMS ship.to panel ───────────────────────────────────────────────────────

function atmsValue(f: (typeof ATMS_FIELDS)[number], calc: Calc): number | null {
  if (!f.leg || !f.key) return 0
  const st = calc[f.leg]
  return st.status === "ok" ? st.data[f.key] : null
}

function AtmsPanel({ calc }: { calc: Calc }) {
  const [copied, setCopied] = useState(false)
  const ready = calc.go.status === "ok" && calc.back.status === "ok"

  async function copy() {
    const text = ATMS_FIELDS.map((f) => `${f.label} : ${(atmsValue(f, calc) ?? 0).toFixed(2)}`).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked (e.g. non-secure context) — values are still visible to copy by hand
    }
  }

  return (
    <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-gray-900 dark:text-white">ATMS Ship To</p>
          <p className="text-[11px] text-gray-400">…หนัก = ขาไป (From→To) · ที่เหลือ = ขากลับ (To→From)</p>
        </div>
        <button
          onClick={copy}
          disabled={!ready}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/8 disabled:opacity-40 transition"
        >
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-white/6">
        {ATMS_FIELDS.map((f) => {
          const v = atmsValue(f, calc)
          const st = f.leg ? calc[f.leg] : null
          const color = TERRAIN.find((t) => t.key === f.key)?.color
          return (
            <div key={f.label} className="flex items-center gap-2.5 py-2 text-[13px]">
              <span className={`h-2.5 w-2.5 rounded-full ${color ?? "bg-gray-200 dark:bg-white/10"}`} />
              <span className="flex-1 text-gray-600 dark:text-gray-300">{f.label}</span>
              {f.leg && (
                <span className="text-[10px] text-gray-400">{f.leg === "go" ? "ขาไป" : "ขากลับ"}</span>
              )}
              <span
                className={`w-20 text-right font-semibold tabular-nums ${
                  f.leg ? "text-gray-900 dark:text-white" : "text-gray-400"
                }`}
              >
                {v !== null ? (
                  v.toFixed(2)
                ) : st?.status === "loading" ? (
                  <Loader2 size={13} className="inline animate-spin text-gray-400" />
                ) : (
                  "—"
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DistancePage() {
  const [locations, setLocations] = useState<Loc[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [loadingLocs, setLoadingLocs] = useState(true)
  const [locError, setLocError] = useState<string | null>(null)

  const [from, setFrom] = useState<Loc | null>(null)
  const [to, setTo] = useState<Loc | null>(null)
  const [calc, setCalc] = useState<Calc | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    fetch("/api/locations")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load locations")
        const docs = (json.data ?? []) as Record<string, unknown>[]
        setTotalDocs(docs.length)
        setLocations(toLocs(docs))
      })
      .catch((err) => setLocError(err instanceof Error ? err.message : "Failed to load locations"))
      .finally(() => setLoadingLocs(false))
  }, [])

  const busy = calc !== null && (calc.go.status === "loading" || calc.back.status === "loading")
  const samePoint = from !== null && to !== null && from.id === to.id
  const canCalc = from !== null && to !== null && !samePoint && !busy

  async function request(pair: { from: Loc; to: Loc }, only?: Leg) {
    try {
      const res = await fetch("/api/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { lat: pair.from.lat, lng: pair.from.lng },
          to: { lat: pair.to.lat, lng: pair.to.lng },
          only,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) {
        const error = json?.error || `Request failed (${res.status})`
        return { go: { ok: false, error }, back: { ok: false, error } } as Record<Leg, LegResult>
      }
      return json as Record<Leg, LegResult | null>
    } catch {
      const error = "Network error"
      return { go: { ok: false, error }, back: { ok: false, error } } as Record<Leg, LegResult>
    }
  }

  async function calculate() {
    if (!from || !to || !canCalc) return
    const id = ++runId.current
    const pair = { from, to }
    setCalc({ ...pair, go: { status: "loading" }, back: { status: "loading" } })
    const r = await request(pair)
    if (runId.current !== id) return
    setCalc({ ...pair, go: legState(r.go), back: legState(r.back) })
  }

  async function retry(leg: Leg) {
    if (!calc) return
    const id = runId.current
    const pair = { from: calc.from, to: calc.to }
    setCalc((c) => (c ? { ...c, [leg]: { status: "loading" } } : c))
    const r = await request(pair, leg)
    if (runId.current !== id) return
    setCalc((c) => (c ? { ...c, [leg]: legState(r[leg]) } : c))
  }

  function swap() {
    setFrom(to)
    setTo(from)
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 pb-8">
      {/* Title */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Ruler size={16} className="text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cal Distance</h1>
          </div>
          <p className="text-[13px] text-gray-500">
            Road distance between two locations, split into ทางเรียบ / ขึ้นเขา / ขึ้นเขาสูง (Slope API)
          </p>
        </div>
        {!loadingLocs && !locError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#161b27] rounded-xl border border-gray-200 dark:border-white/8">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
              {locations.length.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-400">
              of {totalDocs.toLocaleString()} locations have coordinates
            </span>
          </div>
        )}
      </div>

      {/* Picker */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-gray-200 dark:border-white/8 p-5 space-y-4">
        {locError ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-[12px] font-medium text-red-700 dark:text-red-400">
            <AlertCircle size={13} />
            {locError}
          </div>
        ) : loadingLocs ? (
          <div className="flex items-center gap-2 py-6 justify-center text-[13px] text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Loading locations…
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <LocationPicker label="From" locations={locations} value={from} onChange={setFrom} disabled={busy} />
              <button
                onClick={swap}
                disabled={busy || (!from && !to)}
                title="Swap From / To"
                className="flex h-10 w-10 shrink-0 self-center md:self-end md:mb-0.5 items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition"
              >
                <ArrowLeftRight size={15} />
              </button>
              <LocationPicker label="To" locations={locations} value={to} onChange={setTo} disabled={busy} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={calculate}
                disabled={!canCalc}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-[13px] rounded-xl transition"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Ruler size={14} />}
                {busy ? "Calculating…" : "Calculate"}
              </button>
              {samePoint && (
                <span className="text-[12px] text-orange-600 dark:text-orange-400">
                  From and To are the same location
                </span>
              )}
              <span className="ml-auto text-[11px] text-gray-400">
                Calculates both directions · takes a few seconds
              </span>
            </div>
          </>
        )}
      </div>

      {/* Results */}
      {calc && (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <AtmsPanel calc={calc} />
          <div className="space-y-4">
            <LegCard
              title="ขาไป"
              load="หนัก"
              from={calc.from}
              to={calc.to}
              state={calc.go}
              onRetry={() => retry("go")}
            />
            <LegCard
              title="ขากลับ"
              load="เบา"
              from={calc.to}
              to={calc.from}
              state={calc.back}
              onRetry={() => retry("back")}
            />
          </div>
        </div>
      )}
    </div>
  )
}
