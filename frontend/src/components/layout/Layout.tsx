import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { CommandPalette } from "../ui/CommandPalette"
import { TopNav } from "./TopNav"

export function Layout() {
  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      <Sidebar />
      <CommandPalette />
      
      <main className="flex-1 ml-[72px] overflow-y-auto z-10 relative flex flex-col h-screen">
        <TopNav />
        <div className="container mx-auto p-8 max-w-7xl flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
