import { useState } from "react";
import { ChevronDown, FileText, Loader2, Save } from "lucide-react";
import EmailDesigner, { type EmailBlock, type TokenProblem } from "@/components/crm/EmailDesigner";
import AiDraftPanel from "./AiDraftPanel";
import {
  btnGhost, call, failureText, inputClass, postJson,
  type AiAvailability, type Campaign, type Design,
} from "./shared";

// ── Step 2: the email ────────────────────────────────────────────────────────
//
// A template or a blank page, then subject, preview text and content on ONE
// screen — because they are read together in an inbox and choosing them apart
// is how a subject ends up describing an email that no longer says that.

interface Props {
  campaign: Campaign;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  designs: Design[];
  mergeFields: Record<string, string>;
  tokenProblems: TokenProblem[];
  audienceLabel: string;
  ai: AiAvailability | null;
  aiBusy: boolean;
  aiError: string | null;
  readOnly?: boolean;
  onChange: (patch: { subject?: string; preheader?: string; blocks?: EmailBlock[]; designId?: number | null }) => void;
  onDraftWithAi: (brief: { purpose: string; keyMessage: string; action: string; audienceNote: string; tone: string; length: string }) => void;
  onApproveAi: () => void;
  onDesignsChanged: () => void;

  previewHtml: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewSubject: string | null;
  previewAs: { id: number; name: string } | null;
  fallbacksUsed: string[];
  onRefreshPreview: () => void;
}

export default function StepEmail(props: Props) {
  const {
    campaign, subject, preheader, blocks, designs, mergeFields, tokenProblems,
    audienceLabel, ai, aiBusy, aiError, readOnly, onChange, onDraftWithAi,
    onApproveAi, onDesignsChanged,
  } = props;

  const [openTemplates, setOpenTemplates] = useState(blocks.length === 0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);

  const applyTemplate = (design: Design) => {
    onChange({
      subject: design.subject ?? subject,
      preheader: design.preheader ?? preheader,
      blocks: (design.blocks ?? []).map((b, i) => ({ ...b, id: `${design.id}-${i}-${Date.now()}` })),
      designId: design.id,
    });
    setOpenTemplates(false);
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateNote(null);
    const r = await call<{ design: Design }>("/api/crm/marketing/designs", postJson({
      name: templateName.trim(), subject, preheader, blocks,
    }));
    setSavingTemplate(false);
    if (!r.ok) { setTemplateNote(failureText(r, "That template could not be saved.")); return; }
    setTemplateNote(`Saved as "${r.data.design.name}". This campaign is unchanged.`);
    setTemplateName("");
    onDesignsChanged();
  };

  const templateHeader = (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpenTemplates((v) => !v)}
        aria-expanded={openTemplates}
        className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[48px]"
      >
        <FileText className="w-4 h-4 text-teal-700 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">Start from a template</span>
          <span className="block text-xs text-muted-foreground">
            {designs.length === 0
              ? "No templates saved yet — write this one and keep it as one."
              : `${designs.length} saved ${designs.length === 1 ? "template" : "templates"}, or start blank.`}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${openTemplates ? "rotate-180" : ""}`} />
      </button>

      {openTemplates && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-border pt-3">
          {designs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Write this email and use “Keep as a template” below to reuse it.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {designs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => applyTemplate(d)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors min-h-[60px] disabled:opacity-60 ${
                      campaign.designId === d.id
                        ? "border-teal-600 bg-teal-50"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-foreground truncate">{d.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {d.subject ? `“${d.subject}”` : `${(d.blocks ?? []).length} blocks`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Applying a template replaces the subject, preview line and content of this campaign.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <EmailDesigner
        subject={subject}
        preheader={preheader}
        blocks={blocks}
        mergeFields={mergeFields}
        tokenProblems={tokenProblems}
        readOnly={readOnly}
        onChange={onChange}
        header={templateHeader}
        aiPanel={
          <AiDraftPanel
            campaign={campaign}
            ai={ai}
            audienceLabel={audienceLabel}
            busy={aiBusy}
            error={aiError}
            readOnly={readOnly}
            onDraft={onDraftWithAi}
            onApprove={onApproveAi}
          />
        }
        previewHtml={props.previewHtml}
        previewLoading={props.previewLoading}
        previewError={props.previewError}
        previewSubject={props.previewSubject}
        previewAs={props.previewAs}
        fallbacksUsed={props.fallbacksUsed}
        onRefreshPreview={props.onRefreshPreview}
      />

      {/* ── Secondary: keep this as a template ── */}
      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setSaveOpen((v) => !v)}
          aria-expanded={saveOpen}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm text-muted-foreground min-h-[44px]"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${saveOpen ? "rotate-180" : ""}`} />
          Keep this as a template
        </button>
        {saveOpen && (
          <div className="px-3.5 pb-3.5 space-y-2 border-t border-border pt-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={inputClass}
                placeholder="Name it, e.g. Quarterly check-in"
                value={templateName}
                disabled={readOnly}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button
                type="button"
                className={btnGhost}
                disabled={readOnly || savingTemplate || !templateName.trim()}
                onClick={() => void saveAsTemplate()}
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save template
              </button>
            </div>
            {templateNote && <p className="text-xs text-muted-foreground">{templateNote}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
