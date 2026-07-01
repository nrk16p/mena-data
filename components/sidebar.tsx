"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { signOut, useSession } from "next-auth/react"
import {
  MapPin,
  Truck,
  Users,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Route,
  FileOutput,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
  soon?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/locations", label: "Location Master", icon: MapPin },
      { href: "/trucks", label: "Truck Master", icon: Truck, soon: true },
      { href: "/drivers", label: "Driver Master", icon: Users, soon: true },
      { href: "/routes", label: "Route Master", icon: Route, soon: true },
    ],
  },
  {
    label: "LD Pipelines",
    items: [
      { href: "/ld", label: "Asia", icon: FileOutput },
      { href: "/cpac", label: "CPAC", icon: FileOutput },
      { href: "/scco", label: "SCCO", icon: FileOutput },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const userName = session?.user?.name?.split(" ")[0] ?? "User"
  const userEmail = session?.user?.email ?? ""

  return (
    <aside
      className={`
        relative flex h-screen flex-col shrink-0
        border-r border-gray-200 dark:border-white/8
        bg-white dark:bg-[#0f1117]
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[56px]" : "w-[220px]"}
      `}
    >
      {/* Logo */}
      <div
        className={`flex h-14 items-center border-b border-gray-200 dark:border-white/8 ${
          collapsed ? "justify-center px-0" : "justify-between px-4"
        }`}
      >
        {!collapsed ? (
          <>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm">
                M
              </div>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
                  Mena Data
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  Data Platform
                </p>
              </div>
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-600 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          </>
        ) : (
          <button onClick={() => setCollapsed(false)} className="group flex flex-col items-center gap-0.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm">
              M
            </div>
            <ChevronRight size={10} className="text-gray-400 group-hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href, item.exact)

                return (
                  <Link
                    key={item.href}
                    href={item.soon ? "#" : item.href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium transition-all duration-150
                      ${collapsed ? "justify-center px-0" : "px-2.5"}
                      ${item.soon
                        ? "opacity-40 cursor-default pointer-events-none text-gray-400 dark:text-gray-600"
                        : active
                          ? "bg-gray-950 dark:bg-white text-white dark:text-gray-900"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/6 hover:text-gray-900 dark:hover:text-white"
                      }
                    `}
                  >
                    <Icon size={15} className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {!collapsed && item.soon && (
                      <span className="text-[9px] font-semibold bg-gray-100 dark:bg-white/8 text-gray-400 px-1.5 py-0.5 rounded-full">
                        Soon
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-white/8 px-2 py-3 space-y-1">
        <ThemeToggle collapsed={collapsed} />

        {!collapsed && (
          <div className="px-2.5 pt-2 pb-1">
            <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate">
              {userName}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{userEmail}</p>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Logout" : undefined}
          className={`
            flex items-center gap-2.5 rounded-lg py-2 w-full text-[13px] font-medium transition-all duration-150
            text-gray-400 dark:text-gray-500
            hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400
            ${collapsed ? "justify-center px-0" : "px-2.5"}
          `}
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
