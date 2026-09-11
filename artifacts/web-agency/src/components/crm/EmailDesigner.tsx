import { useMemo, useState } from "react";
import {
  AlertCircle, ChevronDown, ChevronUp, Image as ImageIcon, Loader2, Minus,
  MousePointerClick, Monitor, Plus, RefreshCw, Smartphone, Trash2, Type,
} from "lucide-react";

// ── M4: the visual email designer ────────────────────────────────────────────
//
// A block composer. Nobody writes HTML, and nobody needs to know that the
// output is a table with inline styles — which it must be, because the mail
// clients that matter still discard a stylesheet.
//
// The preview is fetched from the SERVER, not rendered here. That is the whole
// point of the panel: the same function that will build the outgoing message
// builds the picture, so "this looks right" is a judgement about the actual
// email rather than about a browser's sympathetic approximation of it. A
// second renderer in the browser would drift, and the drift would only ever be
// discovered by a customer.
//
// Merge tokens are written `{{field|fallback}}` and the fallback is not
// optional. The editor shows the problem inline, the same wording the send path
// refuses with, so the two can never disagree about what is wrong.

export interface EmailBlock {
  id: string;
  type: "heading" | "text" | "image" | "button" | "divider" | "spacer";
  text?: string | null;
  level?: number | null;
  align?: "left" | "center" | "right" | null;
  url?: string | null;
  alt?: string | null;
  size?: number | null;
}

export interface TokenProblem { token: string; problem: string }

interface Props {
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  mergeFields: Record<string, string>;
  tokenProblems: TokenProblem[];
  onChange: (patch: { subject?: string; preheader?: string; blocks?: EmailBlock[] }) => void;
  readOnly?: boolean;

  /** Server-rendered HTML for the preview pane. */
  previewHtml: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewSubject: string | null;
  previewAs: { id: number; name: string } | null;
  fallbacksUsed: string[];
  onRefreshPreview: () => void;
}

const BLOCK_MENU: { type: EmailBlock["type"]; label: string; icon: typeof Type }[] = [
  { type: "heading", label: "Heading", icon: Type },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Minus },
];

function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "heading": return { id, type, text: "Hi {{first_name|there}}", level: 1, align: "left" };
    case "text": return { id, type, text: "Write something worth reading.", align: "left" };
    case "image": return { id, type, url: "", alt: "", size: 536, align: "center" };
    case "button": return { id, type, text: "Book a call", url: "", align: "left" };
    case "spacer": return { id, type, size: 24 };
    default: return { id, type };
  }
}

const inputClass =
  "w-full px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60";

