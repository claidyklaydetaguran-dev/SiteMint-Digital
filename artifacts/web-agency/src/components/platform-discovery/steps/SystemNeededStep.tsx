import { useFormContext, Controller, useWatch } from "react-hook-form";
import { PROJECT_PRIMARY_TYPES } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoveryDraft } from "../discoveryFormModel";

const PRIMARY_TYPE_LABELS: Record<(typeof PROJECT_PRIMARY_TYPES)[number], string> = {
  new_website: "A website",
  redesign: "A redesign of an existing website",
  web_application: "A custom web application",
  customer_portal: "A customer portal or account area",
  internal_crm: "An internal CRM or lead management system",
  business_operations_system: "A business operations system",
  ai_receptionist: "An AI receptionist / call handling system",
  workflow_automation: "Workflow automation",
  seo_ai_search_visibility: "SEO and AI search visibility",
  maintenance_support: "Ongoing maintenance and support",
  multiple_connected_systems: "A combination of systems",
  not_sure_yet: "Not sure yet",
};

/**
 * Step 1 of the reorganized (Checkpoint 2C.3) intake — "System or service
 * needed." Distinct from step 0's "starting point" question: this is about
 * *what kind* of system, independent of whether it's new or existing.
 * Selecting "AI receptionist" here intentionally shows nothing beyond this
 * step's own two fields — full configuration is a separate, later
 * conversation, not part of this brief (owner-directed conditional
 * branching: "short interest block, not full config").
 */
export function SystemNeededStep() {
  const { control } = useFormContext<DiscoveryDraft>();
  const primaryType = useWatch({ control, name: "projectDirection.primaryType" });

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="projectDirection.primaryType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>What best describes what you need?</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the closest match" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_PRIMARY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PRIMARY_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {primaryType === "ai_receptionist" && (
        <p className="dv5-alert-in rounded-md border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-bg-subtle))] p-3 text-sm text-[hsl(var(--sm-color-text-secondary))]">
          Good to know — we'll follow up with AI Receptionist specifics separately. No need to configure call flows or
          scripts here.
        </p>
      )}

      <div>
        <Label>Anything else you're also interested in? (optional)</Label>
        <Controller
          control={control}
          name="projectDirection.secondaryInterests"
          render={({ field }) => (
            <div className="dv5-option-grid dv5-option-grid--2col mt-2">
              {PROJECT_PRIMARY_TYPES.map((type) => {
                const current = field.value ?? [];
                const checked = current.includes(type);
                return (
                  <label
                    key={type}
                    className={"dv5-option-card" + (checked ? " dv5-option-card--selected" : "")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(isChecked) => {
                        if (isChecked) {
                          field.onChange([...current, type]);
                        } else {
                          field.onChange(current.filter((value) => value !== type));
                        }
                      }}
                    />
                    {PRIMARY_TYPE_LABELS[type]}
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
