import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlannerSelection } from "./planner-store";
import type { StopDetail } from "./transit";

type SavedSlot = "home" | "work";

interface SavedStore {
  home?: PlannerSelection;
  work?: PlannerSelection;
  favorites: PlannerSelection[];
  pinnedStops: StopDetail[];
  setSlot: (slot: SavedSlot, selection: PlannerSelection) => void;
  clearSlot: (slot: SavedSlot) => void;
  saveFavorite: (selection: PlannerSelection) => void;
  removeFavorite: (selectionId: string) => void;
  isFavorite: (selectionId: string) => boolean;
  togglePinnedStop: (stop: StopDetail) => void;
  isPinnedStop: (stopId: string) => boolean;
}

export const useSavedStore = create<SavedStore>()(
  persist(
    (set, get) => ({
      home: undefined,
      work: undefined,
      favorites: [],
      pinnedStops: [],
      setSlot: (slot, selection) =>
        set((state) => ({
          ...state,
          [slot]: selection
        })),
      clearSlot: (slot) =>
        set((state) => ({
          ...state,
          [slot]: undefined
        })),
      saveFavorite: (selection) =>
        set((state) => ({
          favorites: [
            selection,
            ...state.favorites.filter((favorite) => favorite.id !== selection.id)
          ].slice(0, 12)
        })),
      removeFavorite: (selectionId) =>
        set((state) => ({
          favorites: state.favorites.filter((favorite) => favorite.id !== selectionId)
        })),
      isFavorite: (selectionId) =>
        get().favorites.some((favorite) => favorite.id === selectionId),
      togglePinnedStop: (stop) =>
        set((state) => {
          const alreadyPinned = state.pinnedStops.some(
            (pinnedStop) => pinnedStop.id === stop.id
          );
          return {
            pinnedStops: alreadyPinned
              ? state.pinnedStops.filter((pinnedStop) => pinnedStop.id !== stop.id)
              : [stop, ...state.pinnedStops].slice(0, 12)
          };
        }),
      isPinnedStop: (stopId) =>
        get().pinnedStops.some((pinnedStop) => pinnedStop.id === stopId)
    }),
    {
      name: "transito-bogota-saved-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        home: state.home,
        work: state.work,
        favorites: state.favorites,
        pinnedStops: state.pinnedStops
      })
    }
  )
);