export default function EmailDesigner(props: Props) {
  const {
    subject, preheader, blocks, mergeFields, tokenProblems, onChange, readOnly,
    previewHtml, previewLoading, previewError, previewSubject, previewAs,
    fallbacksUsed, onRefreshPreview,
  } = props;

  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [openMenu, setOpenMenu] = useState(false);

  const problemByToken = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of tokenProblems) m.set(p.token, p.problem);
    return m;
  }, [tokenProblems]);

  /** The problems that live in one specific piece of copy. */
  const problemsIn = (text: string | null | undefined): TokenProblem[] => {
    if (!text) return [];
    const out: TokenProblem[] = [];
    for (const [token, problem] of problemByToken) {
      if (text.includes(token)) out.push({ token, problem });
    }
    return out;
  };

  const patchBlock = (id: string, patch: Partial<EmailBlock>) => {
    onChange({ blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };
  const removeBlock = (id: string) => onChange({ blocks: blocks.filter((b) => b.id !== id) });
  const addBlock = (type: EmailBlock["type"]) => {
    onChange({ blocks: [...blocks, newBlock(type)] });
    setOpenMenu(false);
  };
  const move = (index: number, delta: number) => {
    const next = [...blocks];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange({ blocks: next });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ══════════════ Editor ══════════════ */}
      <div className="space-y-3 min-w-0">
        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Subject line</label>
            <input
              className={inputClass}
              value={subject}
              disabled={readOnly}
              placeholder="A question for {{company|your team}}"
              onChange={(e) => onChange({ subject: e.target.value })}
            />
            <TokenProblems problems={problemsIn(subject)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Preheader <span className="font-normal text-muted-foreground">— the line shown after the subject in an inbox</span>
            </label>
            <input
              className={inputClass}
              value={preheader}
              disabled={readOnly}
              placeholder="Ten minutes, no pressure"
              onChange={(e) => onChange({ preheader: e.target.value })}
            />
            <TokenProblems problems={problemsIn(preheader)} />
          </div>
        </div>

        {/* ── Blocks ── */}
        <div className="space-y-2">
          {blocks.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">
              Nothing in the email yet. Add a block below.
            </p>
          )}

          {blocks.map((block, index) => (
            <div key={block.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/70">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">{block.type}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" disabled={readOnly || index === 0} onClick={() => move(index, -1)}
                    aria-label="Move up" title="Move up"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" disabled={readOnly || index === blocks.length - 1} onClick={() => move(index, 1)}
                    aria-label="Move down" title="Move down"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" disabled={readOnly} onClick={() => removeBlock(block.id)}
                    aria-label="Remove block" title="Remove block"
                    className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-2">
                {(block.type === "heading" || block.type === "text" || block.type === "button") && (
                  <>
                    {block.type === "text" ? (
                      <textarea
                        className={`${inputClass} min-h-[92px] resize-y`}
                        value={block.text ?? ""}
                        disabled={readOnly}
                        onChange={(e) => patchBlock(block.id, { text: e.target.value })}
                      />
                    ) : (
                      <input
                        className={inputClass}
                        value={block.text ?? ""}
                        disabled={readOnly}
                        placeholder={block.type === "button" ? "Button label" : "Heading"}
                        onChange={(e) => patchBlock(block.id, { text: e.target.value })}
                      />
                    )}
                    <TokenProblems problems={problemsIn(block.text)} />
                  </>
                )}

                {block.type === "heading" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Size
                    <select
                      className="px-2 py-1 border border-input rounded-md bg-background text-foreground text-xs"
                      value={block.level === 2 ? 2 : 1}
                      disabled={readOnly}
                      onChange={(e) => patchBlock(block.id, { level: Number(e.target.value) })}
                    >
                      <option value={1}>Large</option>
                      <option value={2}>Small</option>
                    </select>
                  </label>
                )}

                {(block.type === "image" || block.type === "button") && (
                  <input
                    className={inputClass}
                    value={block.url ?? ""}
                    disabled={readOnly}
                    placeholder={block.type === "image" ? "https://… image address" : "https://… where the button goes"}
                    onChange={(e) => patchBlock(block.id, { url: e.target.value })}
                  />
                )}

                {block.type === "image" && (
                  <>
                    <input
                      className={inputClass}
                      value={block.alt ?? ""}
                      disabled={readOnly}
                      placeholder="Describe the image — shown when images are blocked"
                      onChange={(e) => patchBlock(block.id, { alt: e.target.value })}
                    />
                    {!block.alt?.trim() && (
                      <p className="text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        Most inboxes block images by default. With no description this block is a blank space.
                      </p>
                    )}
                  </>
                )}

                {block.type === "spacer" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Height
                    <input
                      type="number" min={4} max={96}
                      className="w-20 px-2 py-1 border border-input rounded-md bg-background text-foreground text-xs"
                      value={block.size ?? 24}
                      disabled={readOnly}
                      onChange={(e) => patchBlock(block.id, { size: Number(e.target.value) })}
                    />
                    px
                  </label>
                )}

                {block.type !== "divider" && block.type !== "spacer" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Align
                    <select
                      className="px-2 py-1 border border-input rounded-md bg-background text-foreground text-xs"
                      value={block.align ?? "left"}
                      disabled={readOnly}
                      onChange={(e) => patchBlock(block.id, { align: e.target.value as EmailBlock["align"] })}
                    >
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Add a block ── */}
        <div className="relative">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setOpenMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-60 w-full sm:w-auto justify-center"
          >
            <Plus className="w-4 h-4" /> Add a block
          </button>
          {openMenu && !readOnly && (
            <div className="absolute z-20 mt-1 w-full sm:w-56 rounded-lg border border-border bg-card shadow-lg p-1">
              {BLOCK_MENU.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-foreground hover:bg-accent text-left"
                >
                  <Icon className="w-3.5 h-3.5 text-teal-700" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Merge field reference ── */}
        <details className="rounded-lg border border-border bg-muted/40 p-3">
          <summary className="text-xs font-semibold text-foreground cursor-pointer">
            Personalisation — {Object.keys(mergeFields).length} fields you can drop into any text
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Write them as <code className="px-1 rounded bg-card border border-border">{"{{first_name|there}}"}</code>.
            The part after the bar is what a contact sees when we do not have that value.
            It is required — without it the email would open “Hi ,”, so a campaign missing one
            cannot be sent.
          </p>
          <ul className="mt-2 space-y-1">
            {Object.entries(mergeFields).map(([field, means]) => (
              <li key={field} className="text-xs text-muted-foreground">
                <code className="px-1 rounded bg-card border border-border text-foreground">{`{{${field}|…}}`}</code>{" "}
                {means}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* ══════════════ Preview ══════════════ */}
      <div className="min-w-0">
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {previewAs ? `As ${previewAs.name}` : "Preview"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {previewSubject ?? (subject || "No subject yet")}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setWidth("desktop")}
                aria-label="Desktop width" title="Desktop width"
                className={`p-1.5 rounded ${width === "desktop" ? "bg-teal-100 text-teal-800" : "text-muted-foreground hover:bg-accent"}`}>
                <Monitor className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setWidth("mobile")}
                aria-label="Mobile width" title="Mobile width"
                className={`p-1.5 rounded ${width === "mobile" ? "bg-teal-100 text-teal-800" : "text-muted-foreground hover:bg-accent"}`}>
                <Smartphone className="w-4 h-4" />
              </button>
              <button type="button" onClick={onRefreshPreview}
                aria-label="Refresh preview" title="Refresh preview"
                className="p-1.5 rounded text-muted-foreground hover:bg-accent">
                {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {previewError ? (
            <div className="p-4">
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {previewError}
              </p>
              <button
                type="button"
                onClick={onRefreshPreview}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-accent"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : previewHtml === null ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {previewLoading ? "Rendering…" : "No preview yet."}
            </div>
          ) : (
            <div className="overflow-auto p-3">
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="bg-white border border-border rounded-md mx-auto block"
                style={{ width: width === "mobile" ? 375 : 620, height: 560, maxWidth: "100%" }}
              />
            </div>
          )}

          {fallbacksUsed.length > 0 && (
            <p className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200">
              For this contact, {fallbacksUsed.join(", ")} {fallbacksUsed.length === 1 ? "is" : "are"} missing,
              so the fallback text is what they will see.
            </p>
          )}
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border bg-card">
            Rendered by the server, using the same function that builds the outgoing message. What
            you see here is what is sent.
          </p>
        </div>
      </div>
    </div>
  );
}

function TokenProblems({ problems }: { problems: TokenProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {problems.map((p) => (
        <li key={p.token} className="text-xs text-red-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span><code className="font-semibold">{p.token}</code> — {p.problem}</span>
        </li>
      ))}
    </ul>
  );
}
