import { useFormContext, Controller, useWatch } from "react-hook-form";
import {
  AD_PLATFORMS,
  MEDIA_BUDGET_RANGES,
  CAMPAIGN_OBJECTIVES,
  YES_NO_UNSURE,
  CREATIVE_ASSET_STATUSES,
  REPORTING_CADENCES,
} from "@workspace/discovery-contract";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toOptionalText, toOptionalUrl, type DiscoveryDraft } from "../discoveryFormModel";
import { YesNoField } from "./sharedFields";

const AD_PLATFORM_LABELS: Record<(typeof AD_PLATFORMS)[number], string> = {
  meta_ads: "Meta Ads (Facebook / Instagram)",
  google_ads: "Google Ads",
  other: "Other",
};

const MEDIA_BUDGET_LABELS: Record<(typeof MEDIA_BUDGET_RANGES)[number], string> = {
  under_500: "Under $500/month",
  "500_1500": "$500–$1,500/month",
  "1500_5000": "$1,500–$5,000/month",
  "5000_15000": "$5,000–$15,000/month",
  "15000_plus": "$15,000+/month",
  not_sure: "Not sure yet",
};

const CAMPAIGN_OBJECTIVE_LABELS: Record<(typeof CAMPAIGN_OBJECTIVES)[number], string> = {
  lead_generation: "Lead generation",
  sales_conversions: "Sales / conversions",
  brand_awareness: "Brand awareness",
  app_installs: "App installs",
  local_visibility: "Local visibility",
  other: "Other",
};

const YES_NO_UNSURE_LABELS: Record<(typeof YES_NO_UNSURE)[number], string> = {
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
};

const CREATIVE_ASSET_LABELS: Record<(typeof CREATIVE_ASSET_STATUSES)[number], string> = {
  yes: "We have creative ready",
  in_progress: "In progress",
  need_help: "We need help with this",
};

const REPORTING_CADENCE_LABELS: Record<(typeof REPORTING_CADENCES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  not_sure: "Not sure yet",
};

type ThreeWayFieldName = "growth.hasPixelsConfigured" | "growth.analyticsConsentReady";

/** Small three-way (yes/no/unsure) pill radio group, reused for the growth step's readiness questions. */
function YesNoUnsureField({ name, label }: { name: ThreeWayFieldName; label: string }) {
  const { control } = useFormContext<DiscoveryDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
            {YES_NO_UNSURE.map((option) => (
              <label key={option} className={"dv5-pill" + (field.value === option ? " dv5-pill--selected" : "")}>
                <RadioGroupItem value={option} /> {YES_NO_UNSURE_LABELS[option]}
              </label>
            ))}
          </RadioGroup>
        </div>
      )}
    />
  );
}

/**
 * Step 6 of the reorganized (Checkpoint 2C.3) intake — "Growth, advertising,
 * and tracking." New step (Task 3, owner-confirmed service scope). Entirely
 * conditional: nothing below the first question is asked unless the visitor
 * says they're interested, and every field once revealed is itself optional
 * — this step never blocks moving forward.
 */
export function GrowthAdvertisingStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();
  const interested = useWatch({ control, name: "growth.interested" });
  const platform = useWatch({ control, name: "growth.platform" });
  const hasLandingPage = useWatch({ control, name: "growth.hasLandingPage" });

  return (
    <div className="space-y-6">
      <YesNoField
        name="growth.interested"
        label="Would you like SiteMint to help manage advertising or growth campaigns alongside your build?"
      />

      <p className="text-sm text-[hsl(var(--sm-color-text-secondary))]">
        Ad spend is separate from SiteMint's service fee, and advertising management is a recurring or
        separately-scoped service — we don't guarantee leads, revenue, ROAS, or ad-platform approval. Answering
        below just helps us scope that conversation; it's never required to move forward with your build.
      </p>

      {interested === true && (
        <div className="dv5-alert-in space-y-6">
          <div className="space-y-2">
            <Label>Which platform? (optional)</Label>
            <Controller
              control={control}
              name="growth.platform"
              render={({ field }) => (
                <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
                  {AD_PLATFORMS.map((option) => (
                    <label key={option} className={"dv5-pill" + (field.value === option ? " dv5-pill--selected" : "")}>
                      <RadioGroupItem value={option} /> {AD_PLATFORM_LABELS[option]}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </div>

          {platform === "other" && (
            <div className="dv5-alert-in space-y-2">
              <Label>Which platform, specifically? (optional)</Label>
              <Input {...register("growth.otherPlatformNote", { setValueAs: toOptionalText })} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Current or planned monthly media budget (optional)</Label>
            <Controller
              control={control}
              name="growth.monthlyBudgetRange"
              render={({ field }) => (
                <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a range" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDIA_BUDGET_RANGES.map((range) => (
                      <SelectItem key={range} value={range}>
                        {MEDIA_BUDGET_LABELS[range]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Campaign objective (optional)</Label>
            <Controller
              control={control}
              name="growth.campaignObjective"
              render={({ field }) => (
                <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_OBJECTIVES.map((objective) => (
                      <SelectItem key={objective} value={objective}>
                        {CAMPAIGN_OBJECTIVE_LABELS[objective]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Target audience and locations (optional)</Label>
            <Textarea
              {...register("growth.targetAudienceLocations", { setValueAs: toOptionalText })}
              rows={2}
              placeholder="e.g. Homeowners aged 35-65 within 30 miles of Denver, CO"
            />
          </div>

          <div className="space-y-2">
            <Label>Do you already have a landing page for this? (optional)</Label>
            <Controller
              control={control}
              name="growth.hasLandingPage"
              render={({ field }) => (
                <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
                  <label className={"dv5-pill" + (field.value === "yes" ? " dv5-pill--selected" : "")}>
                    <RadioGroupItem value="yes" /> Yes
                  </label>
                  <label className={"dv5-pill" + (field.value === "no" ? " dv5-pill--selected" : "")}>
                    <RadioGroupItem value="no" /> No
                  </label>
                </RadioGroup>
              )}
            />
          </div>

          {hasLandingPage === "yes" && (
            <div className="dv5-alert-in space-y-2">
              <Label>Landing page URL (optional)</Label>
              <Input {...register("growth.landingPageUrl", { setValueAs: toOptionalUrl })} placeholder="https://" />
            </div>
          )}

          <YesNoUnsureField name="growth.hasPixelsConfigured" label="Do you have ad pixels or conversion tracking configured? (optional)" />
          <YesNoUnsureField name="growth.analyticsConsentReady" label="Do you have analytics and cookie-consent set up? (optional)" />

          <div className="space-y-2">
            <Label>Creative assets (images, video, copy) — where do things stand? (optional)</Label>
            <Controller
              control={control}
              name="growth.creativeAssetsAvailable"
              render={({ field }) => (
                <RadioGroup value={field.value ?? undefined} onValueChange={field.onChange} className="dv5-pill-group">
                  {CREATIVE_ASSET_STATUSES.map((status) => (
                    <label key={status} className={"dv5-pill" + (field.value === status ? " dv5-pill--selected" : "")}>
                      <RadioGroupItem value={status} /> {CREATIVE_ASSET_LABELS[status]}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Results from previous advertising, if any (optional)</Label>
            <Textarea {...register("growth.previousCampaignResults", { setValueAs: toOptionalText })} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Preferred reporting cadence (optional)</Label>
            <Controller
              control={control}
              name="growth.reportingCadence"
              render={({ field }) => (
                <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORTING_CADENCES.map((cadence) => (
                      <SelectItem key={cadence} value={cadence}>
                        {REPORTING_CADENCE_LABELS[cadence]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
