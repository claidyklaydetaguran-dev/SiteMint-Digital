/**
 * The Assistant list.
 *
 * Presentation only. This page used to be written in raw utility classes — its
 * own card grid, its own skeletons, its own empty and error blocks — so it read
 * as a different product from every screen around it. It now uses the same
 * vocabulary as Settings, Issues, Support and Overview: `sd-page`/`PageHeader`
 * for the frame, `sd-section` for grouping, `sd-list`/`sd-row` for rows,
 * `sd-empty` and `sd-error` for the states, `si-*` for the filter controls, and
 * the shared `Button`, `StatusChip` and `PageSkeleton`.
 *
 * Every control, destination and guard is the one that was here before:
 * a single Open control per row, an overflow menu carrying only Duplicate and
 * Delete, delete still gated on `isEligibleForDelete`, the one-assistant view
 * still replacing the list, and "New Assistant" still hidden once one exists.
 * Nothing here issues a provider request.
 *
 * The provider-link readout moved under a "Technical details" disclosure. It
 * says whether a provider-side record exists, which is a question SiteMint
 * support asks and a business owner never does — it is kept, not deleted,
 * because it is real evidence.
 */

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Copy, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/common/PageHeader";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { StatusChip, type StatusTone } from "@/components/common/StatusChip";
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
  isEligibleForDelete,
  assistantCardStatus,
  type CardStatusKey,
} from "@/lib/assistantStatus";
import {
  CARD,
  DIAGNOSTICS,
  LIST,
  NEW_PATH,
  SECTIONS,
  assistantHref,
  deleteDialogTitle,
  moreActionsAccessibleName,
  openAccessibleName,
  providerLinkLabel,
} from "@/pages/assistants/assistantsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-signin.css";

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

/**
 * The shared chip's tones, not the badge's. `assistantStatus.ts` still owns
 * every label — only the visual tone is chosen here, so the six statuses this
 * journey reports keep one source of truth for what they are called.
 */
const STATUS_CHIP_TONE: Record<AssistantStatus, StatusTone> = {
  draft: "pending",
  publishing: "next",
  published: "live",
  error: "blocked",
  publish_uncertain: "warn",
  unknown: "neutral",
};

const CARD_CHIP_TONE: Record<CardStatusKey, StatusTone> = {
  draft: "pending",
  published: "live",
  needs_update: "warn",
};

const MUTED: CSSProperties = {
  margin: "var(--sd-space-1, .25rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.55,
  color: "var(--sd-text-muted, #3b5265)",
};

