import { useFormContext } from "react-hook-form";
import { PROJECT_STAGES } from "@workspace/discovery-contract";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoveryDraft } from "../discoveryFormModel";

const PROJECT_STAGE_LABELS: Record<(typeof PROJECT_STAGES)[number], string> = {
  new_build: "A brand-new project — nothing exists yet",
  redesign: "A redesign of something that already exists",
  upgrade: "An upgrade to an existing system",
  extension: "An extension — adding to something that already works",
  not_sure: "Not sure yet",
};

/**
 * Step 0 of the reorganized (Checkpoint 2C.3) intake — "Project starting
 * point." Two questions only, deliberately kept short: what stage the
 * project is starting from, and a one-line description of the business.
 * Everything else about the business (audience, stage, team size, etc.)
 * moves to the "Business and audience" step later in the flow.
 */
export function ProjectStartingPointStep() {
  const { control } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="projectDirection.projectStage"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Where are you starting from?</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the closest match" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {PROJECT_STAGE_LABELS[stage]}
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
        name="business.description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>In a sentence or two, what does your business do?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={4} placeholder="e.g. We're a family-owned HVAC company serving the Portland metro area." />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
