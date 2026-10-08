import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  plan: 'free' | 'pro' | 'team';
  is_root?: boolean;
  email_verified?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string, rememberMe?: boolean) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCrossSubdomainCookie(name: string, value: string, days = 30) {
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
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainPart}; max-age=${maxAge}; SameSite=Lax${secure}`;
  }
  // Also set path=/ without domain for current host / localhost fallback
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function removeCrossSubdomainCookie(name: string) {
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
  if (domainPart) {
    document.cookie = `${name}=; path=/${domainPart}; max-age=0; SameSite=Lax`;
  }
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token, rememberMe = true) => {
        const days = rememberMe ? 30 : 1;
        setCrossSubdomainCookie('access_token', token, days);
        setCrossSubdomainCookie('klados_user', JSON.stringify(user), days);

        // rememberMe=true → localStorage（30日保持）
        // rememberMe=false → sessionStorage（ブラウザを閉じたらログアウト）
        if (rememberMe) {
          localStorage.setItem('access_token', token);
          sessionStorage.removeItem('access_token');
        } else {
          sessionStorage.setItem('access_token', token);
          localStorage.removeItem('access_token');
        }
        set({ user, token });
      },
      updateUser: (partialUser) => {
        set((state) => {
          const updatedUser = state.user ? { ...state.user, ...partialUser } : null;
          if (updatedUser) {
            setCrossSubdomainCookie('klados_user', JSON.stringify(updatedUser), 30);
          }
          return { user: updatedUser };
        });
      },
      clearAuth: () => {
        removeCrossSubdomainCookie('access_token');
        removeCrossSubdomainCookie('klados_user');
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        set({ user: null, token: null });
      },
    }),
    {
      name: 'klados-auth',
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.token) {
            const cookieToken = getCookie('access_token');
            if (cookieToken) {
              state.token = cookieToken;
              try {
                localStorage.setItem('access_token', cookieToken);
              } catch {}
            }
          }
          if (!state.user) {
            const cookieUser = getCookie('klados_user');
            if (cookieUser) {
              try {
                state.user = JSON.parse(cookieUser);
              } catch {}
            }
          }
        }
      },
    }
  )
);
