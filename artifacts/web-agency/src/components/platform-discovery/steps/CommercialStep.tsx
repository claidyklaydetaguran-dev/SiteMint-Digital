import { useFormContext, Controller } from "react-hook-form";
import { LAUNCH_WINDOWS, INVESTMENT_RANGES, SUPPORT_MODEL_PREFERENCES } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalDate, toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

const LAUNCH_WINDOW_LABELS: Record<(typeof LAUNCH_WINDOWS)[number], string> = {
  asap: "As soon as possible",
  within_1_3_months: "Within 1–3 months",
  within_3_6_months: "Within 3–6 months",
  "6_plus_months": "6+ months out",
  not_sure: "Not sure yet",
};

const INVESTMENT_RANGE_LABELS: Record<(typeof INVESTMENT_RANGES)[number], string> = {
  starter: "Starter",
  growth: "Growth",
  premium: "Premium",
  custom: "Custom",
  not_sure: "Not sure yet",
};

const SUPPORT_MODEL_LABELS: Record<(typeof SUPPORT_MODEL_PREFERENCES)[number], string> = {
  ongoing_retainer: "Ongoing retainer",
  as_needed: "As-needed support",
  self_managed: "We'll manage it ourselves",
  not_sure: "Not sure yet",
};

function YesNoField({
  name,
  label,
}: {
  name: "commercial.investmentApproved" | "commercial.vendorProcurementInvolved";
  label: string;
}) {
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
            className="flex flex-row gap-6"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="yes" /> Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="no" /> No
            </label>
          </RadioGroup>
          {fieldState.error && <p className="text-[0.8rem] font-medium text-destructive">{fieldState.error.message}</p>}
        </div>
      )}
    />
  );
}

export function CommercialStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="commercial.launchWindow"
        render={({ field }) => (
          <FormItem>
            <FormLabel>When would you like to launch?</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {LAUNCH_WINDOWS.map((window) => (
                    <SelectItem key={window} value={window}>
                      {LAUNCH_WINDOW_LABELS[window]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Controller
        control={control}
        name="commercial.targetDate"
        render={({ field }) => {
          const isNoDateYet = field.value === null;
          return (
            <div className="space-y-2">
              <Label>Target date (optional)</Label>
              <Input
                type="date"
                value={isNoDateYet ? "" : (field.value ?? "")}
                disabled={isNoDateYet}
                onChange={(event) => field.onChange(toOptionalDate(event.target.value))}
              />
              <label className="flex items-center gap-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">
                <Checkbox checked={isNoDateYet} onCheckedChange={(checked) => field.onChange(checked ? null : undefined)} />
                No target date yet
              </label>
            </div>
          );
        }}
      />

      <Controller
        control={control}
        name="commercial.dateFlexibility"
        render={({ field }) => (
          <div className="space-y-2">
            <Label>How firm is that date? (optional)</Label>
            <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="flex flex-row gap-6">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="firm" /> Firm
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="flexible" /> Flexible
              </label>
            </RadioGroup>
          </div>
        )}
      />

      <div className="space-y-2">
        <Label>What's driving that date? (optional)</Label>
        <Input {...register("commercial.deadlineReason", { setValueAs: toOptionalText })} />
      </div>

      <FormField
        control={control}
        name="commercial.investmentRange"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Investment range</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {INVESTMENT_RANGES.map((range) => (
                    <SelectItem key={range} value={range}>
                      {INVESTMENT_RANGE_LABELS[range]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <YesNoField name="commercial.investmentApproved" label="Has this investment been approved?" />

      <FormField
        control={control}
        name="commercial.decisionMakers"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Who is involved in the decision?</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>Who gives final approval? (optional)</Label>
        <Input {...register("commercial.finalApprover", { setValueAs: toOptionalText })} />
      </div>

      <YesNoField name="commercial.vendorProcurementInvolved" label="Is a vendor/procurement process involved?" />

      <FormField
        control={control}
        name="commercial.supportModelPreference"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Ongoing support preference (optional)</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_MODEL_PREFERENCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SUPPORT_MODEL_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>When are you available for a discovery call? (optional)</Label>
        <Input {...register("commercial.discoveryAvailability", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Preferred start period (optional)</Label>
        <Input {...register("commercial.preferredStartPeriod", { setValueAs: toOptionalText })} />
      </div>
    </div>
  );
}
