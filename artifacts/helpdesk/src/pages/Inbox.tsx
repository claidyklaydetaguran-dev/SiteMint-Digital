/**
 * Frontend V2 Phase 8 — the SMS Conversations workspace.
 *
 * Mounted at `ROUTES.conversations` (`/conversations`, base-relative) inside
 * the Phase 7 `DashboardShell`. It inherits that shell's navigation rail, its
 * `<main>` landmark, its skip link, its palette and its motion system; it adds
 * no second design system and no chrome of its own.
 *
 * ── Requests, unchanged ───────────────────────────────────────────────────
 * Two authenticated GETs, exactly as before this file was rewritten:
 *   • `GET /api/receptionist/conversations`      — 30s refetch, via `useConversations`
 *   • `GET /api/receptionist/conversations/:id`  — 15s refetch, enabled by selection
 * Same paths, same methods, same (absent) payloads, same response shapes, same
 * query keys, same intervals, same cookie-based session. Nothing is posted,
 * patched or deleted; firm scoping stays entirely server-side, and a
 * conversation belonging to another firm 404s at the API exactly as before.
 *
 * ── What this workspace deliberately does not have ────────────────────────
 * A reply composer. There is no send endpoint in this product — see the header
 * of `conversationsContract.ts` for the full evidence — so instead of a
 * disabled text box (which implies a capability that would enable under some
 * condition), the composer region states plainly who is answering and why the
 * operator cannot type. `messagingState().canSend` is typed `false`, so an
 * enabled send control cannot be added here by accident.
 *
 * ── Defects in the previous workspace that this fixes ─────────────────────
 *  1. **A failed request rendered as an empty inbox.** `isError` was never
 *     read, so a 500 told an owner "No conversations found" — that their
 *     business had no leads. List and detail failures are now distinct,
 *     announced, and retryable.
 *  2. **The list was not keyboard operable as a selector.** Rows were
 *     `<div role="button">` with `aria-selected`, which is not valid on
 *     `button` and gave no arrow-key navigation. It is now a real listbox
 *     with roving tabindex.
 *  3. **Messages could render under the wrong contact.** Nothing checked that
 *     the loaded detail matched the current selection. It is checked now.
 *  4. **Mobile had no way back to the list from an error or empty thread** —
 *     the back control lived inside the loaded thread only.
 *  5. **Random per-phone avatar colours** carried no meaning and included
 *     indigo and violet, outside the approved palette. They are gone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bot,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useConversations } from "@/hooks/useConversations";
import { relativeTime } from "@/lib/conversationUi";
import {
  attentionOf,
  detailFailure,
  emptyCopy,
  filterConversations,
  formatAbsolute,
  formatTimeOfDay,
  groupMessagesByDay,
  isoAttribute,
  listFailure,
  messagingState,
  senderLabel,
  statusCounts,
  statusPresentation,
  tierLabel,
  type ContractConversation,
  type ContractMessage,
  type StatusFilter,
} from "@/pages/conversations/conversationsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-conversations.css";

interface ConversationDetail {
  conversation: ContractConversation;
  messages: ContractMessage[];
}

/** Unchanged request: same path, method, key and 15s interval as the baseline. */
function useConversationDetail(id: number | null) {
  return useQuery<ConversationDetail>({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<ConversationDetail>(`/receptionist/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "opted_out", label: "Opted out" },
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const list = useConversations();
  const detail = useConversationDetail(selectedId);

  const conversations = list.data;
  const counts = useMemo(() => statusCounts(conversations ?? []), [conversations]);
  const visible = useMemo(
    () => filterConversations(conversations ?? [], { status: statusFilter, query }),
    [conversations, statusFilter, query],
  );

  // The selected row's own summary, taken from the list rather than the detail
  // response, so the header identity is correct the instant a row is clicked
  // and never waits on a request.
  const selectedSummary = useMemo(
    () => conversations?.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const backRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<number | null>(null);

  const selectConversation = useCallback((id: number) => {
    setSelectedId(id);
    returnFocusRef.current = id;
    setMobileView("thread");
  }, []);

  const backToList = useCallback(() => {
    setMobileView("list");
  }, []);

  // Mobile master/detail focus contract: entering the thread lands on the way
  // back out; returning to the list lands on the row that was open. Neither
  // transition drops focus to `<body>`.
  useEffect(() => {
    if (mobileView !== "thread") return;
    backRef.current?.focus();
  }, [mobileView, selectedId]);

  useEffect(() => {
    if (mobileView !== "list") return;
    const id = returnFocusRef.current;
    if (id === null) return;
    const option = document.getElementById(`sc-option-${id}`);
    option?.focus();
  }, [mobileView]);

  return (
    <div className="sc-workspace" data-view={mobileView}>
      <ConversationListPane
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        counts={counts}
        conversations={visible}
        totalCount={conversations?.length ?? 0}
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        selectedId={selectedId}
        onSelect={selectConversation}
      />

      <ThreadPane
        selectedId={selectedId}
        summary={selectedSummary}
        detail={detail.data}
        isLoading={detail.isLoading}
        isError={detail.isError}
        error={detail.error}
        onRetry={() => void detail.refetch()}
        onBack={backToList}
        backRef={backRef}
      />
    </div>
  );
}

// ─── List pane ─────────────────────────────────────────────────────────────

function ConversationListPane({
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  counts,
  conversations,
  totalCount,
  isLoading,
  isError,
  error,
  onRetry,
  selectedId,
  onSelect,
}: {
  query: string;
  onQuery: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (value: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
  conversations: ContractConversation[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  // Roving tabindex: the list is a single tab stop, and arrow keys move
  // *focus* only. Selection stays explicit (Enter/Space/click) because
  // selecting issues a request — selection-following-focus would fire one per
  // keystroke.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const activeId =
    conversations.some((c) => c.id === focusedId)
      ? focusedId
      : conversations.some((c) => c.id === selectedId)
        ? selectedId
        : (conversations[0]?.id ?? null);

  const moveFocus = (delta: number | "first" | "last") => {
    if (conversations.length === 0) return;
    const current = conversations.findIndex((c) => c.id === activeId);
    let next: number;
    if (delta === "first") next = 0;
    else if (delta === "last") next = conversations.length - 1;
    else next = Math.min(conversations.length - 1, Math.max(0, (current < 0 ? 0 : current) + delta));
    const target = conversations[next];
    if (!target) return;
    setFocusedId(target.id);
    listRef.current
      ?.querySelector<HTMLElement>(`#sc-option-${target.id}`)
      ?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus("first");
        break;
      case "End":
        event.preventDefault();
        moveFocus("last");
        break;
      default:
        break;
    }
  };

  const empty = emptyCopy({ status: statusFilter, query, totalCount });
  const failure = isError ? listFailure(error) : null;

  return (
    <section className="sc-list" aria-label="Conversations">
      <div className="sc-list__head">
        <div className="sc-list__title">
          <h1 className="sc-h1">Conversations</h1>
          {!isLoading && !isError && (
            <span className="sc-count">
              {conversations.length}
              <span className="sd-sr"> conversations shown</span>
            </span>
          )}
        </div>

        <div className="sc-search">
          <Search className="sc-search__icon" aria-hidden="true" />
          <input
            id="sc-search"
            type="search"
            className="sc-search__input"
            placeholder="Search by number"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            aria-label="Search conversations by phone number"
          />
        </div>

        <div className="sc-filters" role="group" aria-label="Filter conversations by status">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="sc-filter"
              data-active={statusFilter === filter.key}
              aria-pressed={statusFilter === filter.key}
              onClick={() => onStatusFilter(filter.key)}
            >
              {filter.label}
              <span className="sc-filter__count">{counts[filter.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sc-list__body">
        {isLoading ? (
          <div aria-busy="true">
            <p className="sd-sr" role="status">
              Loading conversations
            </p>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="sc-skel" />
            ))}
          </div>
        ) : failure ? (
          <div className="sc-notice sc-notice--danger" role="alert">
            <AlertTriangle className="sc-notice__icon" aria-hidden="true" />
            <div className="sc-notice__body">
              <p className="sc-notice__title">{failure.title}</p>
              <p className="sc-notice__detail">{failure.detail}</p>
              {!failure.isSession && (
                <button type="button" className="sc-button" onClick={onRetry}>
                  <RefreshCw className="sc-button__icon" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="sc-empty">
            <MessageSquare className="sc-empty__icon" aria-hidden="true" />
            <p className="sc-empty__title">{empty.title}</p>
            <p className="sc-empty__detail">{empty.detail}</p>
          </div>
        ) : (
          <ul
            ref={listRef}
            className="sc-options"
            role="listbox"
            aria-label="Conversations"
            onKeyDown={onKeyDown}
          >
            {conversations.map((conversation) => (
              <ConversationOption
                key={conversation.id}
                conversation={conversation}
                selected={selectedId === conversation.id}
                tabbable={activeId === conversation.id}
                onSelect={() => onSelect(conversation.id)}
                onFocus={() => setFocusedId(conversation.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConversationOption({
  conversation,
  selected,
  tabbable,
  onSelect,
  onFocus,
}: {
  conversation: ContractConversation;
  selected: boolean;
  tabbable: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const status = statusPresentation(conversation.status);
  const attention = attentionOf(conversation);

  return (
    <li
      id={`sc-option-${conversation.id}`}
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      className="sc-option"
      data-selected={selected}
      onClick={onSelect}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="sc-option__top">
        <span className="sc-option__phone">{conversation.callerPhone}</span>
        <time className="sc-option__when" dateTime={isoAttribute(conversation.lastMessageAt)}>
          <span aria-hidden="true">{relativeTime(conversation.lastMessageAt)}</span>
          <span className="sd-sr">
            Last message {formatAbsolute(conversation.lastMessageAt)}
          </span>
        </time>
      </span>

      <span className="sc-option__meta">
        <span className="sc-chip" data-tone={status.tone}>
          {status.label}
        </span>
        <span className="sc-chip" data-tone="quiet">
          {tierLabel(conversation.tier)}
        </span>
        {conversation.isOverCap && (
          <span className="sc-chip" data-tone="warn">
            <AlertTriangle className="sc-chip__icon" aria-hidden="true" />
            Over trial limit
          </span>
        )}
      </span>

      {attention.summary && <span className="sd-sr">{attention.summary}</span>}
    </li>
  );
}

// ─── Thread pane ───────────────────────────────────────────────────────────

function ThreadPane({
  selectedId,
  summary,
  detail,
  isLoading,
  isError,
  error,
  onRetry,
  onBack,
  backRef,
}: {
  selectedId: number | null;
  summary: ContractConversation | null;
  detail: ConversationDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
  backRef: React.RefObject<HTMLButtonElement | null>;
}) {
  // The detail response is only trusted when it is the response for the
  // current selection. Without this a slow reply for a previous conversation
  // could paint its messages under the newly selected contact.
  const loaded = detail && detail.conversation.id === selectedId ? detail : undefined;
  const conversation = loaded?.conversation ?? summary ?? null;
  const failure = isError ? detailFailure(error) : null;

  if (selectedId === null) {
    return (
      <section className="sc-thread sc-thread--blank" aria-label="Selected conversation">
        <div className="sc-empty">
          <MessageSquare className="sc-empty__icon" aria-hidden="true" />
          <p className="sc-empty__title">No conversation selected</p>
          <p className="sc-empty__detail">
            Choose a conversation to read its messages.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="sc-thread" aria-label="Selected conversation">
      <div className="sc-thread__bar">
        <button ref={backRef} type="button" className="sc-back" onClick={onBack}>
          <ArrowLeft className="sc-button__icon" aria-hidden="true" />
          Back to conversations
        </button>
      </div>

      {conversation ? (
        <ThreadHeader conversation={conversation} />
      ) : (
        <div className="sc-thread__head">
          <div className="sc-skel sc-skel--title" />
        </div>
      )}

      {failure ? (
        <div className="sc-thread__state">
          <div className="sc-notice sc-notice--danger" role="alert">
            <AlertTriangle className="sc-notice__icon" aria-hidden="true" />
            <div className="sc-notice__body">
              <p className="sc-notice__title">{failure.title}</p>
              <p className="sc-notice__detail">{failure.detail}</p>
              {!failure.isSession && (
                <button type="button" className="sc-button" onClick={onRetry}>
                  <RefreshCw className="sc-button__icon" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      ) : !loaded ? (
        <div className="sc-thread__state" aria-busy="true">
          <p className="sd-sr" role="status">
            Loading conversation
          </p>
          <div className="sc-skel sc-skel--line" />
          <div className="sc-skel sc-skel--line" />
          <div className="sc-skel sc-skel--line" />
        </div>
      ) : (
        <MessageHistory
          key={selectedId}
          conversation={loaded.conversation}
          messages={loaded.messages}
        />
      )}

      {conversation && <MessagingStatus conversation={conversation} />}
    </section>
  );
}

function ThreadHeader({ conversation }: { conversation: ContractConversation }) {
  const status = statusPresentation(conversation.status);
  const attention = attentionOf(conversation);

  return (
    <header className="sc-thread__head">
      <h2 className="sc-thread__phone">{conversation.callerPhone}</h2>

      <div className="sc-thread__chips">
        <span className="sc-chip" data-tone={status.tone}>
          {status.label}
        </span>
        <span className="sc-chip" data-tone="quiet">
          {tierLabel(conversation.tier)}
        </span>
        <span className="sc-chip" data-tone="quiet">
          SMS
        </span>
      </div>

      <p className="sc-thread__timeline">
        Started{" "}
        <time dateTime={isoAttribute(conversation.createdAt)}>
          {formatAbsolute(conversation.createdAt)}
        </time>
        <span aria-hidden="true"> · </span>
        Last message{" "}
        <time dateTime={isoAttribute(conversation.lastMessageAt)}>
          {formatAbsolute(conversation.lastMessageAt)}
        </time>
      </p>

      {conversation.disqualifyReason && (
        <p className="sc-thread__reason">
          <span className="sc-thread__reasonlabel">Why this tier</span>
          {conversation.disqualifyReason}
        </p>
      )}

      {attention.warnings.map((warning) => (
        <div key={warning} className="sc-notice sc-notice--warn">
          <AlertTriangle className="sc-notice__icon" aria-hidden="true" />
          <div className="sc-notice__body">
            <p className="sc-notice__title">{warning}</p>
            <p className="sc-notice__detail">
              Conversations past the trial limit still arrive, but upgrading keeps them
              from counting against you.
            </p>
          </div>
        </div>
      ))}
    </header>
  );
}

function MessageHistory({
  conversation,
  messages,
}: {
  conversation: ContractConversation;
  messages: ContractMessage[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef<{ conversationId: number; lastMessageId: number | null } | null>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]!.id : null;

  // Scroll intent, stated explicitly: opening a conversation jumps to the
  // newest message with no animation; a genuinely new message arriving in the
  // conversation already open eases down to it. The whole historical list is
  // never animated, and nothing here triggers a request.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const previous = seen.current;
    const changedConversation = previous?.conversationId !== conversation.id;
    seen.current = { conversationId: conversation.id, lastMessageId };
    if (!changedConversation && previous?.lastMessageId === lastMessageId) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: changedConversation || prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [conversation.id, lastMessageId]);

  if (messages.length === 0) {
    return (
      <div className="sc-thread__state">
        <div className="sc-empty">
          <MessageSquare className="sc-empty__icon" aria-hidden="true" />
          <p className="sc-empty__title">No messages in this conversation</p>
          <p className="sc-empty__detail">
            Nothing has been exchanged with this number yet.
          </p>
        </div>
      </div>
    );
  }

  const groups = groupMessagesByDay(messages);

  return (
    <div ref={scrollRef} className="sc-history sc-enter" tabIndex={0} aria-label="Message history">
      {groups.map((group) => (
        <section key={group.key} className="sc-day" aria-label={group.label}>
          <h3 className="sc-day__label">{group.label}</h3>
          <ol className="sc-day__list">
            {group.messages.map((message) => (
              <li
                key={message.id}
                className="sc-message"
                data-direction={message.direction}
              >
                <p className="sc-message__from">
                  {senderLabel(message, conversation)}
                  <span aria-hidden="true"> · </span>
                  <time dateTime={isoAttribute(message.createdAt)}>
                    <span aria-hidden="true">{formatTimeOfDay(message.createdAt)}</span>
                    <span className="sd-sr">{formatAbsolute(message.createdAt)}</span>
                  </time>
                </p>
                <p className="sc-message__body">{message.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * The composer region. It carries information, not a control, because the
 * product has no dashboard send path — see this file's header. Rendering a
 * disabled input here would promise a text box that becomes usable under some
 * condition; none exists.
 */
function MessagingStatus({ conversation }: { conversation: ContractConversation }) {
  const state = messagingState(conversation);
  const Icon = state.key === "opted-out" ? Ban : Bot;

  return (
    <footer className="sc-messaging" data-tone={state.tone}>
      <Icon className="sc-messaging__icon" aria-hidden="true" />
      <div className="sc-messaging__body">
        <p className="sc-messaging__title">{state.title}</p>
        <p className="sc-messaging__detail">{state.detail}</p>
      </div>
    </footer>
  );
}
