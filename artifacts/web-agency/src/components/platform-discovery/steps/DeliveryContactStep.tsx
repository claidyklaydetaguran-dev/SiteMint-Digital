import { useFormContext, Controller, useWatch } from "react-hook-form";
import {
  LAUNCH_WINDOWS,
  INVESTMENT_RANGES,
  SUPPORT_MODEL_PREFERENCES,
  PREFERRED_CONTACT_METHODS,
} from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalDate, toOptionalPhone, toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";
import { YesNoField } from "./sharedFields";

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

const CONTACT_METHOD_LABELS: Record<(typeof PREFERRED_CONTACT_METHODS)[number], string> = {
  email: "Email",
  phone: "Phone",
  either: "Either is fine",
};

/**
 * Step 7 of the reorganized (Checkpoint 2C.3) intake — "Delivery, budget,
 * and contact." Merges the old "Timeline, Investment, and Decision Process"
 * and "Contact and Consent" steps into one delivery-facing conversation,
 * ending in the same consent block the form has always required before the
 * review screen.
 *
 * `dateFlexibility` / `deadlineReason` are hidden until a target date is
 * actually set — asking "how firm is that date" before there's a date to be
 * firm about was one of the audit's "configuration detail asked too early"
 * findings. `discoveryAvailability` and `preferredStartPeriod` (old fields)
 * are no longer asked here at all — both duplicated, in slightly different
 * words, questions this step already asks (`contact.preferredContactTime`
 * and `commercial.launchWindow` respectively); both stay in the shared
 * contract, unused and optional.
 */
export function DeliveryContactStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();
  const targetDate = useWatch({ control, name: "commercial.targetDate" });
  const hasTargetDate = typeof targetDate === "string" && targetDate.length > 0;

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

      {hasTargetDate && (
        <div className="dv5-alert-in space-y-6">
          <Controller
            control={control}
            name="commercial.dateFlexibility"
            render={({ field }) => (
              <div className="space-y-2">
                <Label>How firm is that date? (optional)</Label>
                <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
                  <label className={"dv5-pill" + (field.value === "firm" ? " dv5-pill--selected" : "")}>
                    <RadioGroupItem value="firm" /> Firm
                  </label>
                  <label className={"dv5-pill" + (field.value === "flexible" ? " dv5-pill--selected" : "")}>
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
        </div>
      )}

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

      <div className="dv5-review-section space-y-6">
        <FormField
          control={control}
          name="contact.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <Label>Title / role (optional)</Label>
          <Input {...register("contact.title", { setValueAs: toOptionalText })} />
        </div>

        <FormField
          control={control}
          name="contact.email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type="email" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <Label>Phone number (optional)</Label>
          <Input type="tel" {...register("contact.phone", { setValueAs: toOptionalPhone })} />
        </div>

        <FormField
          control={control}
          name="contact.preferredContactMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred contact method</FormLabel>
              <FormControl>
                <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
                  {PREFERRED_CONTACT_METHODS.map((method) => (
                    <label
                      key={method}
                      className={"dv5-pill" + (field.value === method ? " dv5-pill--selected" : "")}
                    >
                      <RadioGroupItem value={method} /> {CONTACT_METHOD_LABELS[method]}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <Label>Best time to reach you (optional)</Label>
          <Input {...register("contact.preferredContactTime", { setValueAs: toOptionalText })} />
        </div>

        <div className="space-y-2">
          <Label>Time zone (optional)</Label>
          <Input {...register("contact.timeZone", { setValueAs: toOptionalText })} />
        </div>

        <div className="space-y-2">
          <Label>How did you hear about us? (optional)</Label>
          <Input {...register("contact.referralSource", { setValueAs: toOptionalText })} />
        </div>
      </div>

      <div className="dv5-review-section space-y-4">
        <p className="text-sm text-[hsl(var(--sm-color-text-secondary))]">
          Our formal Privacy Policy and Terms of Service will be published before this form goes live — for now,
          you're previewing the experience only.
        </p>

        <Controller
          control={control}
          name="contact.consent.privacyPolicyAcknowledged"
          render={({ field, fieldState }) => (
            <div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked ? true : undefined)}
                />
                I agree to be contacted about my project and understand how my information will be used.
              </label>
              {fieldState.error && (
                <p className="mt-1 text-[0.8rem] font-medium text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        <Controller
          control={control}
          name="contact.consent.operationalContactConsent"
          render={({ field, fieldState }) => (
            <div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked ? true : undefined)}
                />
                I consent to being contacted to discuss this project (required to proceed).
              </label>
              {fieldState.error && (
                <p className="mt-1 text-[0.8rem] font-medium text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        <Controller
          control={control}
          name="contact.consent.marketingConsent"
          render={({ field }) => (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
              I'd like to receive occasional marketing updates (optional).
            </label>
          )}
        />

        <Controller
          control={control}
          name="contact.consent.smsConsent"
          render={({ field }) => (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
              I'd like to receive text message updates (optional).
            </label>
          )}
        />
      </div>
    </div>
  );
}
