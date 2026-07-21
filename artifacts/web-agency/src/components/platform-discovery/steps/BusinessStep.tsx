import { useFormContext } from "react-hook-form";
import { BUSINESS_STAGES, TEAM_SIZE_RANGES } from "@workspace/discovery-contract";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalText, toOptionalUrl, type DiscoveryDraft } from "../discoveryFormModel";

const BUSINESS_STAGE_LABELS: Record<(typeof BUSINESS_STAGES)[number], string> = {
  preparing_to_launch: "Preparing to launch",
  newly_operating: "Newly operating",
  established: "Established",
  growing: "Growing",
  rebranding: "Rebranding",
  replacing_existing_system: "Replacing an existing system",
  expanding_new_market: "Expanding into a new market",
};

const TEAM_SIZE_LABELS: Record<(typeof TEAM_SIZE_RANGES)[number], string> = {
  solo: "Just me",
  "2_10": "2–10 people",
  "11_50": "11–50 people",
  "51_200": "51–200 people",
  "200_plus": "200+ people",
};

export function BusinessStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="business.organizationName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization name</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="business.industry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Industry</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="e.g. Real estate, legal, healthcare" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>Current website (optional)</Label>
        <Input {...register("business.currentWebsite", { setValueAs: toOptionalUrl })} placeholder="https://" />
      </div>

      <div className="space-y-2">
        <Label>Service area (optional)</Label>
        <Input {...register("business.serviceArea", { setValueAs: toOptionalText })} />
      </div>

      <FormField
        control={control}
        name="business.description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tell us about your business</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={4} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="business.primaryAudience"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Who is your primary audience or customer?</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>Secondary audience (optional)</Label>
        <Textarea {...register("business.secondaryAudience", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <FormField
        control={control}
        name="business.businessStage"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Business stage</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {BUSINESS_STAGE_LABELS[stage]}
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
        name="business.teamSizeRange"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Team size</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZE_RANGES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {TEAM_SIZE_LABELS[size]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>Business model (optional)</Label>
        <Input {...register("business.businessModel", { setValueAs: toOptionalText })} />
      </div>

      <div className="space-y-2">
        <Label>Products or services offered (optional)</Label>
        <Textarea {...register("business.productsServices", { setValueAs: toOptionalText })} rows={3} />
      </div>
    </div>
  );
}