function templateDisplayName(templateKey: string): string {
  return ASSISTANT_TEMPLATES.find((t) => t.id === templateKey)?.name ?? templateKey;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The technical readouts, behind a disclosure that names its audience. Shared
 * by the one-assistant view and the legacy list so the two cannot disagree
 * about what they expose.
 */
function Diagnostics({ assistant }: { assistant: AssistantDto }) {
  return (
    <details
      style={{
        marginTop: "var(--sd-space-3, .75rem)",
        border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
        borderRadius: "var(--sd-radius-control, 6px)",
        background: "var(--sd-surface-alt, #f6fbfa)",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: 44,
          padding: "0 var(--sd-space-3, .75rem)",
          fontSize: "var(--sd-text-small, .8125rem)",
          fontWeight: 600,
          color: "var(--sd-text, #051824)",
          cursor: "pointer",
        }}
      >
        {DIAGNOSTICS.label}
      </summary>
      <div style={{ padding: "0 var(--sd-space-3, .75rem) var(--sd-space-3, .75rem)" }}>
        <p style={MUTED}>{DIAGNOSTICS.detail}</p>
        <dl style={{ margin: "var(--sd-space-2, .5rem) 0 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
            <dt style={{ ...MUTED, margin: 0, minWidth: "10rem" }}>{DIAGNOSTICS.providerLink}</dt>
            <dd style={{ margin: 0, fontSize: "var(--sd-text-small, .8125rem)", overflowWrap: "anywhere" }}>
              {providerLinkLabel(assistant)}
            </dd>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
            <dt style={{ ...MUTED, minWidth: "10rem" }}>{DIAGNOSTICS.lastSynced}</dt>
            <dd style={{ margin: 0, fontSize: "var(--sd-text-small, .8125rem)" }}>
              {assistant.lastSyncedAt ? formatUpdatedAt(assistant.lastSyncedAt) : DIAGNOSTICS.never}
            </dd>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
            <dt style={{ ...MUTED, minWidth: "10rem" }}>{DIAGNOSTICS.reportedStatus}</dt>
            <dd style={{ margin: 0, fontSize: "var(--sd-text-small, .8125rem)" }}>
              {STATUS_LABEL[assistant.status]}
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}

/**
 * A row carries exactly one control that leaves the list, and it is named for
 * what it does. It used to carry two more — a play icon labelled "Test {name}"
 * and a rocket icon labelled "Publish {name}" — neither of which started a test
 * or published anything: both navigated to this same builder tab. The menu
 * keeps only the two items that genuinely act on the row.
 *
 * The 44px target and the focus ring come from `sd-link` in v2-dashboard.css
 * rather than from utility classes repeated per page, so one screen can no
 * longer drift from the guarantee.
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
    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: "var(--sd-space-2, .5rem)" }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={openAccessibleName(assistant.name)}
        className="sd-link"
        style={{ border: 0, background: "none", cursor: "pointer", font: "inherit", fontWeight: 600 }}
      >
        {LIST.open}
        <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={menuTriggerRef}
            type="button"
            className="sd-error__action"
            style={{ width: 44, padding: 0, justifyContent: "center" }}
            aria-label={moreActionsAccessibleName(assistant.name)}
          >
            <MoreVertical className="sd-navlink__icon" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDuplicate} disabled={duplicatePending} className="gap-2">
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
 * The one-assistant experience, shown instead of the list whenever exactly one
 * assistant exists — the beta's normal case. The list stays for the >1 case
 * (legacy data only; "New Assistant" is hidden once one exists, so a firm
 * cannot reach two through this UI).
 */
function AssistantSummary({
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
    <section className="sd-section" aria-labelledby="assistant-summary-title">
      <div className="sd-section__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="sd-h2" id="assistant-summary-title" style={{ overflowWrap: "anywhere" }}>
            {assistant.name}
          </h2>
          <p style={MUTED}>{templateDisplayName(assistant.templateKey)}</p>
        </div>
        <StatusChip label={cardStatus.label} tone={CARD_CHIP_TONE[cardStatus.key]} />
      </div>

      <dl className="sd-figures">
        <div className="sd-figure">
          <span className="sd-figure__value" data-empty="true">
            {assistant.lastSyncedAt ? formatUpdatedAt(assistant.lastSyncedAt) : CARD.notYetPublished}
          </span>
          <span className="sd-figure__label">{CARD.lastPublishedLabel}</span>
        </div>
        <div className="sd-figure">
          <span className="sd-figure__value" data-empty="true">
            {formatUpdatedAt(assistant.updatedAt)}
          </span>
          <span className="sd-figure__label">{LIST.colUpdated}</span>
        </div>
      </dl>

      <div>
        <p style={{ ...MUTED, marginTop: 0 }}>{CARD.quickLinksLabel}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
          <Button variant="outline" size="sm" onClick={() => onOpenTab("configuration")}>
            {SECTIONS.configuration}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenTab("voice")}>
            {SECTIONS.voice}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenTab("actions")}>
            {SECTIONS.actions}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenTab("testing")}>
            {SECTIONS.testing}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sd-space-3, .75rem)" }}>
        <Button onClick={onOpen}>{CARD.openLabel}</Button>
        <RowActions
          assistant={assistant}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          duplicatePending={duplicatePending}
          menuTriggerRef={menuTriggerRef}
        />
      </div>

      <Diagnostics assistant={assistant} />
    </section>
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

  const openAssistant = (assistant: AssistantDto) => {
    navigate(assistantHref(assistant.id));
  };

  /** The summary view's per-section quick links. */
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
          err instanceof AssistantApiRequestError ? err.message : "Duplicate failed. Please try again.";
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
        const message =
          err instanceof AssistantApiRequestError ? err.message : "Delete failed. Please try again.";
        toast({ title: "Couldn't delete assistant", description: message, variant: "destructive" });
        // Row is preserved — dialog stays open so the user sees why.
      },
    });
  };

  // One assistant per firm in beta. Exactly one existing assistant switches
  // this page to the summary and hides "New Assistant". Zero or more-than-one
  // (legacy data) keep the list.
  const singleAssistant = assistants && assistants.length === 1 ? assistants[0] : null;

  if (isLoading) return <PageSkeleton label={LIST.loading} list />;

  const showFilters = !singleAssistant && !isError && assistants && assistants.length > 0;

  return (
    <div className="sd-page sd-enter">
      <PageHeader
        eyebrow={LIST.eyebrow}
        title={LIST.title}
        description={LIST.detail}
        action={
          singleAssistant ? (
            <p style={{ ...MUTED, marginTop: 0 }}>{LIST.contactToAddAnother}</p>
          ) : (
            <Button onClick={() => navigate(NEW_PATH)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {LIST.newAssistant}
            </Button>
          )
        }
      />

      {isError && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{LIST.errorTitle}</span>
            <p className="sd-error__detail">
              {error instanceof AssistantApiRequestError ? error.message : LIST.errorDetail}
            </p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => refetch()}>
            {LIST.retry}
          </button>
        </section>
      )}

      {showFilters && (
        <div className="si-form" style={{ maxWidth: "none" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--sd-space-3, .75rem)" }}>
            <div className="si-field" style={{ flex: "1 1 14rem", minWidth: 0 }}>
              <label className="si-label" htmlFor="assistants-search">
                {LIST.searchLabel}
              </label>
              <input
                id="assistants-search"
                className="si-input"
                type="search"
                value={search}
                placeholder={LIST.searchPlaceholder}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="si-field" style={{ flex: "0 1 12rem", minWidth: 0 }}>
              <label className="si-label" htmlFor="assistants-status">
                {LIST.statusFilterLabel}
              </label>
              <select
                id="assistants-status"
                className="si-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <SegmentedControl<ViewMode>
              value={view}
              onChange={setView}
              aria-label={LIST.viewLabel}
              options={[
                { value: "cards", label: LIST.cards, "aria-label": LIST.cardsView },
                { value: "table", label: LIST.table, "aria-label": LIST.tableView },
              ]}
            />
          </div>
        </div>
      )}

      {!isError && singleAssistant && (
        <AssistantSummary
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
      )}

      {!isError && !singleAssistant && (!assistants || assistants.length === 0) && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{LIST.emptyTitle}</h3>
          <p className="sd-empty__detail">{LIST.emptyDetail}</p>
          <p style={{ marginTop: "var(--sd-space-4, 1rem)" }}>
            <Button onClick={() => navigate(NEW_PATH)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {LIST.newAssistant}
            </Button>
          </p>
        </div>
      )}

      {!isError && !singleAssistant && assistants && assistants.length > 0 && filtered.length === 0 && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{LIST.noMatchTitle}</h3>
          <p className="sd-empty__detail">{LIST.noMatchDetail}</p>
        </div>
      )}

      {!isError && !singleAssistant && filtered.length > 0 && (
        <ul className="sd-list">
          {filtered.map((assistant) => (
            <li className="sd-list__item" key={assistant.id}>
              {view === "table" ? (
                <div className="sd-row">
                  <button
                    type="button"
                    onClick={() => openAssistant(assistant)}
                    aria-label={openAccessibleName(assistant.name)}
                    className="sd-row__who"
                    style={{
                      border: 0,
                      background: "none",
                      cursor: "pointer",
                      font: "inherit",
                      fontWeight: 500,
                      textAlign: "left",
                    }}
                  >
                    {assistant.name}
                  </button>
                  <StatusChip label={STATUS_LABEL[assistant.status]} tone={STATUS_CHIP_TONE[assistant.status]} />
                  <span className="sd-row__when">{formatUpdatedAt(assistant.updatedAt)}</span>
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
              ) : (
                <div style={{ padding: "var(--sd-space-4, 1rem)" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--sd-space-3, .75rem)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openAssistant(assistant)}
                      aria-label={openAccessibleName(assistant.name)}
                      className="sd-link"
                      style={{ border: 0, background: "none", cursor: "pointer", font: "inherit", fontWeight: 600 }}
                    >
                      {assistant.name}
                    </button>
                    <StatusChip label={STATUS_LABEL[assistant.status]} tone={STATUS_CHIP_TONE[assistant.status]} />
                  </div>
                  <p style={MUTED}>
                    {templateDisplayName(assistant.templateKey)} · {LIST.colUpdated}{" "}
                    {formatUpdatedAt(assistant.updatedAt)}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sd-space-3, .75rem)",
                      marginTop: "var(--sd-space-3, .75rem)",
                    }}
                  >
                    <span style={{ ...MUTED, marginTop: 0 }}>
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
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialogTitle(deleteTarget?.name ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{LIST.deleteDetail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{LIST.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {LIST.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
