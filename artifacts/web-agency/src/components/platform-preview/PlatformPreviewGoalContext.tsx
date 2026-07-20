import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { businessGoals, type BusinessGoal } from "./businessGoals";

interface GoalContextValue {
  goals: BusinessGoal[];
  selectedGoal: BusinessGoal;
  selectedGoalId: string;
  selectGoal: (id: string) => void;
}

const GoalContext = createContext<GoalContextValue | null>(null);

/**
 * Coordinates the homepage's signature interaction. A single selection here
 * (see BusinessGoalSelector) drives every dependent area — ecosystem-stage
 * emphasis, workflow-step emphasis, recommended product/service badges, and
 * the contextual CTA — from the one data source in businessGoals.ts.
 */
export function PlatformPreviewGoalProvider({ children }: { children: ReactNode }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(businessGoals[0].id);

  const value = useMemo<GoalContextValue>(() => {
    const selectedGoal = businessGoals.find((goal) => goal.id === selectedGoalId) ?? businessGoals[0];
    return {
      goals: businessGoals,
      selectedGoal,
      selectedGoalId,
      selectGoal: setSelectedGoalId,
    };
  }, [selectedGoalId]);

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

export function useSelectedGoal(): GoalContextValue {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error("useSelectedGoal must be used within PlatformPreviewGoalProvider");
  }
  return context;
}
