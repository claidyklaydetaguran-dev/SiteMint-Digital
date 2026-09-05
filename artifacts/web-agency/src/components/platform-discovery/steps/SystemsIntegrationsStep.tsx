import { useFormContext, Controller, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";
import { PlatformStatusField } from "./sharedFields";

/**
 * Step 5 of the reorganized (Checkpoint 2C.3) intake — "Systems and
 * integrations." Domain/hosting readiness, current platform (only relevant
 * once something already exists — hidden for a brand-new build per the
 * owner's conditional-branching directive), what's already in use, and
 * migration needs.
 *
 * The old step's three separate "what CRM/email provider/scheduling tool do
 * you use" fields asked essentially the same question three times — the
 * question audit folds them into the one open-ended "current tools" list
 * below instead (those three contract fields — readiness.currentCrm,
 * currentEmailProvider, schedulingTool — stay in the shared contract,
 * unused and optional, so nothing downstream that reads them breaks; they
 * simply no longer have a dedicated UI control).
 */
export function SystemsIntegrationsStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();
  const projectStage = useWatch({ control, name: "projectDirection.projectStage" });
  const hasExistingSystem = projectStage !== "new_build";

  return (
    <div className="space-y-6">
      <PlatformStatusField name="readiness.domainStatus" label="Domain name" />
      <PlatformStatusField name="readiness.hostingStatus" label="Hosting" />

      {hasExistingSystem && (
        <div className="dv5-alert-in space-y-2">
          <Label>Current website platform (optional)</Label>
          <Input {...register("readiness.currentPlatform", { setValueAs: toOptionalText })} placeholder="e.g. WordPress, Squarespace, custom-built" />
        </div>
      )}

      <Controller
        control={control}
        name="readiness.integrations"
        render={({ field }) => (
          <div className="space-y-2">
            <Label>Current tools and data you'd like connected (optional, comma separated)</Label>
            <Input
              value={(field.value ?? []).join(", ")}
              onChange={(event) => {
                const items = event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0);
                field.onChange(items);
              }}
              placeholder="e.g. QuickBooks, Mailchimp, Calendly, webhooks to your CRM"
            />
          </div>
        )}
      />

      {hasExistingSystem && (
        <div className="dv5-alert-in space-y-2">
          <Label>Anything that needs to be migrated from the current system? (optional)</Label>
          <Textarea {...register("readiness.migrationNeeds", { setValueAs: toOptionalText })} rows={2} />
        </div>
      )}
    </div>
  );
}
