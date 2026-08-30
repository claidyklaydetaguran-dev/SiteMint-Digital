import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { businessGoals, type BusinessGoal } from "./businessGoals";

export type SystemMode = "connected" | "disconnected";

interface GoalContextValue {
  goals: BusinessGoal[];
  selectedGoal: BusinessGoal;
  selectedGoalId: string;
  selectGoal: (id: string) => void;
  /** Connected/Disconnected control (Checkpoint 2A.2) — a single shared
   * state so EcosystemVisual (where the control lives) and
   * SiteMintDifferenceSection (which reads it) never render two competing
   * toggles for the same comparison. */
  systemMode: SystemMode;
  setSystemMode: (mode: SystemMode) => void;
}

const GoalContext = createContext<GoalContextValue | null>(null);

/**
 * Coordinates the homepage's signature interaction. A single selection here
 * (see BusinessGoalSelector) drives every dependent area — ecosystem-stage
 * emphasis, workflow-step emphasis, recommended product/service badges,
 * the AI Receptionist demo scenario, and the contextual CTA — from the one
 * data source in businessGoals.ts. Also holds the Connected/Disconnected
 * system-mode toggle, shared for the same reason.
 */
export function PlatformPreviewGoalProvider({ children }: { children: ReactNode }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(businessGoals[0].id);
  const [systemMode, setSystemMode] = useState<SystemMode>("connected");

  const value = useMemo<GoalContextValue>(() => {
    const selectedGoal = businessGoals.find((goal) => goal.id === selectedGoalId) ?? businessGoals[0];
    return {
      goals: businessGoals,
      selectedGoal,
      selectedGoalId,
      selectGoal: setSelectedGoalId,
      systemMode,
      setSystemMode,
    };
  }, [selectedGoalId, systemMode]);

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

export function useSelectedGoal(): GoalContextValue {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error("useSelectedGoal must be used within PlatformPreviewGoalProvider");
  }
  return context;
}
