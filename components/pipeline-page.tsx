"use client"

import { useEffect, useState } from "react"
import { Download, FileSpreadsheet, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"

type FileInfo = {
  name: string
  size: number
  modified: string
}

type PreviewData = {
  headers: string[]
  rows: Record<string, unknown>[]
  total: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function PipelinePage({ type, title }: { type: string; title: string }) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function fetchFiles() {
    try {
      setLoading(true)
      setError("")
      const res = await fetch(`/api/pipeline/${type}`)
      if (!res.ok) throw new Error("Failed to fetch files")
      const data = await res.json()
      setFiles(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  async function togglePreview(name: string) {
    if (openFile === name) {
      setOpenFile(null)
      setPreview(null)
      return
    }
    setOpenFile(name)
    setPreview(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/pipeline/${type}/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error("Failed to load preview")
      const data = await res.json()
      setPreview(data)
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function downloadFile(name: string) {
    window.location.href = `/api/pipeline/${type}/${encodeURIComponent(name)}?action=download`
  }

  useEffect(() => {
    fetchFiles()
  }, [type])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Output files from automated pipeline runs
          </p>
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/8 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] shadow-sm">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_180px_120px] gap-4 border-b border-gray-100 dark:border-white/8 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <span>Filename</span>
          <span className="text-right">Size</span>
          <span className="text-right">Modified</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
        )}

        {!loading && files.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No output files found.</div>
        )}

        {files.map((file) => (
          <div key={file.name} className="border-b border-gray-50 dark:border-white/5 last:border-0">
            {/* Row */}
            <div className="grid grid-cols-[1fr_100px_180px_120px] gap-4 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
              <button
                onClick={() => togglePreview(file.name)}
                className="flex items-center gap-2.5 text-left"
              >
                <FileSpreadsheet size={16} className="shrink-0 text-green-600" />
                <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {file.name}
                </span>
                {openFile === file.name ? (
                  <ChevronUp size={14} className="shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown size={14} className="shrink-0 text-gray-400" />
                )}
              </button>

              <span className="text-right text-xs text-gray-400">{formatBytes(file.size)}</span>
              <span className="text-right text-xs text-gray-400">{formatDate(file.modified)}</span>

              <div className="flex justify-end">
                <button
                  onClick={() => downloadFile(file.name)}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-950 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>
            </div>

            {/* Preview panel */}
            {openFile === file.name && (
              <div className="border-t border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-black/20 px-5 py-4">
                {previewLoading && (
                  <p className="text-sm text-gray-400">Loading preview...</p>
                )}
                {!previewLoading && !preview && (
                  <p className="text-sm text-red-500">Failed to load preview.</p>
                )}
                {!previewLoading && preview && (
                  <div>
                    <p className="mb-3 text-xs text-gray-400">
                      Showing {preview.rows.length} of {preview.total} rows
                    </p>
                    <div className="overflow-auto max-h-96 rounded-xl border border-gray-200 dark:border-white/8">
                      <table className="min-w-full text-xs">
                        <thead className="sticky top-0 bg-gray-100 dark:bg-white/8">
                          <tr>
                            {preview.headers.map((h) => (
                              <th
                                key={h}
                                className="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-transparent divide-y divide-gray-50 dark:divide-white/5">
                          {preview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/3">
                              {preview.headers.map((h) => (
                                <td
                                  key={h}
                                  className="whitespace-nowrap px-3 py-1.5 text-gray-700 dark:text-gray-300"
                                >
                                  {String(row[h] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
