import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmLayout } from "./CrmLayout";
import {
  AlertCircle, ArrowLeft, BookOpen, Check, ChevronDown, Clock, Eye, EyeOff,
  Inbox, LifeBuoy, Loader2, Lock, Mail, Plus, RefreshCw, Search, Send, Tag,
  UserCircle, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── M4: Support ──────────────────────────────────────────────────────────────
//
// One screen for everything after the sale: the queue, one ticket's whole
// conversation, and the answers worth writing down once.
//
// The design decision this page exists to hold is the line between a reply to
// the client and a note to ourselves. It is never implied:
//
//   - the composer has two explicit modes and opens on the private one, so a
//     mistaken send falls on the safe side;
//   - a customer reply mode announces, in the composer, that the client will
//     see it;
//   - internal notes render as a visually distinct block with a padlock and the
//     words "the client cannot see this";
//   - "What the client sees" reads the server's own customer-facing projection
//     rather than filtering the thread here, so this page cannot claim a
//     guarantee the API does not actually make.
//
// The second line this page holds is between a reply being SENT and a reply
// ARRIVING (M5). A customer reply is now genuinely emailed, and every one of
// them carries the real outcome:
//
//   - the strongest thing shown is "Accepted by the mail provider", never
//     "Sent" — the label comes from the server and is not composed here, so
//     this screen cannot invent a stronger claim than the API makes;
//   - a refused or unknown delivery is rendered as a problem with the reasons
//     and the actions a person can take, not hidden behind a tick;
//   - an internal note has NO delivery badge at all, because no delivery
//     exists for it — a "not applicable" state would imply one could.
//
// Every vocabulary — statuses, the state machine, priorities, resolutions —
// comes from `/api/crm/support/vocabulary`. Nothing here hard-codes a list, so
// this screen can never offer a button the API will refuse.

// ── The live API contract ────────────────────────────────────────────────────

interface Vocabulary {
  statuses: string[];
  activeStatuses: string[];
  transitions: Record<string, string[]>;
  priorities: string[];
  resolutions: string[];
  sources: string[];
  requestTypes: string[];
  visibilities: string[];
}

interface TicketRow {
  id: number;
  reference: string;
  subject: string;
  description?: string | null;
  status: string;
  priority: string;
  source: string;
  requestType?: string | null;
  leadId: number;
  projectId?: number | null;
  assignedToStaffId?: number | null;
  assigneeName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactCompany?: string | null;
  projectName?: string | null;
  allowedTransitions: string[];
  isActive: boolean;
  resolution?: string | null;
  resolutionNote?: string | null;
  firstResponseAt?: string | null;
  reopenCount: number;
  kbArticleId?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What actually happened to a message that was meant to reach the client.
 *
 * The server decides the words. This screen never invents a label, and in
 * particular never turns `accepted` into "Sent": the provider taking a message
 * is not the client receiving it, and a screen that says otherwise leaves
 * somebody believing a client has read something that bounced.
 */
interface DeliveryView {
  state: string;
  label: string;
  tone: "waiting" | "working" | "accepted" | "attention";
  explanation: string;
  needsAttention: boolean;
  attempt: number;
  nextAttemptAt?: string | null;
  deliveredTo?: string | null;
  providerRef?: string | null;
  failureReason?: string | null;
  failureDetail?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  resolutionNote?: string | null;
  availableActions: Array<"retry" | "resend" | "acknowledge">;
  retryCouldDuplicate: boolean;
}

interface DeliveryStatus {
  canSend: boolean;
  canReceiveReplies: boolean;
  replyDomain?: string | null;
  blockedReason?: string | null;
  inboundNote: string;
}

interface ThreadMessage {
  id: number;
  visibility: "customer" | "internal";
  body: string;
  origin: string;
  sentByStaffId?: number | null;
  sentByLabel?: string | null;
  authorKnown: boolean;
  /** True when the client's own words arrived here by email. */
  arrivedByEmail?: boolean;
  /** Null on an internal note and on the client's own words — no delivery exists. */
  delivery?: DeliveryView | null;
  createdAt: string;
}

interface TicketDetail {
  ticket: TicketRow;
  contact: { id: number; name: string; email: string; company?: string | null } | null;
  project: { id: number; name: string; stage?: string | null } | null;
  article: { id: number; slug: string; title: string; status: string } | null;
  openedByName?: string | null;
  resolvedByName?: string | null;
  messages: ThreadMessage[];
  counts: {
    messages: number;
    customerVisible: number;
    internalNotes: number;
    deliveriesNeedingAttention?: number;
  };
  delivery?: DeliveryStatus;
}

interface CustomerView {
  ticket: { reference: string; subject: string; status: string };
  messages: Array<{ id: number; body: string; from: string; author?: string | null; createdAt: string }>;
}

interface Overview {
  byStatus: Record<string, number>;
  activeByPriority: Record<string, number>;
  unassignedActive: number;
  awaitingFirstReply: number;
  assignedToMe: number | null;
  knowledgeBase: { total: number; published: number };
  /** Replies written to a client that did not reach them. Each is a person waiting. */
  deliveriesNeedingAttention?: number;
  delivery?: DeliveryStatus;
  definitions: Record<string, string>;
}

interface Article {
  id: number;
  slug: string;
  title: string;
  body?: string;
  preview?: string;
  category?: string | null;
  status: string;
  authorLabel?: string | null;
  updatedByLabel?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
}

interface Assignee { id: number; displayName: string; email: string }
interface LeadOption { id: number; name: string; company?: string | null }

// ── Presentation ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-50 text-sky-800 border-sky-200",
  open: "bg-teal-50 text-teal-800 border-teal-200",
  waiting_on_customer: "bg-amber-50 text-amber-800 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
  normal: "bg-muted text-muted-foreground border-border",
  low: "bg-muted text-muted-foreground border-border",
};

/** `waiting_on_customer` → "Waiting on customer". */
function humanise(value?: string | null): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Chip({ text, className }: { text: string; className: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${className}`}>
      {text}
    </span>
  );
}

/**
 * How each delivery tone is coloured.
 *
 * `accepted` is deliberately the same teal as an ordinary customer message
 * rather than a success green: it is a normal outcome, not a guarantee, and
 * dressing it as a tick invites the reading the server refuses to make.
 */
const DELIVERY_TONE: Record<DeliveryView["tone"], string> = {
  waiting: "bg-sky-50 text-sky-800 border-sky-200",
  working: "bg-sky-50 text-sky-800 border-sky-200",
  accepted: "bg-teal-50 text-teal-800 border-teal-200",
  attention: "bg-red-50 text-red-700 border-red-200",
};

const DELIVERY_ICON: Record<DeliveryView["tone"], typeof Check> = {
  waiting: Clock,
  working: Loader2,
  accepted: Check,
  attention: AlertCircle,
};

/** The one-line state of a message, in the server's own words. */
function DeliveryBadge({ delivery }: { delivery: DeliveryView }) {
  const Icon = DELIVERY_ICON[delivery.tone];
  return (
    <span
      title={delivery.explanation}
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${DELIVERY_TONE[delivery.tone]}`}>
      <Icon className={`w-3 h-3 shrink-0 ${delivery.tone === "working" ? "animate-spin" : ""}`} />
      {delivery.label}
    </span>
  );
}

