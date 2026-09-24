import { useFormContext, Controller, useWatch } from "react-hook-form";
import { BUSINESS_STAGES, TEAM_SIZE_RANGES, PROJECT_GOALS } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalText, toOptionalUrl, type DiscoveryDraft } from "../discoveryFormModel";

const BUSINESS_STAGE_LABELS: Record<(typeof BUSINESS_STAGES)[number], string> = {
  preparing_to_launch: "Preparing to launch",
  newly_operating: "Newly operating",
  established: "Established",
  growing: "Growing",
  rebranding: "Rebranding",
  replacing_existing_system: "Replacing an existing system",
  expanding_new_market: "Expanding into a new market",
};

const TEAM_SIZE_LABELS: Record<(typeof TEAM_SIZE_RANGES)[number], string> = {
  solo: "Just me",
  "2_10": "2–10 people",
  "11_50": "11–50 people",
  "51_200": "51–200 people",
  "200_plus": "200+ people",
};

const PROJECT_GOAL_LABELS: Record<(typeof PROJECT_GOALS)[number], string> = {
  increase_leads: "Increase leads",
  improve_customer_experience: "Improve customer experience",
  reduce_manual_work: "Reduce manual work",
  modernize_technology: "Modernize technology",
  launch_new_offering: "Launch a new offering",
  improve_online_visibility: "Improve online visibility",
  consolidate_systems: "Consolidate systems",
  support_growth: "Support growth",
  improve_data_visibility: "Improve data visibility",
  other: "Other",
};

/**
 * Step 2 of the reorganized (Checkpoint 2C.3) intake — "Business and
 * audience." Carries the business/audience questions from the old
 * "Business and Audience" step plus the essential situation/goals questions
 * that used to live in their own "Current Situation and Goals" step —
 * folded in here per the owner's question audit (the old step's remaining
 * fields — primaryProblem, successDefinition, urgencyTrigger,
 * consequenceOfDelay, teamImpact, currentManualWork, missedOpportunities —
 * were redundant with what's asked here and are no longer asked in the UI;
 * see the checkpoint's before/after question map).
 *
 * `business.currentWebsite` only makes sense once there's an existing site
 * to look at, so it's hidden entirely for a brand-new build (conditional
 * branching per the owner's "the system already knows" directive).
 */
export function BusinessAudienceStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();
  const projectStage = useWatch({ control, name: "projectDirection.projectStage" });
  const showCurrentWebsite = projectStage !== "new_build";

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="business.organizationName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization name</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="business.industry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Industry</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="e.g. Real estate, legal, healthcare" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {showCurrentWebsite && (
        <div className="dv5-alert-in space-y-2">
          <Label>Current website (optional)</Label>
          <Input {...register("business.currentWebsite", { setValueAs: toOptionalUrl })} placeholder="https://" />
        </div>
      )}

      <div className="space-y-2">
        <Label>Service area (optional)</Label>
        <Input {...register("business.serviceArea", { setValueAs: toOptionalText })} />
      </div>

      <FormField
        control={control}
        name="business.primaryAudience"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Who is your primary audience or customer?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>Secondary audience (optional)</Label>
        <Textarea {...register("business.secondaryAudience", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <FormField
        control={control}
        name="business.businessStage"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Business stage</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {BUSINESS_STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="business.teamSizeRange"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Team size</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZE_RANGES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {TEAM_SIZE_LABELS[size]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="decisionContext.currentSituation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>What's your current situation, and what's the main problem you're trying to solve?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>How does this affect your customers or team day to day? (optional)</Label>
        <Textarea {...register("decisionContext.customerImpact", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <FormField
        control={control}
        name="decisionContext.whyNow"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Why is now the right time for this project?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="decisionContext.desiredOutcome"
        render={({ field }) => (
          <FormItem>
            <FormLabel>What outcome are you hoping for?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="decisionContext.primaryGoal"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Primary goal</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_GOALS.map((goal) => (
                    <SelectItem key={goal} value={goal}>
                      {PROJECT_GOAL_LABELS[goal]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <Label>Secondary goals (optional)</Label>
        <Controller
          control={control}
          name="decisionContext.secondaryGoals"
          render={({ field }) => (
            <div className="dv5-option-grid dv5-option-grid--2col mt-2">
              {PROJECT_GOALS.map((goal) => {
                const current = field.value ?? [];
                const checked = current.includes(goal);
                return (
                  <label
                    key={goal}
                    className={"dv5-option-card" + (checked ? " dv5-option-card--selected" : "")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(isChecked) => {
                        if (isChecked) {
                          field.onChange([...current, goal]);
                        } else {
                          field.onChange(current.filter((value) => value !== goal));
                        }
                      }}
                    />
                    {PROJECT_GOAL_LABELS[goal]}
                  </label>
                );
              })}
            </div>
          )}
        />
      </div>
    </div>
  );
}
