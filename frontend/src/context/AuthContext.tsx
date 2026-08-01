import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/axios';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, refresh: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    try {
      if (import.meta.env.DEV) console.log('[Auth] Fetching user profile...');
      const { data } = await api.get('/auth/me');
      if (import.meta.env.DEV) console.log('[Auth] User profile loaded:', data.email);
      setUser(data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('[Auth] Failed to fetch user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      if (import.meta.env.DEV) console.log('[Auth] Found existing token, hydrating state...');
      fetchUser();
    } else {
      if (import.meta.env.DEV) console.log('[Auth] No token found on mount');
      setIsLoading(false);
    }
  }, []);

  const login = async (access: string, refresh: string) => {
    if (import.meta.env.DEV) console.log('[Auth] Login successful, saving tokens...');
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    await fetchUser();
  };

  const logout = () => {
    if (import.meta.env.DEV) console.log('[Auth] Logging out, clearing all state and storage...');
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    window.location.href = '/login';
  };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      // Auto logout after 30 minutes of inactivity
      timeoutId = setTimeout(() => {
        if (localStorage.getItem('access_token')) {
          logout();
        }
      }, 30 * 60 * 1000); 
    };

    // Attach listeners for user activity
    window.addEventListener('mousemove', resetTimeout);
    window.addEventListener('keydown', resetTimeout);
    window.addEventListener('scroll', resetTimeout);
    window.addEventListener('click', resetTimeout);
    
    resetTimeout();

    // Axios interceptor for 401s
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          console.warn('[Auth] 401 Unauthorized detected. Logging out.');
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimeout);
      window.removeEventListener('keydown', resetTimeout);
      window.removeEventListener('scroll', resetTimeout);
      window.removeEventListener('click', resetTimeout);
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
