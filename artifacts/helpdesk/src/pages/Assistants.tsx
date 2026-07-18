import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Bot, LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchInput } from "@/components/common/SearchInput";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SkeletonCard } from "@/components/common/Skeletons";

type ViewMode = "cards" | "table";

function AssistantsListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} className="h-40" />
      ))}
    </div>
  );
}

export default function Assistants() {
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");

  // Brief loading shell on first mount so the list layout never pops in —
  // there is no live assistants API in Checkpoint B3, so this is chrome
  // only and always resolves to the honest empty state below.
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <div className="flex-shrink-0 px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">Assistants</h1>
            <p className="mt-0.5 max-w-lg text-sm text-muted-foreground">
              Build and manage the AI voice assistants that answer, qualify, and book for your
              business.
            </p>
          </div>
          <Button onClick={() => navigate("/assistants/new")} className="h-9 gap-1.5 text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Assistant
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search assistants…"
            aria-label="Search assistants"
            className="w-full sm:max-w-xs"
          />
          <Select disabled>
            <SelectTrigger className="h-9 w-full text-sm sm:w-40" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
          <SegmentedControl<ViewMode>
            value={view}
            onChange={setView}
            aria-label="Assistants view"
            className="sm:ml-auto"
            options={[
              { value: "cards", label: "Cards", icon: LayoutGrid, "aria-label": "Card view" },
              { value: "table", label: "Table", icon: ListIcon, "aria-label": "Table view" },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 px-6 pb-6">
        {isLoading ? (
          <AssistantsListSkeleton />
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={Bot}
              title="Create your first assistant"
              description="Assistant saving and publishing will be enabled in Checkpoint E. For now, build and preview a configuration in the assistant builder."
              action={
                <Button onClick={() => navigate("/assistants/new")} className="h-9 gap-1.5 text-sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New Assistant
                </Button>
              }
              className="py-16"
            />
          </div>
        )}
      </div>
    </div>
  );
}
