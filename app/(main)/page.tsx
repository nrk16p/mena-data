"use client"

import Link from "next/link"
import {
  MapPin,
  Truck,
  Users,
  Route,
  ArrowUpRight,
  Database,
  Activity,
  Layers,
} from "lucide-react"

type Module = {
  href: string
  label: string
  description: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  tag: string
  tagColor: string
  status: "active" | "coming-soon"
}

type ModuleGroup = {
  group: string
  accent: string
  modules: Module[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: "Master Data",
    accent: "bg-blue-500",
    modules: [
      {
        href: "/locations",
        label: "Location Master",
        description:
          "Sync and manage all location data from ATMS — plants, customers, depots, and delivery points.",
        icon: MapPin,
        iconBg: "bg-blue-50 dark:bg-blue-950/40",
        iconColor: "text-blue-600 dark:text-blue-400",
        tag: "Sync",
        tagColor:
          "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
        status: "active",
      },
      {
        href: "/trucks",
        label: "Truck Master",
        description:
          "Fleet registry — license plates, types, capacities, and assignment status across all vehicles.",
        icon: Truck,
        iconBg: "bg-gray-100 dark:bg-white/5",
        iconColor: "text-gray-400",
        tag: "Soon",
        tagColor: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500",
        status: "coming-soon",
      },
      {
        href: "/drivers",
        label: "Driver Master",
        description:
          "Driver profiles, license classes, assignments, and compliance tracking.",
        icon: Users,
        iconBg: "bg-gray-100 dark:bg-white/5",
        iconColor: "text-gray-400",
        tag: "Soon",
        tagColor: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500",
        status: "coming-soon",
      },
      {
        href: "/routes",
        label: "Route Master",
        description:
          "Predefined routes, distance mapping, and zone configurations for transport planning.",
        icon: Route,
        iconBg: "bg-gray-100 dark:bg-white/5",
        iconColor: "text-gray-400",
        tag: "Soon",
        tagColor: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500",
        status: "coming-soon",
      },
    ],
  },
]

const STATS = [
  { icon: Layers, label: "Modules", value: "1" },
  { icon: Database, label: "Data Source", value: "ATMS" },
  { icon: Activity, label: "Status", value: "Live" },
]

export default function HomePage() {
  return (
    <div className="min-h-full max-w-5xl mx-auto space-y-12 pb-16">
      {/* Hero */}
      <div className="pt-4 space-y-6">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Internal Platform · Mena Transport
          </span>

          <h1 className="text-[2.5rem] font-bold tracking-tight leading-[1.15] text-gray-950 dark:text-white">
            Mena Data<br />
            <span className="text-gray-400 dark:text-gray-500">Platform</span>
          </h1>

          <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
            Master data management — locations, trucks, drivers, and routes
            synced directly from ATMS for Mena Transport operations.
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-4 py-2.5"
            >
              <Icon size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                {value}
              </span>
              <span className="text-[12px] text-gray-400 dark:text-gray-500">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Module groups */}
      <div className="space-y-10">
        {MODULE_GROUPS.map(({ group, accent, modules }) => (
          <section key={group}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-2.5 w-2.5 rounded-full ${accent}`} />
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {group}
              </h2>
              <div className="flex-1 h-px bg-gray-100 dark:bg-white/6" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {modules.map((mod) => {
                const Icon = mod.icon
                const isComingSoon = mod.status === "coming-soon"

                const card = (
                  <div
                    className={`
                      group relative flex flex-col rounded-2xl border p-5 transition-all duration-200
                      ${isComingSoon
                        ? "border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/2 opacity-60 cursor-default"
                        : "border-gray-200 dark:border-white/8 bg-white dark:bg-[#161b27] hover:border-gray-300 dark:hover:border-white/15 hover:shadow-lg hover:shadow-gray-100 dark:hover:shadow-black/30 hover:-translate-y-0.5 cursor-pointer"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.iconBg}`}>
                        <Icon size={18} className={mod.iconColor} />
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${mod.tagColor}`}>
                        {mod.tag}
                      </span>
                    </div>

                    <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white mb-1.5">
                      {mod.label}
                    </h3>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
                      {mod.description}
                    </p>

                    {!isComingSoon && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">Live</span>
                        </div>
                        <div className="flex items-center gap-1 text-[12px] font-medium text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                          Open
                          <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                      </div>
                    )}

                    {isComingSoon && (
                      <div className="mt-4">
                        <span className="text-[11px] text-gray-400 dark:text-gray-600">Coming soon</span>
                      </div>
                    )}
                  </div>
                )

                return isComingSoon ? (
                  <div key={mod.label}>{card}</div>
                ) : (
                  <Link key={mod.href} href={mod.href} className="block">
                    {card}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
