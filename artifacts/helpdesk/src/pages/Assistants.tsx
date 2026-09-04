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
  ArrowRight,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineError } from "@/components/common/InlineError";
import { SearchInput } from "@/components/common/SearchInput";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SkeletonCard, SkeletonRow } from "@/components/common/Skeletons";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  useAssistantsList,
  useDeleteAssistant,
  useDuplicateAssistant,
} from "@/hooks/useAssistants";
import {
  AssistantApiRequestError,
  type AssistantDto,
  type AssistantStatus,
} from "@/lib/assistantsApi";
import { ASSISTANT_TEMPLATES } from "@/lib/assistantTemplates";
import {
  STATUS_LABEL,
  STATUS_TONE,
  isEligibleForDelete,
  assistantCardStatus,
} from "@/lib/assistantStatus";
import {
  LIST,
  CARD,
  NEW_PATH,
  assistantHref,
  deleteDialogTitle,
  moreActionsAccessibleName,
  openAccessibleName,
  providerLinkLabel,
} from "@/pages/assistants/assistantsContract";

type ViewMode = "cards" | "table";
type StatusFilter = "all" | AssistantStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: LIST.allStatuses },
  { value: "draft", label: "Draft" },
  { value: "publishing", label: "Publishing" },
  { value: "published", label: "Published" },
  { value: "error", label: "Error" },
  { value: "publish_uncertain", label: "Publish uncertain" },
];

function templateDisplayName(templateKey: string): string {
  return (
    ASSISTANT_TEMPLATES.find((t) => t.id === templateKey)?.name ?? templateKey
  );
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AssistantsListSkeleton({ view }: { view: ViewMode }) {
  if (view === "table") {
    return (
      <div
        className="overflow-hidden rounded-xl border border-border bg-card"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} className="h-40" />
      ))}
    </div>
  );
}

/**
 * AR-001I: a row carries exactly one control that leaves the list, and it is
 * named for what it does.
 *
 * It used to carry two more: a play icon labelled "Test {name}" and a rocket
 * icon labelled "Publish {name}". Neither started a test or published
 * anything — both called `navigate()` to this same builder tab, which is
 * also where the row's name and the menu's Edit item already went. Four
 * controls, one destination, two of them named after actions that only
 * happen inside the builder behind an explicit confirmation.
 *
 * So: one Open control, and the menu keeps only the two items that genuinely
 * act on the row. Nothing here issues a provider request.
 */
