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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token, rememberMe = true) => {
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
        set((state) => ({
          user: state.user ? { ...state.user, ...partialUser } : null,
        }));
      },
      clearAuth: () => {
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        set({ user: null, token: null });
      },
    }),
    { name: 'klados-auth' }
  )
);
