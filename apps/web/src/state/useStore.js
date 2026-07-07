import { create } from "zustand";

export const useUiStore = create((set) => ({
  // Default sidebar open state depends on viewport width — keep it closed on small screens
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 980 : true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  openSidebar: () => set({ sidebarOpen: true }),
}));
