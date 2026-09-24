import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetStatusField } from "./sharedFields";
import { toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

/**
 * Step 3 of the reorganized (Checkpoint 2C.3) intake — "Brand and visual
 * direction." Logo/brand-asset readiness plus the actual style questions
 * (reference sites, preferences, dislikes) that used to be buried mid-way
 * through the old "Content, Design, and Technical Readiness" step.
 */
export function BrandDirectionStep() {
  const { control, register } = useFormContext<DiscoveryDraft>();

  return (
    <div className="space-y-6">
      <AssetStatusField name="readiness.logoStatus" label="Logo" />
      <AssetStatusField name="readiness.brandStatus" label="Brand assets (colors, fonts, style)" />

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
        <Label>Styles, colors, or a look you have in mind (optional)</Label>
        <Textarea {...register("readiness.designPreferences", { setValueAs: toOptionalText })} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Anything you want to avoid? (optional)</Label>
        <Textarea {...register("readiness.designDislikes", { setValueAs: toOptionalText })} rows={2} />
      </div>
    </div>
  );
}
