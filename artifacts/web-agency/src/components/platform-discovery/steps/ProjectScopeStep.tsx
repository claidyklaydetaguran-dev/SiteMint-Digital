import { useFormContext, useWatch } from "react-hook-form";
import { FEATURE_PRIORITIES } from "@workspace/discovery-contract";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFeatureCatalog } from "../featureCatalog";
import { toOptionalText, type DiscoveryDraft } from "../discoveryFormModel";

const FEATURE_PRIORITY_LABELS: Record<(typeof FEATURE_PRIORITIES)[number], string> = {
  must_have: "Must have",
  important_after_launch: "Important, can follow launch",
  exploring: "Just exploring",
  not_sure: "Not sure yet",
};

export function ProjectScopeStep() {
  const { control, register, setValue } = useFormContext<DiscoveryDraft>();
  const primaryType = useWatch({ control, name: "projectDirection.primaryType" });
  const features = useWatch({ control, name: "projectScope.features" }) ?? [];
  const catalog = getFeatureCatalog(primaryType);

  function findEntryIndex(key: string): number {
    return features.findIndex((entry) => entry?.key === key);
  }

  function toggleFeature(key: string, isChecked: boolean) {
    if (isChecked) {
      setValue("projectScope.features", [...features, { key, priority: undefined }], { shouldValidate: false });
    } else {
      setValue(
        "projectScope.features",
        features.filter((entry) => entry?.key !== key),
        { shouldValidate: false },
      );
    }
  }

  function setPriority(key: string, priority: (typeof FEATURE_PRIORITIES)[number]) {
    const next = features.map((entry) => (entry?.key === key ? { key, priority } : entry));
    setValue("projectScope.features", next, { shouldValidate: false });
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>Which features are you interested in?</Label>
        <div className="mt-3 space-y-3">
          {catalog.map((item) => {
            const entryIndex = findEntryIndex(item.key);
            const isSelected = entryIndex >= 0;
            const priority = isSelected ? features[entryIndex]?.priority : undefined;
            return (
              <div
                key={item.key}
                className="flex flex-col gap-2 rounded-md border border-[hsl(var(--sm-color-border-default))] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isSelected}
                    onChange={(event) => toggleFeature(item.key, event.target.checked)}
                  />
                  {item.label}
                </label>
                {isSelected && (
                  <Select
                    value={priority ?? undefined}
                    onValueChange={(value) => setPriority(item.key, value as (typeof FEATURE_PRIORITIES)[number])}
                  >
                    <SelectTrigger className="sm:w-56">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {FEATURE_PRIORITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {FEATURE_PRIORITY_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Anything else about scope we should know? (optional)</Label>
        <Textarea {...register("projectScope.additionalRequirements", { setValueAs: toOptionalText })} rows={3} />
      </div>
    </div>
  );
}
