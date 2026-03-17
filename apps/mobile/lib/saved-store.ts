import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { PlannerSelection } from "./planner-store";
import type { StopDetail } from "./transit";

type SavedSlot = "home" | "work";
type PersistedSavedState = Pick<
  SavedStore,
  "home" | "work" | "favorites" | "pinnedStops"
>;

interface SavedStore {
  home?: PlannerSelection;
  work?: PlannerSelection;
  favorites: PlannerSelection[];
  pinnedStops: StopDetail[];
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  setSlot: (slot: SavedSlot, selection: PlannerSelection) => void;
  clearSlot: (slot: SavedSlot) => void;
  saveFavorite: (selection: PlannerSelection) => void;
  removeFavorite: (selectionId: string) => void;
  isFavorite: (selectionId: string) => boolean;
  togglePinnedStop: (stop: StopDetail) => void;
  isPinnedStop: (stopId: string) => boolean;
}

const storageKey = "transito-bogota-saved-v1";

const defaultPersistedState: PersistedSavedState = {
  home: undefined,
  work: undefined,
  favorites: [],
  pinnedStops: []
};

export const useSavedStore = create<SavedStore>((set, get) => ({
  ...defaultPersistedState,
  hasHydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const parsed = raw ? parsePersistedState(raw) : undefined;
      set({
        ...defaultPersistedState,
        ...parsed,
        hasHydrated: true
      });
      return;
    } catch {
      // Ignore storage failures and keep the app usable.
    }

    set({ hasHydrated: true });
  },
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
}));

let hydrationStarted = false;

async function hydrateSavedStore() {
  if (hydrationStarted) {
    return;
  }

  hydrationStarted = true;
  await useSavedStore.getState().hydrate();
}

function parsePersistedState(raw: string): PersistedSavedState | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSavedState>;
    return {
      home: parsed.home,
      work: parsed.work,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      pinnedStops: Array.isArray(parsed.pinnedStops) ? parsed.pinnedStops : []
    };
  } catch {
    return undefined;
  }
}

function buildPersistedState(state: SavedStore): PersistedSavedState {
  return {
    home: state.home,
    work: state.work,
    favorites: state.favorites,
    pinnedStops: state.pinnedStops
  };
}

useSavedStore.subscribe((state) => {
  if (!state.hasHydrated) {
    return;
  }

  void AsyncStorage.setItem(storageKey, JSON.stringify(buildPersistedState(state)));
});

void hydrateSavedStore();
