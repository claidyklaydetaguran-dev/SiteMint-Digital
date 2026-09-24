import { useFormContext, Controller, type FieldPath } from "react-hook-form";
import { ASSET_READINESS_STATUSES, PLATFORM_STATUSES } from "@workspace/discovery-contract";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoveryDraft } from "../discoveryFormModel";

/**
 * Small field renderers shared across several of the reorganized (Checkpoint
 * 2C.3) steps. Extracted so the same asset-readiness / platform-readiness /
 * yes-no question renders identically wherever it now appears, instead of
 * being copy-pasted per step file the way the pre-reorganization steps did.
 */

export const ASSET_STATUS_LABELS: Record<(typeof ASSET_READINESS_STATUSES)[number], string> = {
  have_it: "We have it",
  in_progress: "In progress",
  need_help: "We need help with this",
  not_applicable: "Not applicable",
};

export const PLATFORM_STATUS_LABELS: Record<(typeof PLATFORM_STATUSES)[number], string> = {
  have_it: "We have it",
  need_recommendation: "We'd like a recommendation",
  not_applicable: "Not applicable",
};

type AssetStatusFieldName =
  | "readiness.logoStatus"
  | "readiness.brandStatus"
  | "readiness.contentStatus"
  | "readiness.photoVideoStatus";

export function AssetStatusField({ name, label }: { name: AssetStatusFieldName; label: string }) {
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

type PlatformStatusFieldName = "readiness.domainStatus" | "readiness.hostingStatus";

export function PlatformStatusField({ name, label }: { name: PlatformStatusFieldName; label: string }) {
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

type BooleanFieldName = FieldPath<DiscoveryDraft>;

export function YesNoField({ name, label }: { name: BooleanFieldName; label: string }) {
  const { control } = useFormContext<DiscoveryDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <RadioGroup
            value={field.value === true ? "yes" : field.value === false ? "no" : undefined}
            onValueChange={(value) => field.onChange(value === "yes")}
            className="dv5-pill-group"
          >
            <label className={"dv5-pill" + (field.value === true ? " dv5-pill--selected" : "")}>
              <RadioGroupItem value="yes" /> Yes
            </label>
            <label className={"dv5-pill" + (field.value === false ? " dv5-pill--selected" : "")}>
              <RadioGroupItem value="no" /> No
            </label>
          </RadioGroup>
          {fieldState.error && <p className="text-[0.8rem] font-medium text-destructive">{fieldState.error.message}</p>}
        </div>
      )}
    />
  );
}