function RowActions({
  assistant,
  onOpen,
  onDuplicate,
  onDelete,
  duplicatePending,
  menuTriggerRef,
}: {
  assistant: AssistantDto;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicatePending: boolean;
  menuTriggerRef: (el: HTMLButtonElement | null) => void;
}) {
  const deletable = isEligibleForDelete(assistant);

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={openAccessibleName(assistant.name)}
        className="inline-flex h-11 min-h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:min-h-0"
      >
        {LIST.open}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={menuTriggerRef}
            type="button"
            className="inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:min-h-0 md:w-8"
            aria-label={moreActionsAccessibleName(assistant.name)}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={onDuplicate}
            disabled={duplicatePending}
            className="gap-2"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {LIST.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            disabled={!deletable}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {LIST.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * V5 PR-6 (C-1): the one-assistant experience. Shown instead of the
 * list/table whenever exactly one assistant exists — the beta's normal case.
 * The list/table stay for the >1 case (legacy data only; "New Assistant" is
 * hidden once one exists, so a firm cannot reach two through this UI).
 */
function AssistantStatusCard({
  assistant,
  onOpen,
  onOpenTab,
  onDuplicate,
  onDelete,
  duplicatePending,
  menuTriggerRef,
}: {
  assistant: AssistantDto;
  onOpen: () => void;
  onOpenTab: (tab: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicatePending: boolean;
  menuTriggerRef: (el: HTMLButtonElement | null) => void;
}) {
  const cardStatus = assistantCardStatus(assistant);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold text-foreground">{assistant.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{templateDisplayName(assistant.templateKey)}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <StatusBadge label={cardStatus.label} tone={cardStatus.tone} />
          <RowActions
            assistant={assistant}
            onOpen={onOpen}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            duplicatePending={duplicatePending}
            menuTriggerRef={menuTriggerRef}
          />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{CARD.providerLinkLabel}</dt>
          <dd className="mt-0.5 font-medium text-foreground">{providerLinkLabel(assistant)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{CARD.lastPublishedLabel}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {assistant.lastSyncedAt ? formatUpdatedAt(assistant.lastSyncedAt) : CARD.notYetPublished}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenTab("configuration")}>
          {CARD.configuration}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenTab("prompt")}>
          {CARD.prompt}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenTab("voice")}>
          {CARD.voice}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenTab("voice")}>
          {CARD.test}
        </Button>
      </div>
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

  const {
    data: assistants,
    isLoading,
    isError,
    error,
    refetch,
  } = useAssistantsList();
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

  const openAssistant = (assistant: AssistantDto) => {
    navigate(assistantHref(assistant.id));
  };

  /** V5 PR-6 (C-1): the status card's per-tab quick links. */
  const openAssistantTab = (assistant: AssistantDto, tab: string) => {
    navigate(assistantHref(assistant.id, tab));
  };

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
        const message =
          err instanceof AssistantApiRequestError
            ? err.message
            : "Duplicate failed. Please try again.";
        toast({
          title: "Duplicate failed",
          description: message,
          variant: "destructive",
        });
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
        toast({
          title: "Assistant deleted",
          description: `"${target.name}" was permanently deleted.`,
        });
        rowMenuRefs.current.delete(target.id);
      },
      onError: (err) => {
        const message =
          err instanceof AssistantApiRequestError
            ? err.message
            : "Delete failed. Please try again.";
        toast({
          title: "Couldn't delete assistant",
          description: message,
          variant: "destructive",
        });
        // Row is preserved — dialog stays open so the user sees why.
      },
    });
  };

  // V5 PR-6 (C-1): one assistant per firm in beta. Exactly one existing
  // assistant switches this page from the list/table to a single status
  // card, and hides "New Assistant" — a firm cannot reach a second assistant
  // through this UI. Zero or more-than-one (legacy data) keep the page
  // exactly as it was.
  const singleAssistant = assistants && assistants.length === 1 ? assistants[0] : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <div className="flex-shrink-0 px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              {LIST.title}
            </h1>
            <p className="mt-0.5 max-w-lg text-sm text-muted-foreground">
              {LIST.detail}
            </p>
          </div>
          {singleAssistant ? (
            <p className="text-xs text-muted-foreground">{LIST.contactToAddAnother}</p>
          ) : (
            <Button
              onClick={() => navigate(NEW_PATH)}
              className="h-9 gap-1.5 text-sm"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {LIST.newAssistant}
            </Button>
          )}
        </div>

        {!singleAssistant && !isLoading && !isError && assistants && assistants.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={LIST.searchPlaceholder}
              aria-label={LIST.searchLabel}
              className="w-full sm:max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
            >
              <SelectTrigger
                className="h-9 w-full text-sm sm:w-40"
                aria-label={LIST.statusFilterLabel}
              >
                <SelectValue placeholder={LIST.allStatuses} />
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
              aria-label={LIST.viewLabel}
              className="sm:ml-auto"
              options={[
                {
                  value: "cards",
                  label: LIST.cards,
                  icon: LayoutGrid,
                  "aria-label": LIST.cardsView,
                },
                {
                  value: "table",
                  label: LIST.table,
                  icon: ListIcon,
                  "aria-label": LIST.tableView,
                },
              ]}
            />
          </div>
        )}
      </div>

      <div className="flex-1 px-6 pb-6">
        {isLoading ? (
          <AssistantsListSkeleton view={view} />
        ) : isError ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <InlineError
              title={LIST.errorTitle}
              description={
                error instanceof AssistantApiRequestError
                  ? error.message
                  : undefined
              }
              onRetry={() => refetch()}
              className="py-16"
            />
          </div>
        ) : singleAssistant ? (
          <AssistantStatusCard
            assistant={singleAssistant}
            onOpen={() => openAssistant(singleAssistant)}
            onOpenTab={(tab) => openAssistantTab(singleAssistant, tab)}
            onDuplicate={() => handleDuplicate(singleAssistant)}
            onDelete={() => setDeleteTarget(singleAssistant)}
            duplicatePending={duplicateMutation.isPending}
            menuTriggerRef={(el) => {
              if (el) rowMenuRefs.current.set(singleAssistant.id, el);
              else rowMenuRefs.current.delete(singleAssistant.id);
            }}
          />
        ) : !assistants || assistants.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={Bot}
              title={LIST.emptyTitle}
              description={LIST.emptyDetail}
              action={
                <Button
                  onClick={() => navigate(NEW_PATH)}
                  className="h-9 gap-1.5 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {LIST.newAssistant}
                </Button>
              }
              className="py-16"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={Bot}
              title={LIST.noMatchTitle}
              description={LIST.noMatchDetail}
              className="py-16"
            />
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{LIST.colName}</TableHead>
                  <TableHead>{LIST.colTemplate}</TableHead>
                  <TableHead>{LIST.colStatus}</TableHead>
                  <TableHead>{LIST.colProviderLink}</TableHead>
                  <TableHead>{LIST.colUpdated}</TableHead>
                  <TableHead className="text-right">{LIST.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((assistant) => (
                  <TableRow key={assistant.id}>
                    <TableCell className="max-w-[220px]">
                      <button
                        type="button"
                        onClick={() => openAssistant(assistant)}
                        aria-label={openAccessibleName(assistant.name)}
                        className="truncate rounded-sm text-left text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {assistant.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {templateDisplayName(assistant.templateKey)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={STATUS_LABEL[assistant.status]}
                        tone={STATUS_TONE[assistant.status]}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {providerLinkLabel(assistant)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatUpdatedAt(assistant.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <RowActions
                          assistant={assistant}
                          onOpen={() => openAssistant(assistant)}
                          onDuplicate={() => handleDuplicate(assistant)}
                          onDelete={() => setDeleteTarget(assistant)}
                          duplicatePending={duplicateMutation.isPending}
                          menuTriggerRef={(el) => {
                            if (el) rowMenuRefs.current.set(assistant.id, el);
                            else rowMenuRefs.current.delete(assistant.id);
                          }}
                        />
                      </div>
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
                    onClick={() => openAssistant(assistant)}
                    aria-label={openAccessibleName(assistant.name)}
                    className="min-w-0 flex-1 truncate rounded-sm text-left font-display text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {assistant.name}
                  </button>
                  <StatusBadge
                    label={STATUS_LABEL[assistant.status]}
                    tone={STATUS_TONE[assistant.status]}
                  />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {templateDisplayName(assistant.templateKey)}
                </p>
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    {LIST.colProviderLink}: {providerLinkLabel(assistant)}
                  </p>
                  <p>Updated {formatUpdatedAt(assistant.updatedAt)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    {isEligibleForDelete(assistant) ? LIST.draft : LIST.locked}
                  </span>
                  <RowActions
                    assistant={assistant}
                    onOpen={() => openAssistant(assistant)}
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
            <AlertDialogTitle>
              {deleteDialogTitle(deleteTarget?.name ?? "")}
            </AlertDialogTitle>
            <AlertDialogDescription>{LIST.deleteDetail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {LIST.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              {LIST.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