const FIELD =
  "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-1 focus:ring-teal-500";
const SMALL_FIELD =
  "px-2.5 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-1 focus:ring-teal-500";
const GHOST_BUTTON =
  "flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg " +
  "hover:bg-accent transition-colors disabled:opacity-50";
const PRIMARY_BUTTON =
  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg " +
  "hover:bg-teal-700 transition-colors disabled:opacity-50";

export default function CrmSupport() {
  const [tab, setTab] = useState<"tickets" | "kb">("tickets");

  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [matching, setMatching] = useState(0);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [customerView, setCustomerView] = useState<CustomerView | null>(null);

  const [composeMode, setComposeMode] = useState<"internal" | "customer">("internal");
  const [draft, setDraft] = useState("");

  /** The message whose delivery a person is currently deciding about. */
  const [recovering, setRecovering] = useState<{ messageId: number; action: "retry" | "resend" | "acknowledge" } | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");

  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newLead, setNewLead] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newRequestType, setNewRequestType] = useState("");

  const [articles, setArticles] = useState<Article[]>([]);
  const [articleCursor, setArticleCursor] = useState<number | null>(null);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleApplied, setArticleApplied] = useState("");
  const [articleStatus, setArticleStatus] = useState("");
  const [editing, setEditing] = useState<Article | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formBody, setFormBody] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Reads ──────────────────────────────────────────────────────────────────

  const read = useCallback(async (path: string, what: string) => {
    const res = await adminFetch(path);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `${what} could not be loaded (${res.status}).`);
    }
    return res.json();
  }, []);

  const loadQueue = useCallback(async (cursor?: number) => {
    const params = new URLSearchParams({ limit: "25" });
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (assignee) params.set("assignedToStaffId", assignee);
    if (applied) params.set("q", applied);
    if (cursor != null) params.set("cursor", String(cursor));

    const data = await read(`/api/crm/support/tickets?${params.toString()}`, "The ticket queue");
    setTickets(prev => (cursor == null ? data.tickets : [...prev, ...data.tickets]));
    setMatching(data.counts?.matchingFilters ?? 0);
    setByStatus(data.counts?.byStatus ?? {});
    setNextCursor(data.nextCursor ?? null);
  }, [read, status, priority, assignee, applied]);

  const loadArticles = useCallback(async (cursor?: number) => {
    const params = new URLSearchParams({ limit: "25" });
    if (articleApplied) params.set("q", articleApplied);
    if (articleStatus) params.set("status", articleStatus);
    if (cursor != null) params.set("cursor", String(cursor));

    const data = await read(`/api/crm/support/kb?${params.toString()}`, "The knowledge base");
    setArticles(prev => (cursor == null ? data.articles : [...prev, ...data.articles]));
    setArticleCursor(data.nextCursor ?? null);
  }, [read, articleApplied, articleStatus]);

  const loadDetail = useCallback(async (id: number) => {
    const data = await read(`/api/crm/support/tickets/${id}`, "That ticket");
    setDetail(data);
  }, [read]);

  /** First load: everything the screen needs before it can show anything true. */
  const boot = useCallback(async () => {
    setLoading(true);
    setFatal(null);
    try {
      const [vocab, over] = await Promise.all([
        read("/api/crm/support/vocabulary", "The support vocabulary"),
        read("/api/crm/support/overview", "The support summary"),
      ]);
      setVocabulary(vocab);
      setOverview(over);
      await loadQueue();
      // Supporting lists are best-effort: the queue is still usable without a
      // name picker, and a failure here must not blank the whole screen. The
      // articles are loaded here too so the "answer article" linker on a ticket
      // works without first visiting the other tab.
      const [people, contacts] = await Promise.all([
        adminFetch("/api/crm/operations/assignees").catch(() => null),
        adminFetch("/api/crm/leads").catch(() => null),
      ]);
      if (people?.ok) setAssignees((await people.json().catch(() => ({}))).assignees ?? []);
      if (contacts?.ok) setLeads((await contacts.json().catch(() => ({}))).leads ?? []);
      await loadArticles().catch(() => { /* the queue does not depend on it */ });
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Support could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [read, loadQueue, loadArticles]);

  useEffect(() => { void boot(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters re-read the queue from the top; the cursor only ever advances
  // within one filter set.
  useEffect(() => {
    if (loading) return;
    (async () => {
      setBusy(true);
      try { await loadQueue(); setError(null); }
      catch (e) { setError(e instanceof Error ? e.message : "The queue could not be loaded."); }
      finally { setBusy(false); }
    })();
  }, [loadQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== "kb") return;
    (async () => {
      setBusy(true);
      try { await loadArticles(); setError(null); }
      catch (e) { setError(e instanceof Error ? e.message : "The knowledge base could not be loaded."); }
      finally { setBusy(false); }
    })();
  }, [tab, loadArticles]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: number) {
    setOpenId(id);
    setDetail(null);
    setCustomerView(null);
    setDraft("");
    setComposeMode("internal");
    try { await loadDetail(id); }
    catch (e) { setError(e instanceof Error ? e.message : "That ticket could not be opened."); }
  }

  const refreshAll = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.all([
        loadQueue(),
        read("/api/crm/support/overview", "The support summary").then(setOverview),
        openId ? loadDetail(openId) : Promise.resolve(),
      ]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Support could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }, [loadQueue, read, loadDetail, openId]);

  // ── Writes ─────────────────────────────────────────────────────────────────

  /** One place that reports a refusal honestly instead of failing silently. */
  async function write(path: string, body: unknown, method = "POST"): Promise<any | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.accepted
            ? `${data.error} Accepted: ${(data.accepted as string[]).map(humanise).join(", ")}.`
            : data.error || `That was refused (${res.status}).`,
        );
        return null;
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    const leadId = Number(newLead);
    if (!leadId || !newSubject.trim()) {
      setError("A ticket needs a contact and a subject.");
      return;
    }
    const path = newRequestType
      ? "/api/crm/support/service-requests"
      : "/api/crm/support/tickets";
    const data = await write(path, {
      leadId,
      subject: newSubject.trim(),
      description: newDescription.trim() || undefined,
      priority: newPriority,
      ...(newRequestType ? { requestType: newRequestType } : {}),
    });
    if (!data) return;
    setNotice(`${data.ticket.reference} raised.${data.nextStep ? ` ${data.nextStep}` : ""}`);
    setNewOpen(false);
    setNewSubject(""); setNewDescription(""); setNewLead(""); setNewRequestType("");
    setNewPriority("normal");
    await refreshAll();
    await open(data.ticket.id);
  }

  async function send() {
    if (!openId || !draft.trim()) return;
    const data = await write(`/api/crm/support/tickets/${openId}/messages`, {
      visibility: composeMode,
      body: draft.trim(),
    });
    if (!data) return;
    setDraft("");
    // The server's own words for what happened, never a cheerful summary of
    // our own. A reply that did not reach the client says so here.
    const outcome = data.delivery as DeliveryView | null | undefined;
    if (outcome?.needsAttention) {
      setNotice(null);
      setError(`${outcome.label}. ${outcome.explanation}`);
    } else {
      setNotice(outcome ? `${outcome.label}. ${outcome.explanation}` : "Recorded.");
    }
    await refreshAll();
    if (customerView) await showCustomerView();
  }

  /**
   * A person's decision about a reply that did not settle.
   *
   * The reason is required by the API and asked for here rather than sent
   * blank, because the record of who decided what — and why — is the whole
   * point of the action existing.
   */
  async function recoverDelivery(
    messageId: number,
    action: "retry" | "resend" | "acknowledge",
    reason: string,
  ) {
    if (!reason.trim()) {
      setError("Say why. A recovery with no reason is not a record.");
      return;
    }
    const data = await write(`/api/crm/support/messages/${messageId}/delivery-recovery`, {
      action, reason: reason.trim(),
    });
    if (!data) return;
    setRecovering(null);
    setRecoveryReason("");
    const after = data.delivery as DeliveryView | null;
    setNotice(after ? `${after.label}. ${data.note ?? ""}`.trim() : (data.note ?? "Recorded."));
    await refreshAll();
  }

  async function changeStatus(next: string) {
    if (!openId || !detail) return;
    const finishing = next === "resolved" || next === "closed";
    if (finishing && !detail.ticket.resolution) { setResolving(next); return; }
    const data = await write(`/api/crm/support/tickets/${openId}/status`, { status: next });
    if (!data) return;
    setNotice(data.note ?? `Moved to ${humanise(next)}.`);
    await refreshAll();
  }

  async function confirmResolution() {
    if (!openId || !resolving || !resolution) {
      setError("Say why this ticket is finished.");
      return;
    }
    const data = await write(`/api/crm/support/tickets/${openId}/status`, {
      status: resolving, resolution, resolutionNote: resolutionNote.trim() || undefined,
    });
    if (!data) return;
    setResolving(null); setResolution(""); setResolutionNote("");
    setNotice(`Marked ${humanise(data.ticket.status)}.`);
    await refreshAll();
  }

  async function assign(value: string) {
    if (!openId) return;
    const data = await write(`/api/crm/support/tickets/${openId}/assign`, {
      staffId: value === "" ? null : Number(value),
    });
    if (!data) return;
    setNotice(value === "" ? "Returned to the unassigned queue." : "Assigned.");
    await refreshAll();
  }

  async function setTicketPriority(value: string) {
    if (!openId) return;
    const data = await write(`/api/crm/support/tickets/${openId}/priority`, { priority: value });
    if (!data) return;
    await refreshAll();
  }

  async function showCustomerView() {
    if (!openId) return;
    try {
      const data = await read(`/api/crm/support/tickets/${openId}/customer-view`, "The client's view");
      setCustomerView(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The client's view could not be loaded.");
    }
  }

  async function linkArticle(articleId: number | null) {
    if (!openId) return;
    const data = await write(`/api/crm/support/tickets/${openId}/article`, { articleId });
    if (!data) return;
    setNotice(articleId == null ? "Article unlinked." : "Article linked to this ticket.");
    await refreshAll();
  }

  function startArticle(article: Article | null) {
    setEditing(article);
    setEditorOpen(true);
    setFormTitle(article?.title ?? "");
    setFormSlug(article?.slug ?? "");
    setFormCategory(article?.category ?? "");
    setFormBody(article?.body ?? article?.preview ?? "");
  }

  async function openArticle(id: number) {
    try {
      const data = await read(`/api/crm/support/kb/${id}`, "That article");
      startArticle(data.article);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That article could not be opened.");
    }
  }

  async function saveArticle() {
    if (!formTitle.trim() || !formBody.trim()) {
      setError("An article needs a title and a body.");
      return;
    }
    const payload = {
      title: formTitle.trim(),
      body: formBody.trim(),
      category: formCategory.trim() || null,
      ...(formSlug.trim() ? { slug: formSlug.trim() } : {}),
    };
    const data = editing
      ? await write(`/api/crm/support/kb/${editing.id}`, payload, "PATCH")
      : await write("/api/crm/support/kb", payload);
    if (!data) return;
    setNotice(editing ? "Article saved." : "Article created as a draft.");
    setEditorOpen(false);
    setEditing(null);
    setBusy(true);
    try { await loadArticles(); } finally { setBusy(false); }
  }

  async function togglePublished(article: Article) {
    const data = await write(`/api/crm/support/kb/${article.id}/publish`, {
      published: article.status !== "published",
    });
    if (!data) return;
    setNotice(data.article.status === "published" ? "Published." : "Moved back to draft.");
    setBusy(true);
    try { await loadArticles(); } finally { setBusy(false); }
  }

  const statusOptions = vocabulary?.statuses ?? [];
  const allowedNext = detail?.ticket.allowedTransitions ?? [];

  const urgentActive = useMemo(
    () => (overview ? (overview.activeByPriority["urgent"] ?? 0) : 0),
    [overview],
  );

  // ── States before content ──────────────────────────────────────────────────

  if (loading) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </CrmLayout>
    );
  }

  if (fatal) {
    return (
      <CrmLayout>
        <div className="p-4 sm:p-6">
          <div className="max-w-lg mx-auto mt-10 border border-red-200 bg-red-50 rounded-xl p-5 text-center">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
            <h1 className="text-sm font-bold text-red-900 mt-2">Support could not be loaded</h1>
            <p className="text-xs text-red-700 mt-1.5">{fatal}</p>
            <button onClick={() => void boot()} className={`${PRIMARY_BUTTON} mx-auto mt-4`}>
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-teal-600" /> Support
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Client problems and requests, who owns each one, and the answers worth keeping.
            </p>
          </div>
          <button onClick={() => void refreshAll()} disabled={busy} className={`${GHOST_BUTTON} ml-auto`}>
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <button onClick={() => void refreshAll()} className="text-[11px] text-red-700 underline shrink-0">
              Retry
            </button>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 flex-1">{notice}</p>
            <button onClick={() => setNotice(null)} className="text-teal-700 hover:text-teal-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {([["tickets", "Tickets", Inbox], ["kb", "Knowledge base", BookOpen]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium -mb-px border-b-2 transition-colors ${
                tab === id
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "tickets" && (
          <>
            {/* Summary */}
            {overview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-background border border-border rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nobody owns</p>
                  <p className={`text-2xl font-bold mt-1 ${overview.unassignedActive > 0 ? "text-amber-700" : "text-foreground"}`}>
                    {overview.unassignedActive}
                  </p>
                </div>
                <div className="bg-background border border-border rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">No reply yet</p>
                  <p className={`text-2xl font-bold mt-1 ${overview.awaitingFirstReply > 0 ? "text-red-600" : "text-foreground"}`}>
                    {overview.awaitingFirstReply}
                  </p>
                </div>
                <div className="bg-background border border-border rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mine, open</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {overview.assignedToMe ?? "—"}
                  </p>
                </div>
                <div className="bg-background border border-border rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Urgent, open</p>
                  <p className={`text-2xl font-bold mt-1 ${urgentActive > 0 ? "text-red-600" : "text-foreground"}`}>
                    {urgentActive}
                  </p>
                </div>
              </div>
            )}

            {/* Replies that were written and did not reach the client. The
                most consequential number on this screen: every one of them is
                somebody still waiting for an answer they believe was sent. */}
            {overview && (overview.deliveriesNeedingAttention ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 min-w-0">
                  <span className="font-semibold">
                    {overview.deliveriesNeedingAttention} {overview.deliveriesNeedingAttention === 1 ? "reply" : "replies"} did not reach the client.
                  </span>{" "}
                  {overview.definitions?.deliveriesNeedingAttention
                    ?? "Open the ticket to see what happened and decide what to do."}
                </p>
              </div>
            )}
            {overview?.delivery && !overview.delivery.canSend && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 min-w-0">
                  <span className="font-semibold">Support cannot email anybody from this server.</span>{" "}
                  {overview.delivery.blockedReason ?? "Mail is not configured."} Replies are still
                  recorded, and each one is marked as not sent rather than quietly dropped.
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4`}>

              {/* ── Queue ─────────────────────────────────────────────────── */}
              <div className={`bg-background border border-border rounded-xl overflow-hidden ${openId ? "hidden xl:block" : ""}`}>
                <div className="px-4 py-3 border-b border-border space-y-2.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Queue
                    </h2>
                    <span className="text-[11px] text-muted-foreground">
                      {matching} matching
                    </span>
                    <button onClick={() => setNewOpen(v => !v)} className={`${GHOST_BUTTON} ml-auto`}>
                      <Plus className="w-3 h-3" /> New
                    </button>
                  </div>

                  <form className="relative" onSubmit={e => { e.preventDefault(); setApplied(search.trim()); }}>
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Subject, description or SUP-00012…"
                      className={`${SMALL_FIELD} w-full pl-8`} />
                  </form>

                  <div className="flex flex-wrap gap-2">
                    <select value={status} onChange={e => setStatus(e.target.value)} className={SMALL_FIELD}>
                      <option value="">Any status</option>
                      {statusOptions.map(s => (
                        <option key={s} value={s}>
                          {humanise(s)}{byStatus[s] != null ? ` (${byStatus[s]})` : ""}
                        </option>
                      ))}
                    </select>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={SMALL_FIELD}>
                      <option value="">Any priority</option>
                      {(vocabulary?.priorities ?? []).map(p => (
                        <option key={p} value={p}>{humanise(p)}</option>
                      ))}
                    </select>
                    <select value={assignee} onChange={e => setAssignee(e.target.value)} className={SMALL_FIELD}>
                      <option value="">Anyone</option>
                      <option value="unassigned">Unassigned</option>
                      {assignees.map(a => (
                        <option key={a.id} value={String(a.id)}>{a.displayName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {newOpen && (
                  <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-2.5">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contact</span>
                      <select value={newLead} onChange={e => setNewLead(e.target.value)} className={`${FIELD} mt-1`}>
                        <option value="">Choose a contact…</option>
                        {leads.map(l => (
                          <option key={l.id} value={String(l.id)}>
                            {l.name}{l.company ? ` — ${l.company}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Subject</span>
                      <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                        placeholder="Contact form stopped sending" className={`${FIELD} mt-1`} />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        What did they say?
                      </span>
                      <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3}
                        placeholder="Their own words. This starts the thread as theirs."
                        className={`${FIELD} mt-1 resize-y`} />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Priority</span>
                        <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className={`${FIELD} mt-1`}>
                          {(vocabulary?.priorities ?? []).map(p => (
                            <option key={p} value={p}>{humanise(p)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Service request?
                        </span>
                        <select value={newRequestType} onChange={e => setNewRequestType(e.target.value)} className={`${FIELD} mt-1`}>
                          <option value="">No — we raised it</option>
                          {(vocabulary?.requestTypes ?? []).map(r => (
                            <option key={r} value={r}>{humanise(r)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNewOpen(false)} className={GHOST_BUTTON}>Cancel</button>
                      <button onClick={() => void createTicket()} disabled={busy} className={`${PRIMARY_BUTTON} ml-auto`}>
                        Raise the ticket
                      </button>
                    </div>
                  </div>
                )}

                {tickets.length === 0 ? (
                  <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                    {matching === 0 && (applied || status || priority || assignee)
                      ? "No tickets match those filters."
                      : "No support tickets yet."}
                  </p>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[560px] overflow-y-auto">
                    {tickets.map(t => (
                      <button key={t.id} onClick={() => void open(t.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          openId === t.id ? "bg-teal-50" : "hover:bg-accent"
                        }`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">{t.reference}</span>
                          <Chip text={humanise(t.status)} className={STATUS_STYLE[t.status] ?? STATUS_STYLE.closed} />
                          <Chip text={humanise(t.priority)} className={PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal} />
                        </div>
                        <p className={`text-sm mt-1 truncate ${openId === t.id ? "font-semibold text-teal-900" : "text-foreground"}`}>
                          {t.subject}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {t.contactName ?? "Unknown contact"}
                          {" · "}
                          {t.assigneeName ?? "unassigned"}
                          {t.firstResponseAt ? "" : " · no reply yet"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {nextCursor != null && (
                  <div className="px-4 py-3 border-t border-border">
                    <button
                      onClick={() => {
                        setBusy(true);
                        loadQueue(nextCursor)
                          .catch(e => setError(e instanceof Error ? e.message : "More tickets could not be loaded."))
                          .finally(() => setBusy(false));
                      }}
                      disabled={busy} className={`${GHOST_BUTTON} w-full justify-center`}>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Show more ({tickets.length} of {matching})
                    </button>
                  </div>
                )}
              </div>

              {/* ── One ticket ────────────────────────────────────────────── */}
              <div className={`space-y-4 ${openId ? "" : "hidden xl:block"}`}>
                {!openId || !detail ? (
                  <div className="bg-background border border-border rounded-xl px-4 py-16 text-center">
                    {openId ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                    ) : (
                      <p className="text-xs text-muted-foreground">Pick a ticket to see its conversation.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-background border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => { setOpenId(null); setDetail(null); setCustomerView(null); }}
                            className="xl:hidden flex items-center gap-1 text-[11px] text-teal-700">
                            <ArrowLeft className="w-3 h-3" /> Queue
                          </button>
                          <span className="text-[10px] font-mono text-muted-foreground">{detail.ticket.reference}</span>
                          <Chip text={humanise(detail.ticket.status)}
                            className={STATUS_STYLE[detail.ticket.status] ?? STATUS_STYLE.closed} />
                          {detail.ticket.reopenCount > 0 && (
                            <Chip text={`Reopened ${detail.ticket.reopenCount}×`} className="bg-amber-50 text-amber-800 border-amber-200" />
                          )}
                        </div>
                        <h2 className="text-base font-bold text-foreground mt-1">{detail.ticket.subject}</h2>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {detail.contact?.name ?? "Unknown contact"}
                          {detail.contact?.company ? ` · ${detail.contact.company}` : ""}
                          {detail.project ? ` · ${detail.project.name}` : ""}
                          {" · raised "}{formatDateTime(detail.ticket.createdAt)}
                          {detail.openedByName ? ` by ${detail.openedByName}` : ""}
                        </p>
                      </div>

                      {/* Controls */}
                      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5">
                          <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          <select value={detail.ticket.assignedToStaffId ?? ""}
                            onChange={e => void assign(e.target.value)} disabled={busy} className={SMALL_FIELD}>
                            <option value="">Unassigned</option>
                            {assignees.map(a => (
                              <option key={a.id} value={String(a.id)}>{a.displayName}</option>
                            ))}
                          </select>
                        </label>

                        <label className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                          <select value={detail.ticket.priority}
                            onChange={e => void setTicketPriority(e.target.value)} disabled={busy} className={SMALL_FIELD}>
                            {(vocabulary?.priorities ?? []).map(p => (
                              <option key={p} value={p}>{humanise(p)}</option>
                            ))}
                          </select>
                        </label>

                        {/* Only the moves the state machine actually allows. */}
                        {allowedNext.map(next => (
                          <button key={next} onClick={() => void changeStatus(next)} disabled={busy}
                            className={GHOST_BUTTON}>
                            {humanise(next)}
                          </button>
                        ))}

                        <button
                          onClick={() => (customerView ? setCustomerView(null) : void showCustomerView())}
                          className={`${GHOST_BUTTON} ml-auto`}>
                          {customerView ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {customerView ? "Back to the full thread" : "What the client sees"}
                        </button>
                      </div>

                      {detail.ticket.resolution && (
                        <p className="px-4 py-2 border-b border-border text-[11px] text-muted-foreground">
                          Resolution: <span className="text-foreground font-medium">{humanise(detail.ticket.resolution)}</span>
                          {detail.ticket.resolutionNote ? ` — ${detail.ticket.resolutionNote}` : ""}
                          {detail.resolvedByName ? ` (${detail.resolvedByName})` : ""}
                        </p>
                      )}

                      {resolving && (
                        <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-2.5">
                          <p className="text-xs text-foreground font-medium">
                            Why is this ticket {humanise(resolving).toLowerCase()}?
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <select value={resolution} onChange={e => setResolution(e.target.value)} className={FIELD}>
                              <option value="">Choose a reason…</option>
                              {(vocabulary?.resolutions ?? []).map(r => (
                                <option key={r} value={r}>{humanise(r)}</option>
                              ))}
                            </select>
                            <input value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                              placeholder="Anything else worth recording" className={FIELD} />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setResolving(null); setResolution(""); setResolutionNote(""); }}
                              className={GHOST_BUTTON}>Cancel</button>
                            <button onClick={() => void confirmResolution()} disabled={busy || !resolution}
                              className={`${PRIMARY_BUTTON} ml-auto`}>
                              Mark {humanise(resolving).toLowerCase()}
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            A reason is required so the same problem can be counted next time.
                          </p>
                        </div>
                      )}

                      {/* Thread */}
                      {customerView ? (
                        <div className="divide-y divide-border/60">
                          <p className="px-4 py-2 text-[11px] text-teal-800 bg-teal-50 border-b border-teal-200">
                            This is exactly what the client can see — the server returns only
                            customer-visible messages, so internal notes are not in this list at all.
                          </p>
                          {customerView.messages.length === 0 ? (
                            <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                              Nothing has been said to the client yet.
                            </p>
                          ) : customerView.messages.map(m => (
                            <div key={m.id} className="px-4 py-3">
                              <p className="text-[11px] text-muted-foreground">
                                {m.from === "you" ? "Them" : m.author ?? "SiteMint Digital"} · {formatDateTime(m.createdAt)}
                              </p>
                              <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{m.body}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
                          {detail.messages.map(m => (
                            <div key={m.id}
                              className={`px-4 py-3 ${m.visibility === "internal" ? "bg-amber-50/60 border-l-4 border-amber-400" : ""}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                {m.visibility === "internal" ? (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                    <Lock className="w-3 h-3" /> Internal note — the client cannot see this
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                                    {m.origin === "customer" ? "From the client" : "To the client"}
                                  </span>
                                )}
                                {m.arrivedByEmail && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Mail className="w-3 h-3" /> By email
                                  </span>
                                )}
                                {/* Null on an internal note and on the client's
                                    own words: no delivery exists, so none is
                                    described. */}
                                {m.delivery && <DeliveryBadge delivery={m.delivery} />}
                                <span className="text-[11px] text-muted-foreground ml-auto">
                                  {formatDateTime(m.createdAt)}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {m.origin === "customer"
                                  ? detail.contact?.name ?? "The client"
                                  : m.authorKnown
                                    ? m.sentByLabel
                                    : "Author not recorded (imported before this was tracked)"}
                              </p>
                              <p className="text-sm text-foreground whitespace-pre-wrap mt-1.5">{m.body}</p>

                              {m.delivery?.needsAttention && (
                                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                  <p className="text-[11px] text-red-800">{m.delivery.explanation}</p>
                                  {m.delivery.deliveredTo && (
                                    <p className="text-[11px] text-red-700/80 mt-0.5 break-all">
                                      Aimed at {m.delivery.deliveredTo} · attempt {m.delivery.attempt}
                                    </p>
                                  )}

                                  {recovering?.messageId === m.id ? (
                                    <div className="mt-2 space-y-2">
                                      <p className="text-[11px] text-red-800">
                                        {recovering.action === "resend"
                                          ? "A second copy will be sent with a new idempotency key, so the client may receive two."
                                          : recovering.action === "retry"
                                            ? m.delivery.retryCouldDuplicate
                                              ? "The provider no longer collapses a repeat of this message, so a retry can genuinely duplicate it."
                                              : "The original idempotency key is reused, so the provider collapses this into the first send if that send did reach it."
                                            : "This closes the case without sending anything. What happened is left on the record exactly as it is."}
                                      </p>
                                      <input value={recoveryReason} onChange={e => setRecoveryReason(e.target.value)}
                                        placeholder="Why are you doing this?" className={FIELD} />
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={() => { setRecovering(null); setRecoveryReason(""); }}
                                          className={GHOST_BUTTON}>Cancel</button>
                                        <button
                                          onClick={() => void recoverDelivery(m.id, recovering.action, recoveryReason)}
                                          disabled={busy || !recoveryReason.trim()}
                                          className={`${PRIMARY_BUTTON} ml-auto`}>
                                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                          Confirm {recovering.action}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                      {m.delivery.availableActions.map(a => (
                                        <button key={a}
                                          onClick={() => { setRecovering({ messageId: m.id, action: a }); setRecoveryReason(""); }}
                                          className={GHOST_BUTTON}>
                                          {a === "retry" ? "Try again" : a === "resend" ? "Send a new copy" : "Acknowledge"}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {m.delivery?.resolvedAt && (
                                <p className="text-[11px] text-muted-foreground mt-1.5">
                                  Closed {formatDateTime(m.delivery.resolvedAt)}
                                  {m.delivery.resolutionNote ? ` — ${m.delivery.resolutionNote}` : ""}
                                </p>
                              )}
                            </div>
                          ))}
                          {detail.messages.length === 0 && (
                            <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                              Nothing on this ticket yet.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Composer */}
                      <div className="px-4 py-3 border-t border-border space-y-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={() => setComposeMode("internal")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              composeMode === "internal"
                                ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
                                : "border-border text-muted-foreground hover:bg-accent"
                            }`}>
                            <Lock className="w-3.5 h-3.5" /> Internal note
                          </button>
                          <button onClick={() => setComposeMode("customer")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              composeMode === "customer"
                                ? "bg-teal-50 border-teal-300 text-teal-900 font-medium"
                                : "border-border text-muted-foreground hover:bg-accent"
                            }`}>
                            <Send className="w-3.5 h-3.5" /> Reply to the client
                          </button>
                        </div>

                        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
                          placeholder={composeMode === "internal"
                            ? "A note for us. It never leaves the CRM."
                            : "What the client will read."}
                          className={`${FIELD} resize-y ${
                            composeMode === "customer" ? "border-teal-300" : "border-amber-300"
                          }`} />

                        {/* Whether this server can reach anybody at all, said
                            before the button is pressed rather than after.
                            A reply written while mail is off is still recorded
                            and still visibly marked as not sent. */}
                        {composeMode === "customer" && detail.delivery && !detail.delivery.canSend && (
                          <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            This server cannot send mail right now, so this reply will be recorded and
                            marked as not sent rather than reaching the client.
                            {detail.delivery.blockedReason ? ` ${detail.delivery.blockedReason}` : ""}
                          </p>
                        )}
                        {composeMode === "customer" && detail.delivery?.canSend && !detail.delivery.canReceiveReplies && (
                          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            This will be emailed, but no reply address is configured — if the client
                            answers, their reply will not land on this ticket.
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-[11px] flex-1 min-w-[180px] ${
                            composeMode === "customer" ? "text-teal-800" : "text-amber-800"
                          }`}>
                            {composeMode === "customer"
                              ? "The client can see this, and it is emailed to them. What the mail provider says is recorded on the message — accepting it is not the same as the client receiving it."
                              : "Private to the team. It is never delivered anywhere and never appears on any client-facing view."}
                          </p>
                          <button onClick={() => void send()} disabled={busy || !draft.trim()}
                            className={PRIMARY_BUTTON}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            {composeMode === "customer" ? "Send reply" : "Record note"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Linked article */}
                    <div className="bg-background border border-border rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          Answer article
                        </h3>
                        {detail.article && (
                          <button onClick={() => void linkArticle(null)} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
                            Unlink
                          </button>
                        )}
                      </div>
                      {detail.article ? (
                        <p className="text-sm text-foreground mt-1.5">
                          {detail.article.title}{" "}
                          <span className="text-[11px] text-muted-foreground">({humanise(detail.article.status)})</span>
                        </p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <select defaultValue="" onChange={e => e.target.value && void linkArticle(Number(e.target.value))}
                            className={SMALL_FIELD}>
                            <option value="">Link the article that answers this…</option>
                            {articles.map(a => (
                              <option key={a.id} value={String(a.id)}>{a.title}</option>
                            ))}
                          </select>
                          {articles.length === 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              No articles yet — write one on the Knowledge base tab.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Knowledge base ──────────────────────────────────────────────── */}
        {tab === "kb" && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4">
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border space-y-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Articles</h2>
                  <button onClick={() => startArticle(null)} className={`${GHOST_BUTTON} ml-auto`}>
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
                <form className="relative" onSubmit={e => { e.preventDefault(); setArticleApplied(articleSearch.trim()); }}>
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={articleSearch} onChange={e => setArticleSearch(e.target.value)}
                    placeholder="Search titles and bodies…" className={`${SMALL_FIELD} w-full pl-8`} />
                </form>
                <select value={articleStatus} onChange={e => setArticleStatus(e.target.value)} className={SMALL_FIELD}>
                  <option value="">Drafts and published</option>
                  <option value="draft">Drafts only</option>
                  <option value="published">Published only</option>
                </select>
              </div>

              {articles.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No articles yet. Write the answer you keep repeating.
                </p>
              ) : (
                <div className="divide-y divide-border/60 max-h-[560px] overflow-y-auto">
                  {articles.map(a => (
                    <div key={a.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Chip
                          text={humanise(a.status)}
                          className={a.status === "published"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-muted text-muted-foreground border-border"} />
                        {a.category && <Chip text={a.category} className="bg-teal-50 text-teal-800 border-teal-200" />}
                      </div>
                      <button onClick={() => void openArticle(a.id)}
                        className="block text-left text-sm font-medium text-foreground mt-1 hover:text-teal-700">
                        {a.title}
                      </button>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.preview}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {a.updatedByLabel ?? a.authorLabel ?? "Author not recorded"} · {formatDateTime(a.updatedAt)}
                        </span>
                        <button onClick={() => void togglePublished(a)} disabled={busy}
                          className="ml-auto text-[11px] text-teal-700 hover:underline disabled:opacity-50">
                          {a.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {articleCursor != null && (
                <div className="px-4 py-3 border-t border-border">
                  <button
                    onClick={() => {
                      setBusy(true);
                      loadArticles(articleCursor)
                        .catch(e => setError(e instanceof Error ? e.message : "More articles could not be loaded."))
                        .finally(() => setBusy(false));
                    }}
                    disabled={busy} className={`${GHOST_BUTTON} w-full justify-center`}>
                    <ChevronDown className="w-3.5 h-3.5" /> Show more
                  </button>
                </div>
              )}
            </div>

            <div className="bg-background border border-border rounded-xl overflow-hidden">
              {!editorOpen ? (
                <p className="px-4 py-16 text-center text-xs text-muted-foreground">
                  Pick an article to edit, or write a new one.
                </p>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <h2 className="text-sm font-bold text-foreground">
                      {editing ? "Edit article" : "New article"}
                    </h2>
                    <button onClick={() => { setEditorOpen(false); setEditing(null); }}
                      className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
                      <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                        placeholder="How to reset a password" className={`${FIELD} mt-1`} />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Web address
                        </span>
                        <input value={formSlug} onChange={e => setFormSlug(e.target.value)}
                          placeholder="Left blank, it comes from the title" className={`${FIELD} mt-1`} />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Category</span>
                        <input value={formCategory} onChange={e => setFormCategory(e.target.value)}
                          placeholder="Accounts, Hosting, Billing…" className={`${FIELD} mt-1`} />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Article</span>
                      <textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={14}
                        placeholder="The answer, written once, in plain language."
                        className={`${FIELD} mt-1 resize-y font-normal`} />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
                        New articles start as drafts. Publishing is a separate, deliberate act.
                      </p>
                      <button onClick={() => { setEditorOpen(false); setEditing(null); }} className={GHOST_BUTTON}>
                        Cancel
                      </button>
                      <button onClick={() => void saveArticle()} disabled={busy} className={PRIMARY_BUTTON}>
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
