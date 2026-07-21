import { useFormContext, Controller } from "react-hook-form";
import { PREFERRED_CONTACT_METHODS } from "@workspace/discovery-contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { toOptionalPhone, toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

const CONTACT_METHOD_LABELS: Record<(typeof PREFERRED_CONTACT_METHODS)[number], string> = {
  email: "Email",
  phone: "Phone",
  either: "Either is fine",
};

export function ContactStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
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
              <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="flex flex-row gap-6">
                {PREFERRED_CONTACT_METHODS.map((method) => (
                  <label key={method} className="flex items-center gap-2 text-sm">
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

      <div className="space-y-4 rounded-md border border-[hsl(var(--sm-color-border-default))] p-4">
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
