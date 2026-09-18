import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  plan: 'free' | 'pro' | 'team';
  email_verified?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        set({ user, token });
      },
      updateUser: (partialUser) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partialUser } : null,
        }));
      },
      clearAuth: () => {
        localStorage.removeItem('access_token');
        set({ user: null, token: null });
      },
    }),
    { name: 'klados-auth' }
  )
);
