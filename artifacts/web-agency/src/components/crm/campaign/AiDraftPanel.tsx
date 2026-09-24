import { useState } from "react";
import { AlertCircle, ChevronDown, Check, Loader2, Sparkles } from "lucide-react";
import {
  aiAdminDetail, aiOperatorMessage, btnGhost, btnPrimary, inputClass,
  type AiAvailability, type Campaign,
} from "./shared";

// ── Draft with AI, inside the editor ─────────────────────────────────────────
//
// It asks for four things a person can actually answer — what this is for, who
// it is going to, the one thing it must say, and what the reader should do —
// and then lets them change the tone or the length and ask again, without
// leaving the campaign or losing anything they have written by hand.
//
// Two things this panel is careful about:
//
//   It never launches anything. Drafting writes copy onto the campaign and
//   nothing else; the campaign stays exactly as unsent as it was.
//
//   A draft is not approved by existing. Copy that came from a model is marked
//   as such and the send path refuses it until a named person says it is
//   accurate — so the approval here is a real gate, not a formality.

interface Props {
  campaign: Campaign;
  ai: AiAvailability | null;
  audienceLabel: string;
  busy: boolean;
  error: string | null;
  onDraft: (brief: {
    purpose: string; keyMessage: string; action: string;
    audienceNote: string; tone: string; length: string;
  }) => void;
  onApprove: () => void;
  readOnly?: boolean;
}

const TONES = ["Warm and plain", "Direct and brief", "Formal", "Friendly and conversational"];
const LENGTHS = [
  { id: "short", label: "Short — a few lines" },
  { id: "medium", label: "Medium — a couple of paragraphs" },
  { id: "detailed", label: "Detailed — say the whole thing" },
];

export default function AiDraftPanel({
  campaign, ai, audienceLabel, busy, error, onDraft, onApprove, readOnly,
}: Props) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [action, setAction] = useState("");
  const [audienceNote, setAudienceNote] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [length, setLength] = useState("medium");
  const [showAdmin, setShowAdmin] = useState(false);

  const available = ai?.available === true;
  const adminDetail = aiAdminDetail(ai);
  const awaitingApproval = campaign.aiContentState === "draft";

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[48px]"
      >
        <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-teal-900">Draft with AI</span>
          <span className="block text-xs text-muted-foreground">
            {available
              ? "Answer four questions and it writes a first version you can edit."
              : "Not available on this workspace — you can still write the email yourself."}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-teal-700 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-teal-200/70 pt-3">
          {!available && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm text-foreground">{aiOperatorMessage(ai)}</p>
              {adminDetail && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAdmin((v) => !v)}
                    aria-expanded={showAdmin}
                    className="mt-2 text-xs font-semibold text-teal-800 hover:text-teal-900 inline-flex items-center gap-1 min-h-[32px]"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdmin ? "rotate-180" : ""}`} />
                    Setup detail for whoever administers this system
                  </button>
                  {showAdmin && (
                    <p className="mt-1 text-xs text-muted-foreground font-mono break-words">{adminDetail}</p>
                  )}
                </>
              )}
            </div>
          )}

          <fieldset disabled={!available || busy || readOnly} className="space-y-2.5 disabled:opacity-60">
            <label className="block">
              <span className="block text-xs font-semibold text-foreground mb-1">What is this email for?</span>
              <input
                className={inputClass}
                value={purpose}
                placeholder="Tell past clients we now build online booking"
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-foreground mb-1">
                Who is it going to?{" "}
                <span className="font-normal text-muted-foreground">— {audienceLabel}</span>
              </span>
              <input
                className={inputClass}
                value={audienceNote}
                placeholder="Anything else worth knowing about them (optional)"
                onChange={(e) => setAudienceNote(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-foreground mb-1">The one thing it must say</span>
              <input
                className={inputClass}
                value={keyMessage}
                placeholder="Booking systems cut no-shows and we can add one to an existing site"
                onChange={(e) => setKeyMessage(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-foreground mb-1">What should the reader do?</span>
              <input
                className={inputClass}
                value={action}
                placeholder="Reply, or book a fifteen-minute call"
                onChange={(e) => setAction(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-semibold text-foreground mb-1">Tone</span>
                <select className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-foreground mb-1">Length</span>
                <select className={inputClass} value={length} onChange={(e) => setLength(e.target.value)}>
                  {LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </label>
            </div>

            <button
              type="button"
              className={btnPrimary}
              disabled={!purpose.trim()}
              onClick={() => onDraft({ purpose, keyMessage, action, audienceNote, tone, length })}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {campaign.aiContentState === "none" ? "Write a draft" : "Rewrite with these settings"}
            </button>
          </fieldset>

          {error && (
            <p className="text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Drafting only rewrites the copy below. It never schedules or sends anything.
          </p>
        </div>
      )}

      {awaitingApproval && (
        <div className="px-3.5 py-3 border-t border-amber-200 bg-amber-50 rounded-b-xl">
          <p className="text-sm text-amber-900 font-semibold">This copy was written by AI and nobody has checked it.</p>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Read it through. The campaign cannot be sent until somebody says it is accurate, and your
            name is recorded against that.
          </p>
          <button
            type="button"
            className={`${btnGhost} mt-2 border-amber-300 bg-card`}
            disabled={readOnly || busy}
            onClick={onApprove}
          >
            <Check className="w-4 h-4" /> I have read this and it is accurate
          </button>
        </div>
      )}

      {campaign.aiContentState === "approved" && (
        <p className="px-3.5 py-2.5 text-xs text-muted-foreground border-t border-teal-200/70">
          AI-written copy, approved by {campaign.aiApprovedByLabel ?? "a member of staff"}.
        </p>
      )}
    </div>
  );
}
