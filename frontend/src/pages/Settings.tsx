import { useEffect, useState } from "react"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Moon, Sun, User, Bell, Shield, Key } from "lucide-react"
import { useAuth } from "../context/AuthContext"

export function Settings() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark")
  const { user } = useAuth();

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage platform preferences and account details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Navigation Sidebar for settings (Visual only for mockup) */}
        <div className="col-span-1 space-y-2">
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-muted/80 text-foreground rounded-xl font-medium text-sm transition-colors border border-border">
                <User className="w-4 h-4 text-primary" /> Profile Settings
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl font-medium text-sm transition-colors">
                <Sun className="w-4 h-4" /> Appearance
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl font-medium text-sm transition-colors">
                <Bell className="w-4 h-4" /> Notifications
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl font-medium text-sm transition-colors">
                <Shield className="w-4 h-4" /> Security
            </button>
        </div>
        
        <div className="col-span-1 md:col-span-2 space-y-8">
            <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" /> Profile Information
                </h3>
                
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">First Name</label>
                            <input type="text" defaultValue={user?.first_name} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                            <input type="text" defaultValue={user?.last_name} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                        <input type="email" defaultValue={user?.email} disabled className="w-full bg-background/50 border border-border rounded-lg px-4 py-2 text-sm opacity-60 cursor-not-allowed" />
                    </div>
                </div>
            </Card>

            <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <Sun className="w-5 h-5 text-primary" /> Appearance
                </h3>
                
                <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium text-foreground">Theme Preference</p>
                    <p className="text-sm text-muted-foreground">Select your preferred interface theme.</p>
                </div>
                
                <div className="flex bg-muted/50 p-1 rounded-xl">
                    <button
                    onClick={() => setTheme("light")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        theme === "light" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                    >
                    <Sun className="w-4 h-4" /> Light
                    </button>
                    <button
                    onClick={() => setTheme("dark")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        theme === "dark" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                    >
                    <Moon className="w-4 h-4" /> Dark
                    </button>
                </div>
                </div>
            </Card>

            <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" /> Change Password
                </h3>
                
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Current Password</label>
                        <input type="password" placeholder="••••••••" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">New Password</label>
                        <input type="password" placeholder="••••••••" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors" />
                    </div>
                </div>
            </Card>
            
            <div className="flex justify-end pt-4">
                <Button>Save Changes</Button>
            </div>
        </div>
      </div>
    </div>
  )
}
