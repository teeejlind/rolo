import { create } from "zustand";

export type PlannerField = "from" | "to";

export interface PlannerSelection {
  id: string;
  kind: "stop" | "place" | "freeform";
  label: string;
  detail: string;
  kindLabel?: string;
  lat?: number;
  lon?: number;
  mapsQuery?: string;
  stopId?: string;
}

interface PlannerStore {
  activeField: PlannerField;
  from?: PlannerSelection;
  to?: PlannerSelection;
  setActiveField: (field: PlannerField) => void;
  setSelection: (field: PlannerField, selection: PlannerSelection) => void;
  setTrip: (from: PlannerSelection, to: PlannerSelection) => void;
  swap: () => void;
  clearField: (field: PlannerField) => void;
}

export const usePlannerStore = create<PlannerStore>((set) => ({
  activeField: "from",
  from: undefined,
  to: undefined,
  setActiveField: (field) => set({ activeField: field }),
  setSelection: (field, selection) =>
    set((state) => ({
      ...state,
      [field]: selection,
      activeField: field === "from" ? "to" : field
    })),
  setTrip: (from, to) =>
    set(() => ({
      from,
      to,
      activeField: "to"
    })),
  swap: () =>
    set((state) => ({
      from: state.to,
      to: state.from
    })),
  clearField: (field) =>
    set((state) => ({
      ...state,
      [field]: undefined
    }))
}));
