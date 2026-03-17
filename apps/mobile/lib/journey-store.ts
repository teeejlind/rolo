import { create } from "zustand";
import type { JourneyPlanResponse } from "./transit";

interface JourneyStore {
  latestPlan?: JourneyPlanResponse;
  selectedJourneyId?: string;
  setLatestPlan: (plan?: JourneyPlanResponse) => void;
  setSelectedJourneyId: (journeyId?: string) => void;
}

export const useJourneyStore = create<JourneyStore>((set) => ({
  latestPlan: undefined,
  selectedJourneyId: undefined,
  setLatestPlan: (plan) => set({ latestPlan: plan }),
  setSelectedJourneyId: (journeyId) => set({ selectedJourneyId: journeyId })
}));
