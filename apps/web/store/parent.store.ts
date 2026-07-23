import { create } from 'zustand';

interface ParentState {
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
}

export const useParentStore = create<ParentState>((set) => ({
  selectedChildId: null,
  setSelectedChildId: (id) => set({ selectedChildId: id }),
}));
