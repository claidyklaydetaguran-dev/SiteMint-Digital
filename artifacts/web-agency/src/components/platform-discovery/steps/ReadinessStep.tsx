import { useFormContext, Controller } from "react-hook-form";
import { ASSET_READINESS_STATUSES, PLATFORM_STATUSES } from "@workspace/discovery-contract";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

const ASSET_STATUS_LABELS: Record<(typeof ASSET_READINESS_STATUSES)[number], string> = {
  have_it: "We have it",
  in_progress: "In progress",
  need_help: "We need help with this",
  not_applicable: "Not applicable",
};

const PLATFORM_STATUS_LABELS: Record<(typeof PLATFORM_STATUSES)[number], string> = {
  have_it: "We have it",
  need_recommendation: "We'd like a recommendation",
  not_applicable: "Not applicable",
};

function AssetStatusField({
  name,
  label,
}: {
  name: "readiness.logoStatus" | "readiness.brandStatus" | "readiness.contentStatus" | "readiness.photoVideoStatus";
  label: string;
}) {
  const { control } = useFormContext<DiscoveryDraft>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Select value={field.value ?? undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_READINESS_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ASSET_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function PlatformStatusField({
  name,
  label,
}: {
  name: "readiness.domainStatus" | "readiness.hostingStatus";
  label: string;
}) {
  const { control } = useFormContext<DiscoveryDraft>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Select value={field.value ?? undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PLATFORM_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ReadinessStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <AssetStatusField name="readiness.logoStatus" label="Logo" />
      <AssetStatusField name="readiness.brandStatus" label="Brand assets (colors, fonts, style)" />
      <AssetStatusField name="readiness.contentStatus" label="Website content / copy" />
      <AssetStatusField name="readiness.photoVideoStatus" label="Photos / video" />

      <Controller
        control={control}
        name="readiness.referenceSites"
        render={({ field }) => (
          <div className="space-y-2">
            <Label>Websites you like the look of (optional, one per line)</Label>
            <Textarea
              rows={3}
              value={(field.value ?? []).join("\n")}
              onChange={(event) => {
                const lines = event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0);
                field.onChange(lines);
              }}
            />
          </div>
        )}
      />

      <div className="space-y-2">
        <Label>Design preferences (optional)</Label>
        <Textarea {...register("readiness.designPreferences", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Design things you want to avoid (optional)</Label>
        <Textarea {...register("readiness.designDislikes", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <PlatformStatusField name="readiness.domainStatus" label="Domain name" />
      <PlatformStatusField name="readiness.hostingStatus" label="Hosting" />

      <div className="space-y-2">
        <Label>Current website platform (optional)</Label>
        <Input {...register("readiness.currentPlatform", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Current CRM (optional)</Label>
        <Input {...register("readiness.currentCrm", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Current email provider (optional)</Label>
        <Input {...register("readiness.currentEmailProvider", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Scheduling tool in use (optional)</Label>
        <Input {...register("readiness.schedulingTool", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Anything that needs to be migrated? (optional)</Label>
        <Textarea {...register("readiness.migrationNeeds", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <Controller
        control={control}
        name="readiness.integrations"
        render={({ field }) => (
          <div className="space-y-2">
            <Label>Tools you'd like integrated (optional, comma separated)</Label>
            <Input
              value={(field.value ?? []).join(", ")}
              onChange={(event) => {
                const items = event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0);
                field.onChange(items);
              }}
            />
          </div>
        )}
      />

      <div className="space-y-2">
        <Label>Accessibility needs (optional)</Label>
        <Textarea {...register("readiness.accessibilityNeeds", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Language needs (optional)</Label>
        <Textarea {...register("readiness.languageNeeds", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Privacy or regulatory needs (optional)</Label>
        <Textarea {...register("readiness.privacyRegulatoryNeeds", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Who owns technical decisions on your side? (optional)</Label>
        <Input {...register("readiness.technicalOwner", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Who owns content on your side? (optional)</Label>
        <Input {...register("readiness.contentOwner", { setValueAs: toOptionalText })} />
      </div>
    </div>
  );
}
