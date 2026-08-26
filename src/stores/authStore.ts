import { create } from "zustand";

export type AuthSnapshot = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  displayName: string;
  isAnonymous: boolean;
  mocked: boolean;
};

type AuthState = AuthSnapshot & {
  setReady: (ready: boolean) => void;
  setSession: (input: Partial<AuthSnapshot>) => void;
  clear: () => void;
};

const EMPTY: AuthSnapshot = {
  ready: false,
  userId: null,
  email: null,
  displayName: "",
  isAnonymous: false,
  mocked: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...EMPTY,
  setReady: (ready) => set({ ready }),
  setSession: (input) => set((state) => ({ ...state, ...input, ready: true })),
  clear: () => set({ ...EMPTY, ready: true }),
}));
