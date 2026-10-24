import { useState } from "react"
import { NavLink } from "react-router-dom"
import { Home, LineChart, Package, Settings, Sparkles, Database, ShieldCheck } from "lucide-react"

const navItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/datasets", label: "My Datasets", icon: Database },
  { path: "/data-quality", label: "Data Quality & Cleaning", icon: ShieldCheck },
  { path: "/forecast", label: "Forecast", icon: LineChart },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`border-r border-border bg-card/95 backdrop-blur-3xl h-screen flex flex-col p-4 fixed left-0 top-0 z-50 overflow-hidden shadow-lg transition-[width] duration-200 ease-out ${
        isHovered ? "w-64" : "w-[72px]"
      }`}
    >
      <div className="flex items-center gap-3 px-2 py-4 mb-8 whitespace-nowrap">
        <div className="p-2 bg-primary/10 rounded-xl shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        {isHovered && (
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            SmartStock AI
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-2 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative px-3 py-3 rounded-xl flex items-center gap-4 text-sm font-medium transition-colors overflow-hidden ${
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
                {isHovered && (
                  <span className="whitespace-nowrap transition-opacity duration-150">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      
      {isHovered && (
        <div className="mt-auto px-4 py-6 text-xs text-muted-foreground/60 whitespace-nowrap">
          © 2026 SmartStock
        </div>
      )}
    </aside>
  )
}
