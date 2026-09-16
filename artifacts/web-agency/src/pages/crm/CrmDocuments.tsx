import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  AlertCircle, Check, Clock, Copy, Download, FileText, FolderOpen, Inbox,
  Link2, Loader2, Plus, RefreshCw, Shield, Trash2, Upload, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, PageLoadFailures, dataOf, failedParts } from "@/components/crm/LoadState";
import CrmBillingPanel from "./CrmBillingPanel";
import { useConfirmDialog } from "@/components/crm/ConfirmDialog";
import { refusalMessage } from "@/components/crm/confirmDialogModel";

// ── M3: Documents ────────────────────────────────────────────────────────────
//
// Two related jobs on one page, because in practice they are the same job:
//
//   Requests  what we have asked a client for and not received. This is the
//             source of the Command Center's "waiting for documents" count —
//             a real outstanding ask, not a guess from a project's empty field.
//   Files     what is actually attached to a record, with versions, an audit
//             trail of who uploaded each one, and expiring share links.
//
// The word this page will not use is "signed". An uploaded file and an
// accepted proposal both lack a signer identity, a document version bound to
// that signer, and an audit trail. Calling either one a signature would make
// the CRM assert something it cannot support, so every file carries a plain
// statement that it is not one.
//
// The same discipline governs what this page shows when a read does not come
// back. Each of the four things it loads — projects, contacts, the files on the
// selected record, and the outstanding requests — is a `Load`, and every figure
// derived from one is null until that load is ready. A refused read used to
// arrive here as an empty array, which the tiles then reported as
// "WAITING ON CLIENTS 0 / PAST DUE 0": a claim about the business that nobody
// had checked, sitting under the server's own error sentence. Now the tiles
// show an em dash, the panels say what is missing in the server's own words,
// and an empty list means the record genuinely has nothing on it.

// ── Types (the live API contract) ────────────────────────────────────────────

type EntityType = "lead" | "deal" | "project" | "ticket";

interface DocumentRow {
  id: number;
  entityType: EntityType;
  entityId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  supersedesId?: number | null;
  uploadedByLabel: string;
  uploadedByStaffId?: number | null;
  createdAt: string;
  signatureStatus: "not_a_signature";
}

interface DocumentRequest {
  id: number;
  entityType: EntityType;
  entityId: number;
  title: string;
  description?: string | null;
  status: string;
  requestedAt: string;
  dueDate?: string | null;
  ownerStaffId?: number | null;
  ownerName?: string | null;
  requestedByLabel: string;
  receivedAt?: string | null;
  notes?: string | null;
  overdue: boolean;
  subject?: { id: number; name: string; company?: string | null } | null;
  subjectHref?: string | null;
}

/** The files on one record, and how many older versions are being held back. */
interface DocumentsPayload {
  documents: DocumentRow[];
  supersededCount: number;
}

interface ShareRow {
  id: number;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  maxDownloads?: number | null;
  downloadCount: number;
  lastDownloadedAt?: string | null;
  sharedWithLabel?: string | null;
}

interface SubjectOption {
  kind: EntityType;
  id: number;
  label: string;
  sub?: string;
}

const ACCEPTED_MIME = [
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "text/plain", "text/csv", "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
];
const MAX_BYTES = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Reads a File into raw base64, without the "data:...;base64," prefix. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

// ── Body shapes ──────────────────────────────────────────────────────────────
//
// Each `pick` returns undefined when the answer is not what this page expects,
// which `readAdminResource` turns into a stated failure. An answer we cannot
// read is not the same thing as an answer of none.

function listIn(body: unknown, key: string): unknown[] | undefined {
  const list = body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
  return Array.isArray(list) ? list : undefined;
}

function pickProjects(body: unknown): SubjectOption[] | undefined {
  const list = listIn(body, "projects");
  if (!list) return undefined;
  return (list as { id: number; name: string; stage?: string | null }[]).map(p => ({
    kind: "project" as const, id: p.id, label: p.name, sub: p.stage ?? undefined,
  }));
}

function pickLeads(body: unknown): SubjectOption[] | undefined {
  const list = listIn(body, "leads");
  if (!list) return undefined;
  return (list as { id: number; name: string; company?: string | null }[]).map(l => ({
    kind: "lead" as const, id: l.id, label: l.name, sub: l.company ?? undefined,
  }));
}

