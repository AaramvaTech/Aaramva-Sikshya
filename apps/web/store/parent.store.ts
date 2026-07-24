import { create } from 'zustand';

interface ParentState {
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
  /**
   * Logout hygiene (see portal-shell.tsx's handleLogout): resets the
   * selection so a same-tab login as a different parent always starts from
   * a clean slate, rather than relying solely on useSelectedChild()'s
   * self-healing effect. Mirrors useTenantStore's `clear()` naming.
   */
  clear: () => void;
}

export const useParentStore = create<ParentState>((set) => ({
  selectedChildId: null,
  setSelectedChildId: (id) => set({ selectedChildId: id }),
  clear: () => set({ selectedChildId: null }),
}));
