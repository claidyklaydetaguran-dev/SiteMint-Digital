import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  LayoutGrid,
  List as ListIcon,
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Pencil,
  PlayCircle,
  Rocket,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineError } from "@/components/common/InlineError";
import { SearchInput } from "@/components/common/SearchInput";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SkeletonCard, SkeletonRow } from "@/components/common/Skeletons";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { useAssistantsList, useDeleteAssistant, useDuplicateAssistant } from "@/hooks/useAssistants";
import { AssistantApiRequestError, type AssistantDto, type AssistantStatus } from "@/lib/assistantsApi";
import { ASSISTANT_TEMPLATES } from "@/lib/assistantTemplates";
import { STATUS_LABEL, STATUS_TONE, isEligibleForDelete } from "@/lib/assistantStatus";

type ViewMode = "cards" | "table";
type StatusFilter = "all" | AssistantStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "publishing", label: "Publishing" },
  { value: "published", label: "Published" },
  { value: "error", label: "Error" },
  { value: "publish_uncertain", label: "Publish uncertain" },
];

function templateDisplayName(templateKey: string): string {
  return ASSISTANT_TEMPLATES.find((t) => t.id === templateKey)?.name ?? templateKey;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function providerLabel(assistant: AssistantDto): string {
  return assistant.provider && assistant.providerAssistantId ? "Connected" : "Not connected";
}

function AssistantsListSkeleton({ view }: { view: ViewMode }) {
  if (view === "table") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} className="h-40" />
      ))}
    </div>
  );
}

function RowActions({
  assistant,
  onEdit,
  onDuplicate,
  onDelete,
  duplicatePending,
  menuTriggerRef,
}: {
  assistant: AssistantDto;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicatePending: boolean;
  menuTriggerRef: (el: HTMLButtonElement | null) => void;
}) {
  const deletable = isEligibleForDelete(assistant);

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            onClick={(e) => e.preventDefault()}
            className="inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-lg text-muted-foreground opacity-50 md:h-8 md:min-h-0 md:w-8"
            aria-label={`Test ${assistant.name}`}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Browser test calling available in Checkpoint F
        </TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            onClick={(e) => e.preventDefault()}
            className="inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-lg text-muted-foreground opacity-50 md:h-8 md:min-h-0 md:w-8"
            aria-label={`Publish ${assistant.name}`}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Publishing available in Checkpoint E3
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={menuTriggerRef}
            type="button"
            className="inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover-elevate md:h-8 md:min-h-0 md:w-8"
            aria-label={`More actions for ${assistant.name}`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit} className="gap-2">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate} disabled={duplicatePending} className="gap-2">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            disabled={!deletable}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Assistants() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("cards");
  const [deleteTarget, setDeleteTarget] = useState<AssistantDto | null>(null);
  const rowMenuRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const { data: assistants, isLoading, isError, error, refetch } = useAssistantsList();
  const duplicateMutation = useDuplicateAssistant();
  const deleteMutation = useDeleteAssistant();

  const filtered = useMemo(() => {
    if (!assistants) return [];
    const q = search.trim().toLowerCase();
    return assistants.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        templateDisplayName(a.templateKey).toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
      );
    });
  }, [assistants, search, status]);

  const handleDuplicate = (assistant: AssistantDto) => {
    if (duplicateMutation.isPending) return;
    duplicateMutation.mutate(assistant.id, {
      onSuccess: (created: AssistantDto) => {
        toast({
          title: "Assistant duplicated",
          description: `"${created.name}" was created from "${assistant.name}".`,
        });
      },
      onError: (err) => {
        const message = err instanceof AssistantApiRequestError ? err.message : "Duplicate failed. Please try again.";
        toast({ title: "Duplicate failed", description: message, variant: "destructive" });
      },
    });
  };

  const restoreFocusToRow = (id: number) => {
    requestAnimationFrame(() => rowMenuRefs.current.get(id)?.focus());
  };

  const closeDeleteDialog = () => {
    const id = deleteTarget?.id;
    setDeleteTarget(null);
    if (id !== undefined) restoreFocusToRow(id);
  };

  const confirmDelete = () => {
    if (!deleteTarget || deleteMutation.isPending) return;
    const target = deleteTarget;
    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast({ title: "Assistant deleted", description: `"${target.name}" was permanently deleted.` });
        rowMenuRefs.current.delete(target.id);
      },
      onError: (err) => {
        const message = err instanceof AssistantApiRequestError ? err.message : "Delete failed. Please try again.";
        toast({ title: "Couldn't delete assistant", description: message, variant: "destructive" });
        // Row is preserved — dialog stays open so the user sees why.
      },
    });
  };

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
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-40" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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
          <AssistantsListSkeleton view={view} />
        ) : isError ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <InlineError
              title="Couldn't load assistants"
              description={error instanceof AssistantApiRequestError ? error.message : undefined}
              onRetry={() => refetch()}
              className="py-16"
            />
          </div>
        ) : !assistants || assistants.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={Bot}
              title="Create your first assistant"
              description="Pick a template to get started. Nothing is saved until you select Save Draft in the builder."
              action={
                <Button onClick={() => navigate("/assistants/new")} className="h-9 gap-1.5 text-sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New Assistant
                </Button>
              }
              className="py-16"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={Bot}
              title="No assistants match your search"
              description="Try a different name, template, or status filter."
              className="py-16"
            />
          </div>
        ) : view === "table" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Phone number</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((assistant) => (
                  <TableRow key={assistant.id}>
                    <TableCell className="max-w-[220px]">
                      <button
                        type="button"
                        onClick={() => navigate(`/assistants/${assistant.id}/setup`)}
                        className="truncate text-left text-sm font-medium text-foreground hover:text-primary"
                      >
                        {assistant.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {templateDisplayName(assistant.templateKey)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={STATUS_LABEL[assistant.status]} tone={STATUS_TONE[assistant.status]} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{providerLabel(assistant)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Available after Phone Numbers setup
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatUpdatedAt(assistant.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        assistant={assistant}
                        onEdit={() => navigate(`/assistants/${assistant.id}/setup`)}
                        onDuplicate={() => handleDuplicate(assistant)}
                        onDelete={() => setDeleteTarget(assistant)}
                        duplicatePending={duplicateMutation.isPending}
                        menuTriggerRef={(el) => {
                          if (el) rowMenuRefs.current.set(assistant.id, el);
                          else rowMenuRefs.current.delete(assistant.id);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((assistant) => (
              <div
                key={assistant.id}
                className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/assistants/${assistant.id}/setup`)}
                    className="min-w-0 flex-1 truncate text-left font-display text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {assistant.name}
                  </button>
                  <StatusBadge label={STATUS_LABEL[assistant.status]} tone={STATUS_TONE[assistant.status]} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {templateDisplayName(assistant.templateKey)}
                </p>
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <p>Provider: {providerLabel(assistant)}</p>
                  <p>Phone number: Available after Phone Numbers setup</p>
                  <p>Updated {formatUpdatedAt(assistant.updatedAt)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    {isEligibleForDelete(assistant) ? "Draft" : "Locked"}
                  </span>
                  <RowActions
                    assistant={assistant}
                    onEdit={() => navigate(`/assistants/${assistant.id}/setup`)}
                    onDuplicate={() => handleDuplicate(assistant)}
                    onDelete={() => setDeleteTarget(assistant)}
                    duplicatePending={duplicateMutation.isPending}
                    menuTriggerRef={(el) => {
                      if (el) rowMenuRefs.current.set(assistant.id, el);
                      else rowMenuRefs.current.delete(assistant.id);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this assistant draft. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