function pickRequests(body: unknown): DocumentRequest[] | undefined {
  const list = listIn(body, "requests");
  return list ? (list as DocumentRequest[]) : undefined;
}

function pickDocuments(body: unknown): DocumentsPayload | undefined {
  const list = listIn(body, "documents");
  if (!list) return undefined;
  const count = body && typeof body === "object"
    ? (body as { supersededCount?: unknown }).supersededCount
    : undefined;
  return {
    documents: list as DocumentRow[],
    supersededCount: typeof count === "number" ? count : 0,
  };
}

function pickShares(body: unknown): ShareRow[] | undefined {
  const list = listIn(body, "shares");
  return list ? (list as ShareRow[]) : undefined;
}

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  received: "bg-green-50 text-green-800 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function CrmDocuments() {
  const [subject, setSubject] = useState<SubjectOption | null>(null);
  const [projects, setProjects] = useState<Load<SubjectOption[]>>({ status: "loading" });
  const [leads, setLeads] = useState<Load<SubjectOption[]>>({ status: "loading" });

  const [documents, setDocuments] = useState<Load<DocumentsPayload>>({ status: "loading" });
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [requests, setRequests] = useState<Load<DocumentRequest[]>>({ status: "loading" });

  const [firstLoad, setFirstLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Only ever what an action the person took came back with. Loads state themselves. */
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [supersedesId, setSupersedesId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  const [askTitle, setAskTitle] = useState("");
  const [askDue, setAskDue] = useState("");
  const [askNote, setAskNote] = useState("");

  const [shareFor, setShareFor] = useState<DocumentRow | null>(null);
  const [shares, setShares] = useState<Load<ShareRow[]>>({ status: "loading" });
  const [shareHours, setShareHours] = useState("72");
  const [shareMax, setShareMax] = useState("");
  const [shareLabel, setShareLabel] = useState("");
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // ── Load the records a document can hang off ──────────────────────────────
  //
  // Projects and contacts are the two that matter day to day. Both lists are
  // already permission-checked by their own routes, and each keeps its own
  // answer: when one is refused and the other is not, the picker says which
  // half is missing rather than presenting the half it has as the whole.
  const loadSubjects = useCallback(async () => {
    const [nextProjects, nextLeads] = await Promise.all([
      readAdminResource("/api/crm/projects", pickProjects),
      readAdminResource("/api/crm/leads", pickLeads),
    ]);
    if (!alive.current) return;
    setProjects(nextProjects);
    setLeads(nextLeads);
  }, []);

  const loadRequests = useCallback(async () => {
    const next = await readAdminResource("/api/crm/document-requests", pickRequests);
    if (alive.current) setRequests(next);
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!subject) {
      // No record chosen is a real, known answer: there is nothing to list.
      setDocuments({ status: "ready", data: { documents: [], supersededCount: 0 } });
      return;
    }
    const params = new URLSearchParams({
      entityType: subject.kind,
      entityId: String(subject.id),
      includeSuperseded: showSuperseded ? "true" : "false",
    });
    const next = await readAdminResource(`/api/crm/documents?${params.toString()}`, pickDocuments);
    if (alive.current) setDocuments(next);
  }, [subject, showSuperseded]);

  // Each part keeps what it last showed until its own new answer arrives, so a
  // retry never flashes the page back to empty — and a part that failed stays a
  // stated failure rather than becoming a zero.
  const refresh = useCallback(async (silent = false) => {
    if (silent) setBusy(true);
    await Promise.all([loadDocuments(), loadRequests()]);
    if (!alive.current) return;
    setFirstLoad(false);
    setBusy(false);
  }, [loadDocuments, loadRequests]);

  /** The page-level Try again: every part, including the record picker. */
  const reloadAll = useCallback(async () => {
    setBusy(true);
    await Promise.all([loadSubjects(), loadDocuments(), loadRequests()]);
    if (!alive.current) return;
    setFirstLoad(false);
    setBusy(false);
  }, [loadSubjects, loadDocuments, loadRequests]);

  const loadShares = useCallback(async (attachmentId: number) => {
    setShares({ status: "loading" });
    const next = await readAdminResource(`/api/crm/documents/${attachmentId}/shares`, pickShares);
    if (alive.current) setShares(next);
  }, []);

  useEffect(() => { void loadSubjects(); }, [loadSubjects]);
  useEffect(() => { void refresh(); }, [refresh]);

  const subjects = useMemo(
    () => [...(dataOf(projects) ?? []), ...(dataOf(leads) ?? [])],
    [projects, leads],
  );
  useEffect(() => { setSubject(prev => prev ?? subjects[0] ?? null); }, [subjects]);

  // ── Derived figures ───────────────────────────────────────────────────────
  //
  // Every one of these is null when the list behind it never arrived. `Figure`
  // renders null as an em dash; a count of 0 is only ever a count the server
  // actually answered.
  const requestList = dataOf(requests);
  const openRequests = useMemo(
    () => requestList ? requestList.filter(r => r.status === "pending") : null,
    [requestList],
  );
  const overdueRequests = useMemo(
    () => openRequests ? openRequests.filter(r => r.overdue) : null,
    [openRequests],
  );

  // Requests for whichever record is on screen, so the two halves line up.
  const subjectRequests = useMemo(
    () => subject && requestList
      ? requestList.filter(r => r.entityType === subject.kind && r.entityId === subject.id)
      : null,
    [requestList, subject],
  );

  const files = dataOf(documents);
  const supersededCount = files?.supersededCount ?? 0;

  const failures = failedParts([
    ["Projects", projects],
    ["Contacts", leads],
    ["Files", documents],
    ["Outstanding requests", requests],
  ]);

  // Which half of the record picker is missing, when one or both are.
  const subjectsFailure = projects.status === "error"
    ? projects
    : leads.status === "error" ? leads : null;
  const subjectsFailureWhat = projects.status === "error" && leads.status === "error"
    ? "Projects and contacts"
    : projects.status === "error" ? "Projects" : "Contacts";

  // ── Writes ─────────────────────────────────────────────────────────────────

  async function upload(file: File) {
    if (!subject) return;
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is ${formatSize(file.size)}. The limit is 25 MB.`);
      return;
    }
    if (file.type && !ACCEPTED_MIME.includes(file.type)) {
      setError(`Files of type "${file.type}" are not accepted. Allowed: PDF, images, Office documents, text, CSV and zip.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const contentBase64 = await readAsBase64(file);
      let res: Response;
      try {
        res = await adminFetch("/api/crm/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: subject.kind,
            entityId: subject.id,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            contentBase64,
            ...(supersedesId ? { supersedesId } : {}),
          }),
        });
      } catch {
        setError(`"${file.name}" was not uploaded. ${failureReason(null)}`);
        return;
      }
      if (!res.ok) {
        setError(`"${file.name}" was not uploaded. ${await responseFailureReason(res)}`);
        return;
      }
      const data = await res.json().catch(() => ({})) as {
        satisfiedRequestId?: unknown;
        attachment?: { version?: number };
      };
      setNotice(
        data.satisfiedRequestId
          ? `Uploaded. This closed the outstanding request for it.`
          : supersedesId
            ? `Uploaded as version ${data.attachment?.version ?? "next"}. The previous version is kept.`
            : "Uploaded.",
      );
      setSupersedesId(null);
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  // The download route is permission-checked, so a plain <a href> would arrive
  // without an Authorization header. Ask for the bytes, then hand them over.
  async function download(doc: DocumentRow) {
    let res: Response;
    try {
      res = await adminFetch(`/api/crm/documents/${doc.id}/download`);
    } catch {
      setError(`"${doc.filename}" was not downloaded. ${failureReason(null)}`);
      return;
    }
    if (!res.ok) {
      setError(`"${doc.filename}" was not downloaded. ${await responseFailureReason(res)}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const confirmation = useConfirmDialog();

  // Both meanings kept: the dialog spells out that the stored file is erased
  // and its share links stop working, and `refusalMessage` means a delete the
  // server refused never reads as one that worked.
  function remove(doc: DocumentRow) {
    void confirmation.ask({
      title: `Delete "${doc.filename}"?`,
      description: "This cannot be undone.",
      consequences: [
        "It disappears from this record, and the stored file is erased.",
        "Any share links for it stop working straight away.",
        "Earlier versions of the same file are not affected.",
      ],
      tone: "destructive",
      confirmLabel: "Delete file",
      busyLabel: "Deleting…",
      cancelLabel: "Keep file",
      action: async () => {
        const res = await adminFetch(`/api/crm/documents/${doc.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await refusalMessage(res, "That file could not be deleted."));
        setNotice(`"${doc.filename}" was deleted.`);
        await refresh(true);
      },
    });
  }

  async function ask() {
    if (!subject) return;
    if (askTitle.trim().length < 2) { setError("Say what you are asking the client for."); return; }
    setBusy(true);
    try {
      const res = await adminFetch("/api/crm/document-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: subject.kind,
          entityId: subject.id,
          title: askTitle.trim(),
          description: askNote.trim() || null,
          dueDate: askDue ? new Date(`${askDue}T17:00:00`).toISOString() : null,
        }),
      });
      if (!res.ok) {
        setError(`The request was not recorded. ${await responseFailureReason(res)}`);
        return;
      }
      setNotice("Recorded. It now counts as waiting on the Command Center until the file arrives.");
      setAskOpen(false); setAskTitle(""); setAskDue(""); setAskNote("");
      await refresh(true);
    } catch {
      setError(`The request was not recorded. ${failureReason(null)}`);
    } finally {
      setBusy(false);
    }
  }

  async function closeRequest(req: DocumentRequest, status: "received" | "cancelled") {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/crm/document-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(`"${req.title}" was not updated. ${await responseFailureReason(res)}`);
        return;
      }
      setNotice(status === "received" ? "Marked as received." : "Request cancelled.");
      await refresh(true);
    } catch {
      setError(`"${req.title}" was not updated. ${failureReason(null)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openShares(doc: DocumentRow) {
    setShareFor(doc);
    setFreshLink(null);
    setShareHours("72"); setShareMax(""); setShareLabel("");
    await loadShares(doc.id);
  }

  async function createShare() {
    if (!shareFor) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/crm/documents/${shareFor.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresInHours: Number(shareHours) || 72,
          maxDownloads: shareMax === "" ? null : Number(shareMax),
          sharedWithLabel: shareLabel.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(`The link was not created. ${await responseFailureReason(res)}`);
        return;
      }
      const data = await res.json().catch(() => ({})) as { sharePath?: unknown };
      if (typeof data.sharePath === "string" && data.sharePath) {
        setFreshLink(`${window.location.origin}${data.sharePath}`);
      } else {
        // A link we cannot show is not a link. Saying so beats printing a
        // broken one and letting somebody send it to a client.
        setError("The link was created but the server did not return it. Check the list below before making another.");
      }
      await loadShares(shareFor.id);
    } catch {
      setError(`The link was not created. ${failureReason(null)}`);
    } finally {
      setBusy(false);
    }
  }

  // Both meanings kept: the dialog spells out what revoking costs, and the
  // refreshed list still comes from `loadShares`, which carries a Load. The
  // incoming `openSharesList` helper is deliberately dropped — it set the list
  // to [] on a failed read, which is the very defect this branch removes: a
  // file shared with somebody would have shown "no links".
  function revokeShare(share: ShareRow) {
    const attachment = shareFor;
    if (!attachment) return;
    void confirmation.ask({
      title: share.sharedWithLabel
        ? `Revoke the link shared with ${share.sharedWithLabel}?`
        : "Revoke this share link?",
      description: "It stops working straight away.",
      consequences: [
        `Anyone holding it can no longer download "${attachment.filename}".`,
        share.downloadCount > 0
          ? `It has already been downloaded ${share.downloadCount} time${share.downloadCount === 1 ? "" : "s"}; revoking cannot undo that.`
          : "It has not been downloaded yet.",
        "The file itself is untouched, and you can create a new link for it.",
      ],
      tone: "destructive",
      confirmLabel: "Revoke link",
      busyLabel: "Revoking…",
      cancelLabel: "Keep link",
      action: async () => {
        const res = await adminFetch(`/api/crm/documents/shares/${share.id}/revoke`, { method: "POST" });
        if (!res.ok) throw new Error(await refusalMessage(res, "That link could not be revoked."));
        setNotice("Link revoked.");
        if (freshLink) setFreshLink(null);
        await loadShares(attachment.id);
      },
    });
  }

  if (firstLoad) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading documents…</span>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout>
      {confirmation.element}

      <div className="p-4 sm:p-6 space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" /> Documents
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Files attached to a record, and what you are still waiting on from clients.
            </p>
          </div>
          <button onClick={() => void refresh(true)} disabled={busy}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* What did not load, in the server's own words, before anything derived
            from it is shown. */}
        <PageLoadFailures failures={failures} onRetry={() => { void reloadAll(); }} retrying={busy} />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 flex-1 min-w-0 break-words">{error}</p>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 flex-1 min-w-0 break-words">{notice}</p>
            <button onClick={() => setNotice(null)} className="text-teal-700 hover:text-teal-900"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Waiting-on summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-background border border-border rounded-xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Waiting on clients</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              <Figure value={openRequests ? openRequests.length : null} loading={requests.status === "loading"} />
            </p>
          </div>
          <div className="bg-background border border-border rounded-xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Past due</p>
            <p className={`text-2xl font-bold mt-1 ${overdueRequests && overdueRequests.length > 0 ? "text-red-600" : "text-foreground"}`}>
              <Figure value={overdueRequests ? overdueRequests.length : null} loading={requests.status === "loading"} />
            </p>
          </div>
          <div className="bg-background border border-border rounded-xl px-4 py-3 col-span-2 sm:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Signatures</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              None. No e-signature provider is connected, so nothing here is a signed document.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">

          {/* ── Record picker ────────────────────────────────────────────── */}
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Record</h2>
            </div>
            {subjects.length === 0 ? (
              subjectsFailure ? (
                <LoadFailure
                  variant="inline"
                  className="px-4 py-6"
                  what={subjectsFailureWhat}
                  reason={subjectsFailure.reason}
                  onRetry={() => { void loadSubjects(); }}
                  retrying={busy}
                />
              ) : projects.status === "loading" || leads.status === "loading" ? (
                <p className="px-4 py-6 text-xs text-muted-foreground" role="status">Loading records…</p>
              ) : (
                <p className="px-4 py-6 text-xs text-muted-foreground">
                  No projects or contacts were found, so there is nothing to attach a file to yet.
                </p>
              )
            ) : (
              <>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border/60">
                  {subjects.map(opt => {
                    const on = subject?.kind === opt.kind && subject?.id === opt.id;
                    // Null, not 0, while the requests behind this badge are unknown.
                    const waiting = requestList
                      ? requestList.filter(
                          r => r.status === "pending" && r.entityType === opt.kind && r.entityId === opt.id,
                        ).length
                      : null;
                    return (
                      <button key={`${opt.kind}-${opt.id}`} onClick={() => setSubject(opt)}
                        className={`w-full text-left px-4 py-2.5 transition-colors ${on ? "bg-teal-50" : "hover:bg-accent"}`}>
                        <div className="flex items-center gap-2">
                          {opt.kind === "project"
                            ? <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            : <Inbox className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          <span className={`text-xs truncate ${on ? "font-semibold text-teal-900" : "text-foreground"}`}>
                            {opt.label}
                          </span>
                          {waiting === null ? (
                            requests.status === "error" && (
                              <span
                                title="Outstanding requests could not be loaded"
                                className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0"
                              >
                                <Figure value={null} />
                              </span>
                            )
                          ) : waiting > 0 ? (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                              {waiting}
                            </span>
                          ) : null}
                        </div>
                        {opt.sub && <p className="text-[11px] text-muted-foreground truncate mt-0.5 pl-6">{opt.sub}</p>}
                      </button>
                    );
                  })}
                </div>
                {subjectsFailure && (
                  <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground break-words">
                    {subjectsFailureWhat} could not be loaded, so they are not in this list.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Files + requests for the selected record ─────────────────── */}
          <div className="space-y-4">

            {/* Files */}
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-foreground truncate min-w-0">
                  {subject ? `Files on ${subject.label}` : "Files"}
                </h2>
                {supersededCount > 0 && (
                  <button onClick={() => setShowSuperseded(v => !v)}
                    className="text-[11px] text-teal-700 hover:underline">
                    {showSuperseded ? "Hide" : "Show"} {supersededCount} older version{supersededCount === 1 ? "" : "s"}
                  </button>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <input ref={fileInput} type="file" className="hidden"
                    accept={ACCEPTED_MIME.join(",")}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                  <button onClick={() => fileInput.current?.click()} disabled={!subject || uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {supersedesId ? "Upload new version" : "Upload"}
                  </button>
                  {supersedesId && (
                    <button onClick={() => setSupersedesId(null)}
                      className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
                  )}
                </div>
              </div>

              {documents.status === "error" ? (
                <LoadFailure
                  variant="inline"
                  className="px-4 py-8"
                  what={subject ? `Files on ${subject.label}` : "Files"}
                  reason={documents.reason}
                  onRetry={() => { void refresh(true); }}
                  retrying={busy}
                />
              ) : !files || files.documents.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                  {subject ? "No files on this record yet." : "Pick a record to see its files."}
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {files.documents.map(doc => (
                    <div key={doc.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                        <p className="text-[11px] text-muted-foreground break-words">
                          {formatSize(doc.sizeBytes)} · v{doc.version} · {doc.uploadedByLabel} · {formatDateTime(doc.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button onClick={() => void download(doc)} title="Download"
                          className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                          <Download className="w-3 h-3" /> Get
                        </button>
                        <button onClick={() => { setSupersedesId(doc.id); fileInput.current?.click(); }}
                          title="Upload a newer version of this file"
                          className="px-2 py-1 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                          New version
                        </button>
                        <button onClick={() => void openShares(doc)} title="Share by expiring link"
                          className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                          <Link2 className="w-3 h-3" /> Share
                        </button>
                        <button onClick={() => void remove(doc)} title="Delete"
                          className="px-2 py-1 text-[11px] border border-red-200 text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Shield className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="min-w-0 break-words">
                  Stored files always download rather than opening in the CRM, and none of them is
                  a signed document — no e-signature provider is connected.
                </span>
              </p>
            </div>

            {/* M5: quotes and invoices for the same contact.
                They sit here rather than on a page of their own because a sent
                quote and an issued invoice ARE documents — they render into the
                file list above and reach the client through the same portal
                grant every other file uses. */}
            <CrmBillingPanel
              leadId={subject?.kind === "lead" ? subject.id : null}
              subjectLabel={subject?.label ?? "this contact"}
              onDocumentsChanged={() => { void refresh(true); }}
            />

            {/* Requests on this record */}
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-foreground min-w-0">Waiting on the client</h2>
                <button onClick={() => setAskOpen(v => !v)} disabled={!subject}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
                  <Plus className="w-3 h-3" /> Ask for something
                </button>
              </div>

              {askOpen && subject && (
                <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-2.5">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">What do you need?</span>
                    <input value={askTitle} onChange={e => setAskTitle(e.target.value)}
                      placeholder="Signed scope, logo files, brand guide…"
                      className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Needed by</span>
                      <input type="date" value={askDue} onChange={e => setAskDue(e.target.value)}
                        className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Note</span>
                      <input value={askNote} onChange={e => setAskNote(e.target.value)}
                        className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setAskOpen(false)}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors">Cancel</button>
                    <button onClick={() => void ask()} disabled={busy}
                      className="ml-auto px-4 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                      Record the request
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This records the ask so it shows as outstanding. It does not email the client —
                    send that from Communications.
                  </p>
                </div>
              )}

              {requests.status === "error" ? (
                <LoadFailure
                  variant="inline"
                  className="px-4 py-8"
                  what="Outstanding requests"
                  reason={requests.reason}
                  onRetry={() => { void refresh(true); }}
                  retrying={busy}
                />
              ) : !subjectRequests || subjectRequests.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Nothing outstanding on this record.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {subjectRequests.map(r => (
                    <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <Clock className="w-3 h-3" />
                          asked {formatDate(r.requestedAt)} by {r.requestedByLabel}
                          {r.dueDate && <span className={r.overdue ? "text-red-600 font-medium" : ""}>· due {formatDate(r.dueDate)}</span>}
                          {r.ownerName && <span>· chased by {r.ownerName}</span>}
                        </p>
                        {r.description && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{r.description}</p>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${REQUEST_STATUS_STYLE[r.status] ?? REQUEST_STATUS_STYLE.pending}`}>
                        {r.overdue ? "past due" : r.status}
                      </span>
                      {r.status === "pending" && (
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button onClick={() => void closeRequest(r, "received")}
                            className="px-2 py-1 text-[11px] border border-green-200 text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors">
                            Received
                          </button>
                          <button onClick={() => void closeRequest(r, "cancelled")}
                            className="px-2 py-1 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                            No longer needed
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Everything outstanding, across records. Shown only when the list
                it counts actually arrived — the page-level banner above says so
                when it did not, rather than this panel implying none. */}
            {openRequests && openRequests.length > 0 && (
              <div className="bg-background border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Everything outstanding ({openRequests.length})
                  </h2>
                </div>
                <div className="divide-y divide-border/60 max-h-[280px] overflow-y-auto">
                  {openRequests.map(r => (
                    <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {r.subject && r.subjectHref
                            ? <Link href={r.subjectHref}>
                                <span className="text-teal-700 hover:underline cursor-pointer">{r.subject.name}</span>
                              </Link>
                            : r.subject
                              ? r.subject.name
                              : `${r.entityType} #${r.entityId}`}
                          {r.dueDate && <span className={r.overdue ? " text-red-600 font-medium" : ""}> · due {formatDate(r.dueDate)}</span>}
                        </p>
                      </div>
                      {r.overdue && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200 shrink-0">past due</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Share links ────────────────────────────────────────────────────── */}
      {shareFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-0 sm:p-4"
          onClick={() => setShareFor(null)}>
          <div className="bg-background w-full sm:max-w-lg sm:rounded-xl rounded-t-xl border border-border max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background flex items-center gap-2 px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground truncate min-w-0">Share "{shareFor.filename}"</h3>
              <button onClick={() => setShareFor(null)} className="ml-auto text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {freshLink && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 space-y-2">
                  <p className="text-[11px] font-semibold text-teal-900">
                    Copy this now — it is shown once and never again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 text-[11px] bg-background border border-teal-200 rounded px-2 py-1.5 truncate">
                      {freshLink}
                    </code>
                    <button onClick={() => { void navigator.clipboard?.writeText(freshLink); setNotice("Link copied."); }}
                      className="flex items-center gap-1 px-2 py-1.5 text-[11px] bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors shrink-0">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Expires in</span>
                  <select value={shareHours} onChange={e => setShareHours(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500">
                    <option value="24">1 day</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Download limit</span>
                  <input type="number" min={1} value={shareMax} placeholder="No limit"
                    onChange={e => setShareMax(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Who is it for (for your records)</span>
                <input value={shareLabel} onChange={e => setShareLabel(e.target.value)}
                  placeholder="Acme — Dana"
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </label>

              <button onClick={() => void createShare()} disabled={busy}
                className="w-full px-4 py-2 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                Create link
              </button>

              <p className="text-[11px] text-muted-foreground">
                Anyone holding the link can download this file until it expires, hits its limit,
                or you revoke it. It needs no sign-in, so treat it like the file itself.
              </p>

              {/* The existing links. A refused read here is stated: an empty
                  list would otherwise say "nothing is shared" about a file that
                  may be shared with anybody. */}
              {shares.status === "loading" && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-3" role="status">
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Loading the links for this file…
                </p>
              )}
              {shares.status === "error" && (
                <div className="border-t border-border pt-3">
                  <LoadFailure
                    variant="inline"
                    what="Existing links"
                    reason={shares.reason}
                    onRetry={() => { void loadShares(shareFor.id); }}
                  />
                </div>
              )}
              {shares.status === "ready" && shares.data.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Existing links</p>
                  <div className="space-y-2">
                    {shares.data.map(s => {
                      const dead = !!s.revokedAt || new Date(s.expiresAt).getTime() < Date.now();
                      return (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] border border-border rounded-lg px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">
                              {s.sharedWithLabel || "Unlabelled link"}
                            </p>
                            <p className="text-muted-foreground break-words">
                              {s.revokedAt ? "revoked" : `expires ${formatDateTime(s.expiresAt)}`}
                              {" · "}{s.downloadCount}{s.maxDownloads ? `/${s.maxDownloads}` : ""} download{s.downloadCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          {!dead && (
                            <button onClick={() => void revokeShare(s)}
                              className="px-2 py-1 border border-red-200 text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors shrink-0">
                              Revoke
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
