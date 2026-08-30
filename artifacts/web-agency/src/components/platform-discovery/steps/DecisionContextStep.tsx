import { useFormContext, Controller } from "react-hook-form";
import { PROJECT_GOALS } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

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

export function DecisionContextStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="decisionContext.currentSituation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>What's your current situation?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="decisionContext.primaryProblem"
        render={({ field }) => (
          <FormItem>
            <FormLabel>What's the main problem you're trying to solve?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>How does this affect your customers? (optional)</Label>
        <Textarea {...register("decisionContext.customerImpact", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>How does this affect your team? (optional)</Label>
        <Textarea {...register("decisionContext.teamImpact", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>What manual work does this create today? (optional)</Label>
        <Textarea {...register("decisionContext.currentManualWork", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Any missed opportunities because of this? (optional)</Label>
        <Textarea {...register("decisionContext.missedOpportunities", { setValueAs: toOptionalText })} rows={2} />
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

      <div className="space-y-2">
        <Label>Is there a specific event driving the timing? (optional)</Label>
        <Input {...register("decisionContext.urgencyTrigger", { setValueAs: toOptionalText })} />
      </div>

      <Controller
        control={control}
        name="decisionContext.consequenceOfDelay"
        render={({ field }) => {
          const isNotApplicable = field.value === null;
          return (
            <div className="space-y-2">
              <Label>What happens if this is delayed? (optional)</Label>
              <Textarea
                value={isNotApplicable ? "" : (field.value ?? "")}
                onChange={(event) => field.onChange(toOptionalText(event.target.value))}
                disabled={isNotApplicable}
                rows={2}
              />
              <label className="flex items-center gap-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">
                <Checkbox
                  checked={isNotApplicable}
                  onCheckedChange={(checked) => field.onChange(checked ? null : undefined)}
                />
                Not applicable — no meaningful consequence of delay
              </label>
            </div>
          );
        }}
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
        name="decisionContext.successDefinition"
        render={({ field }) => (
          <FormItem>
            <FormLabel>How will you know this project succeeded?</FormLabel>
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
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROJECT_GOALS.map((goal) => {
                const current = field.value ?? [];
                const checked = current.includes(goal);
                return (
                  <label key={goal} className="flex items-center gap-2 text-sm">
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
