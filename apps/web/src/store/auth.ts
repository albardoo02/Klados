import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  plan: 'free' | 'pro' | 'team';
  is_root?: boolean;
  email_verified?: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string, rememberMe?: boolean) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function setCrossSubdomainCookie(name: string, value: string, days = 30) {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  let domainPart = '';
  // Check if domain is not an IP and has dots (e.g. klados.app, my.klados.app)
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && host.includes('.')) {
    const parts = host.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      domainPart = `; domain=.${rootDomain}`;
    }
  }
  const maxAge = days * 24 * 60 * 60;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (domainPart) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}${domainPart}; SameSite=Lax${secure}`;
  }
  // Also set path=/ without domain for current host / localhost fallback
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export function removeCrossSubdomainCookie(name: string) {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  let domainPart = '';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && host.includes('.')) {
    const parts = host.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      domainPart = `; domain=.${rootDomain}`;
    }
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (domainPart) {
    document.cookie = `${name}=; path=/; max-age=0${domainPart}; SameSite=Lax${secure}`;
  }
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

export function getInitialAuth(): { user: User | null; token: string | null } {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }
  let token: string | null = null;
  let user: User | null = null;

  // 1. Try localStorage / sessionStorage
  try {
    token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const storedUser = localStorage.getItem('klados_user') || sessionStorage.getItem('klados_user');
    if (storedUser) {
      user = JSON.parse(storedUser);
    }
  } catch {}

  // 2. Fallback to cookies (cross-subdomain session: .klados.app)
  if (!token) {
    token = getCookie('access_token');
  }
  if (!user) {
    const cookieUser = getCookie('klados_user');
    if (cookieUser) {
      try {
        user = JSON.parse(cookieUser);
      } catch {}
    }
  }

  // 3. Fallback to persisted klados-auth in localStorage
  if (!user || !token) {
    try {
      const persisted = localStorage.getItem('klados-auth');
      if (persisted) {
        const parsed = JSON.parse(persisted);
        if (parsed?.state) {
          if (!token && parsed.state.token) token = parsed.state.token;
          if (!user && parsed.state.user) user = parsed.state.user;
        }
      }
    } catch {}
  }

  // If token found from cookies, keep localStorage in sync
  if (token && typeof localStorage !== 'undefined') {
    try {
      if (!localStorage.getItem('access_token')) {
        localStorage.setItem('access_token', token);
      }
      if (user && !localStorage.getItem('klados_user')) {
        localStorage.setItem('klados_user', JSON.stringify(user));
      }
    } catch {}
  }

  return { user, token };
}

const initial = getInitialAuth();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: initial.user,
      token: initial.token,
      setAuth: (user, token, rememberMe = true) => {
        const days = rememberMe ? 30 : 1;
        setCrossSubdomainCookie('access_token', token, days);
        setCrossSubdomainCookie('klados_user', JSON.stringify(user), days);

        if (rememberMe) {
          try {
            localStorage.setItem('access_token', token);
            localStorage.setItem('klados_user', JSON.stringify(user));
            sessionStorage.removeItem('access_token');
            sessionStorage.removeItem('klados_user');
          } catch {}
        } else {
          try {
            sessionStorage.setItem('access_token', token);
            sessionStorage.setItem('klados_user', JSON.stringify(user));
            localStorage.removeItem('access_token');
            localStorage.removeItem('klados_user');
          } catch {}
        }
        set({ user, token });
      },
      updateUser: (partialUser) => {
        set((state) => {
          const updatedUser = state.user ? { ...state.user, ...partialUser } : null;
          if (updatedUser) {
            setCrossSubdomainCookie('klados_user', JSON.stringify(updatedUser), 30);
            try {
              if (localStorage.getItem('access_token')) {
                localStorage.setItem('klados_user', JSON.stringify(updatedUser));
              } else if (sessionStorage.getItem('access_token')) {
                sessionStorage.setItem('klados_user', JSON.stringify(updatedUser));
              }
            } catch {}
          }
          return { user: updatedUser };
        });
      },
      clearAuth: () => {
        removeCrossSubdomainCookie('access_token');
        removeCrossSubdomainCookie('klados_user');
        try {
          localStorage.removeItem('access_token');
          localStorage.removeItem('klados_user');
          sessionStorage.removeItem('access_token');
          sessionStorage.removeItem('klados_user');
        } catch {}
        set({ user: null, token: null });
      },
    }),
    {
      name: 'klados-auth',
      onRehydrateStorage: () => (state) => {
        // Hydration callback: ensure state syncs with cookies/storage without silent mutation
        const sync = getInitialAuth();
        if (sync.user || sync.token) {
          useAuthStore.setState({
            user: sync.user ?? state?.user ?? null,
            token: sync.token ?? state?.token ?? null,
          });
        }
      },
    }
  )
);

export function syncAuthFromCookies(): { user: User | null; token: string | null } {
  const auth = getInitialAuth();
  if (auth.user || auth.token) {
    useAuthStore.setState({
      user: auth.user,
      token: auth.token,
    });
  }
  return auth;
}

