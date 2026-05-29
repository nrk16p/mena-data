import { Sidebar } from "@/components/sidebar"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a10]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
    </div>
  )
}
