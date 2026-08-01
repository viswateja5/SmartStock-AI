import { useState } from 'react';
import { Search, Bell, User, Settings, HelpCircle, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function TopNav() {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  return (
    <div className="w-full h-16 border-b border-border/50 bg-background/50 backdrop-blur-xl sticky top-0 z-40 flex items-center justify-between px-8">
      <div className="flex-1 max-w-md">
        <button 
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
          className="w-full flex items-center justify-between px-4 py-2 bg-muted/50 hover:bg-muted border border-border/50 rounded-xl text-muted-foreground text-sm transition-colors"
        >
          <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Search globally...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] font-medium opacity-50"><span className="text-xs">⌘</span>K</kbd>
        </button>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-12 right-0 w-80 bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col z-50"
              >
                <div className="px-4 py-3 border-b border-border/50 flex justify-between items-center">
                  <p className="text-sm font-semibold text-foreground">Notifications</p>
                  <span className="text-xs text-primary cursor-pointer hover:underline">Mark all as read</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <div className="p-4 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-foreground">Model Training Completed</p>
                    <p className="text-xs text-muted-foreground mt-1">Prophet achieved the highest accuracy for the Retail Sales dataset.</p>
                    <p className="text-[10px] text-muted-foreground mt-2">Just now</p>
                  </div>
                  <div className="p-4 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-foreground">Export Finished</p>
                    <p className="text-xs text-muted-foreground mt-1">Your Enterprise PDF Report is ready for download.</p>
                    <p className="text-[10px] text-muted-foreground mt-2">2 hours ago</p>
                  </div>
                  <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-foreground">Upload Complete</p>
                    <p className="text-xs text-muted-foreground mt-1">Dataset 'Retail_Sales_Q3.csv' processed successfully.</p>
                    <p className="text-[10px] text-muted-foreground mt-2">Yesterday</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="p-1.5 bg-muted border border-border rounded-full hover:bg-muted/80 transition-colors flex items-center justify-center w-8 h-8"
          >
            <User className="w-4 h-4 text-foreground" />
          </button>
          
          <AnimatePresence>
            {showUserMenu && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-12 right-0 w-48 bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col py-1"
              >
                <div className="px-4 py-2 border-b border-border/50">
                  <p className="text-sm font-medium text-foreground">{user?.first_name} {user?.last_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <button onClick={() => { setShowUserMenu(false); navigate('/settings'); }} className="flex items-center gap-3 px-4 py-2 hover:bg-muted text-sm text-left transition-colors text-muted-foreground hover:text-foreground mt-1">
                  <User className="w-4 h-4" /> Profile
                </button>
                <button onClick={() => { setShowUserMenu(false); navigate('/settings'); }} className="flex items-center gap-3 px-4 py-2 hover:bg-muted text-sm text-left transition-colors text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4" /> Settings
                </button>
                <button onClick={() => setShowUserMenu(false)} className="flex items-center gap-3 px-4 py-2 hover:bg-muted text-sm text-left transition-colors text-muted-foreground hover:text-foreground">
                  <HelpCircle className="w-4 h-4" /> Help
                </button>
                <div className="h-px bg-border/50 my-1"></div>
                <button 
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                    import('react-hot-toast').then(toast => toast.default.success("You have been securely logged out."));
                  }} 
                  className="flex items-center gap-3 px-4 py-2 hover:bg-rose-500/10 text-sm text-left transition-colors text-rose-500"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
