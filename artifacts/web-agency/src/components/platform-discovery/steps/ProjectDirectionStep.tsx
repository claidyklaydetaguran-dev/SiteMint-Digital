import { useFormContext, Controller } from "react-hook-form";
import { PROJECT_PRIMARY_TYPES } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoveryDraft } from "../discoveryFormModel";

const PRIMARY_TYPE_LABELS: Record<(typeof PROJECT_PRIMARY_TYPES)[number], string> = {
  new_website: "A brand-new website",
  redesign: "A redesign of an existing website",
  web_application: "A custom web application",
  customer_portal: "A customer portal or account area",
  internal_crm: "An internal CRM or lead management system",
  business_operations_system: "A business operations system",
  ai_receptionist: "An AI receptionist / call handling system",
  workflow_automation: "Workflow automation",
  seo_ai_search_visibility: "SEO and AI search visibility",
  maintenance_support: "Ongoing maintenance and support",
  multiple_connected_systems: "Multiple connected systems",
  not_sure_yet: "Not sure yet",
};

export function ProjectDirectionStep() {
  const { control } = useFormContext<DiscoveryDraft>();

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

      <div>
        <Label>Anything else you're also interested in? (optional)</Label>
        <Controller
          control={control}
          name="projectDirection.secondaryInterests"
          render={({ field }) => (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROJECT_PRIMARY_TYPES.map((type) => {
                const current = field.value ?? [];
                const checked = current.includes(type);
                return (
                  <label key={type} className="flex items-center gap-2 text-sm">
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
