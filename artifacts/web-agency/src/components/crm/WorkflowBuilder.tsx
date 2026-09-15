import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Plus, ShieldCheck, Trash2, X,
} from "lucide-react";

// ── M4: the automation rule builder ──────────────────────────────────────────
//
// A rule is "when X happens, if Y is true, do Z — unless W". This form only
// ever offers choices the server will accept: the trigger decides which record
// the rule is about, the record decides which fields can be compared, and a
// narrower list again decides which fields an automation may WRITE. Everything
// comes from `GET /api/crm/automation/vocabulary`, so a build that gains a new
// trigger or action needs no change here.
//
// The loop protections are shown, not hidden. They are the difference between
// a workflow and a runaway process that assigns tasks all night, and a person
// authoring a rule should be able to see what will stop it.

// ── The vocabulary contract ──────────────────────────────────────────────────

export interface AutomationVocabulary {
  triggers: { trigger: string; recordType: string }[];
  operators: string[];
  combiners: string[];
  actionTypes: string[];
  recordTypes: string[];
  fields: Record<string, string[]>;
  writableFields: Record<string, string[]>;
  staff: { id: number; displayName: string }[];
}

export interface RuleCondition {
  field: string;
  operator: string;
  value?: unknown;
}

export interface RuleConditionGroup {
  combine: string;
  conditions: RuleCondition[];
}

export interface RuleAction {
  type: string;
  config: Record<string, unknown>;
  approverStaffId?: number | null;
}

export interface WorkflowRuleDraft {
  id?: number;
  name: string;
  description?: string | null;
  trigger: string;
  enabled?: boolean;
  conditions?: RuleConditionGroup | null;
  stopConditions?: RuleConditionGroup | null;
  actions?: RuleAction[] | null;
  maxChainDepth?: number;
  windowCap?: number;
  windowMinutes?: number;
  maxActionAttempts?: number;
}

// ── Wording ──────────────────────────────────────────────────────────────────

const TRIGGER_WORDS: Record<string, string> = {
  lead_created: "A contact is created",
  lead_status_changed: "A contact's status changes",
  deal_stage_changed: "A deal moves stage",
  deal_won: "A deal is won",
  deal_lost: "A deal is lost",
  task_overdue: "A task goes overdue",
  appointment_booked: "An appointment is booked",
  document_request_completed: "A requested document arrives",
  inbound_message_received: "A message comes in",
  no_activity_for_days: "A contact goes quiet for N days",
};

const ACTION_WORDS: Record<string, string> = {
  assign_owner: "Assign an owner",
  create_task: "Create a task",
  notify: "Notify somebody (in-app)",
  set_field: "Set a field",
  add_note: "Add a note",
  schedule_follow_up: "Schedule a follow-up",
  request_approval: "Ask somebody to approve",
};

const OPERATOR_WORDS: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  greater_than: "is more than",
  less_than: "is less than",
  is_empty: "is empty",
  in_list: "is one of",
};

const label = (dict: Record<string, string>, key: string) =>
  dict[key] ?? key.replace(/_/g, " ");

const NO_VALUE = new Set(["is_empty"]);

// ── Small building blocks ────────────────────────────────────────────────────

const inputClass =
  "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground "
  + "focus:outline-none focus:ring-1 focus:ring-teal-500";

const fieldLabel = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabel}>{title}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Panel({ title, hint, children, right }: {
  title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section className="border border-border rounded-xl bg-background overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-muted">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </header>
      {hint && <p className="px-4 pt-3 text-[11px] text-muted-foreground">{hint}</p>}
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

// ── Conditions ───────────────────────────────────────────────────────────────

function ConditionRows({ group, fields, operators, combiners, onChange, emptyText }: {
  group: RuleConditionGroup;
  fields: string[];
  operators: string[];
  combiners: string[];
  onChange: (next: RuleConditionGroup) => void;
  emptyText: string;
}) {
  const set = (i: number, patch: Partial<RuleCondition>) => {
    const conditions = group.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange({ ...group, conditions });
  };

  return (
    <>
      {group.conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className={fieldLabel}>Match</span>
          <select
            value={group.combine}
            onChange={(e) => onChange({ ...group, combine: e.target.value })}
            className="px-2 py-1 text-xs border border-input rounded-lg bg-background text-foreground"
          >
            {combiners.map((c) => (
              <option key={c} value={c}>{c === "and" ? "all of these" : "any of these"}</option>
            ))}
          </select>
        </div>
      )}

      {group.conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}

      {group.conditions.map((condition, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <Field title="Field">
            <select
              value={condition.field}
              onChange={(e) => set(i, { field: e.target.value })}
              className={inputClass}
            >
              {!fields.includes(condition.field) && (
                <option value={condition.field}>{condition.field || "Pick a field"}</option>
              )}
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field title="Comparison">
            <select
              value={condition.operator}
              onChange={(e) => set(i, { operator: e.target.value })}
              className={inputClass}
            >
              {operators.map((o) => (
                <option key={o} value={o}>{label(OPERATOR_WORDS, o)}</option>
              ))}
            </select>
          </Field>
          <Field title="Value">
            <input
              value={NO_VALUE.has(condition.operator) ? "" : String(condition.value ?? "")}
              disabled={NO_VALUE.has(condition.operator)}
              placeholder={condition.operator === "in_list" ? "one, two, three" : ""}
              onChange={(e) => set(i, { value: e.target.value })}
              className={`${inputClass} disabled:opacity-50`}
            />
          </Field>
          <button
            type="button"
            aria-label="Remove this condition"
            onClick={() => onChange({
              ...group, conditions: group.conditions.filter((_, idx) => idx !== i),
            })}
            className="h-[38px] px-2.5 border border-border rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({
          ...group,
          conditions: [...group.conditions, { field: fields[0] ?? "", operator: "equals", value: "" }],
        })}
        disabled={fields.length === 0}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
      >
        <Plus className="w-3 h-3" /> Add a condition
      </button>
    </>
  );
}

// ── Action settings ──────────────────────────────────────────────────────────

function ActionSettings({ action, writable, staff, onChange }: {
  action: RuleAction;
  writable: string[];
  staff: { id: number; displayName: string }[];
  onChange: (config: Record<string, unknown>) => void;
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...action.config, ...patch });
  const text = (key: string) => String(action.config[key] ?? "");

  const staffSelect = (key: string, title: string) => (
    <Field title={title}>
      <select value={text(key)} onChange={(e) => set({ [key]: Number(e.target.value) || "" })} className={inputClass}>
        <option value="">Pick somebody</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
      </select>
    </Field>
  );

  switch (action.type) {
    case "assign_owner":
      return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{staffSelect("staffId", "Assign to")}</div>;

    case "notify":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {staffSelect("staffId", "Notify")}
          <Field title="Headline">
            <input value={text("title")} onChange={(e) => set({ title: e.target.value })} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field title="Detail">
              <input value={text("body")} onChange={(e) => set({ body: e.target.value })} className={inputClass} />
            </Field>
          </div>
        </div>
      );

    case "create_task":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="sm:col-span-2">
            <Field title="Task title">
              <input value={text("title")} onChange={(e) => set({ title: e.target.value })}
                placeholder="Call them about the proposal" className={inputClass} />
            </Field>
          </div>
          {staffSelect("assigneeStaffId", "Give it to")}
          <Field title="Due in (days)">
            <input type="number" value={text("dueInDays")}
              onChange={(e) => set({ dueInDays: e.target.value === "" ? "" : Number(e.target.value) })}
              className={inputClass} />
          </Field>
        </div>
      );

    case "set_field":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field title="Field">
            <select value={text("field")} onChange={(e) => set({ field: e.target.value })} className={inputClass}>
              <option value="">Pick a field</option>
              {writable.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field title="Set it to">
            <input value={text("value")} onChange={(e) => set({ value: e.target.value })} className={inputClass} />
          </Field>
          {writable.length === 0 && (
            <p className="sm:col-span-2 text-[11px] text-amber-700">
              An automation may not change any field on this kind of record.
            </p>
          )}
        </div>
      );

    case "add_note":
      return (
        <Field title="Note">
          <input value={text("body")} onChange={(e) => set({ body: e.target.value })}
            placeholder="What should the note say?" className={inputClass} />
        </Field>
      );

    case "schedule_follow_up":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field title="Follow up in (days)">
            <input type="number" value={text("inDays")}
              onChange={(e) => set({ inDays: e.target.value === "" ? "" : Number(e.target.value) })}
              className={inputClass} />
          </Field>
        </div>
      );

    case "request_approval":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {staffSelect("approverStaffId", "Who must approve")}
          <Field title="What are they approving?">
            <input value={text("summary")} onChange={(e) => set({ summary: e.target.value })} className={inputClass} />
          </Field>
        </div>
      );

    default:
      return null;
  }
}

// ── The builder ──────────────────────────────────────────────────────────────

export interface WorkflowBuilderProps {
  vocabulary: AutomationVocabulary;
  initial?: WorkflowRuleDraft | null;
  saving?: boolean;
  error?: string | null;
  onSave: (draft: WorkflowRuleDraft) => void;
  onCancel: () => void;
}

const blankGroup = (combine: string): RuleConditionGroup => ({ combine, conditions: [] });

export default function WorkflowBuilder({
  vocabulary, initial, saving, error, onSave, onCancel,
}: WorkflowBuilderProps) {
  const firstTrigger = vocabulary.triggers[0]?.trigger ?? "lead_created";

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [trigger, setTrigger] = useState(initial?.trigger ?? firstTrigger);
  const [conditions, setConditions] = useState<RuleConditionGroup>(
    initial?.conditions ?? blankGroup("and"));
  const [stopConditions, setStopConditions] = useState<RuleConditionGroup>(
    initial?.stopConditions ?? blankGroup("or"));
  const [actions, setActions] = useState<RuleAction[]>(initial?.actions ?? []);
  const [maxChainDepth, setMaxChainDepth] = useState(initial?.maxChainDepth ?? 3);
  const [windowCap, setWindowCap] = useState(initial?.windowCap ?? 5);
  const [windowMinutes, setWindowMinutes] = useState(initial?.windowMinutes ?? 60);
  const [maxActionAttempts, setMaxActionAttempts] = useState(initial?.maxActionAttempts ?? 3);
  const [brakesOpen, setBrakesOpen] = useState(false);

  const recordType = useMemo(
    () => vocabulary.triggers.find((t) => t.trigger === trigger)?.recordType ?? "lead",
    [trigger, vocabulary.triggers],
  );
  const fields = vocabulary.fields[recordType] ?? [];
  const writable = vocabulary.writableFields[recordType] ?? [];

  // Changing the trigger changes which record the rule is about, so conditions
  // written against the old record's fields would no longer be valid — and the
  // server would refuse the save with a message about a field the author can no
  // longer see. Clearing them is the honest response.
  useEffect(() => {
    if (!initial || initial.trigger !== trigger) {
      setConditions((g) => (g.conditions.every((c) => fields.includes(c.field)) ? g : blankGroup(g.combine)));
      setStopConditions((g) => (g.conditions.every((c) => fields.includes(c.field)) ? g : blankGroup(g.combine)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const setAction = (i: number, patch: Partial<RuleAction>) =>
    setActions((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const move = (i: number, by: number) =>
    setActions((list) => {
      const next = [...list];
      const to = i + by;
      if (to < 0 || to >= next.length) return list;
      [next[i], next[to]] = [next[to]!, next[i]!];
      return next;
    });

  const submit = () => onSave({
    id: initial?.id,
    name: name.trim(),
    description: description.trim() || null,
    trigger,
    conditions,
    stopConditions,
    actions,
    maxChainDepth, windowCap, windowMinutes, maxActionAttempts,
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      <Panel title="When">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field title="Rule name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Chase a proposal nobody answered" className={inputClass} />
          </Field>
          <Field title="Trigger">
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={inputClass}>
              {vocabulary.triggers.map((t) => (
                <option key={t.trigger} value={t.trigger}>{label(TRIGGER_WORDS, t.trigger)}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field title="What is this for?">
              <input value={description ?? ""} onChange={(e) => setDescription(e.target.value)}
                placeholder="So the next person knows why this exists" className={inputClass} />
            </Field>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          This rule is about a <span className="font-semibold text-foreground">{recordType.replace(/_/g, " ")}</span>,
          so its conditions compare that record's fields — as they stand when the rule runs, not when the event fired.
        </p>
      </Panel>

      <Panel title="Only if" hint="Leave this empty to act on every occurrence of the trigger.">
        <ConditionRows
          group={conditions} fields={fields}
          operators={vocabulary.operators} combiners={vocabulary.combiners}
          onChange={setConditions}
          emptyText="No conditions — this rule acts every time the trigger fires."
        />
      </Panel>

      <Panel title="Then">
        {actions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            A rule that does nothing is not a rule. Add at least one step.
          </p>
        )}

        {actions.map((action, i) => (
          <div key={i} className="border border-border rounded-lg overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted border-b border-border">
              <span className="text-[11px] font-bold text-muted-foreground">Step {i + 1}</span>
              <select
                value={action.type}
                onChange={(e) => setAction(i, { type: e.target.value, config: {} })}
                className="px-2 py-1 text-xs border border-input rounded-lg bg-background text-foreground min-w-0"
              >
                {vocabulary.actionTypes.map((t) => (
                  <option key={t} value={t}>{label(ACTION_WORDS, t)}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" aria-label="Move this step up" onClick={() => move(i, -1)} disabled={i === 0}
                  className="p-1.5 border border-border rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" aria-label="Move this step down" onClick={() => move(i, 1)}
                  disabled={i === actions.length - 1}
                  className="p-1.5 border border-border rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" aria-label="Remove this step"
                  onClick={() => setActions((l) => l.filter((_, idx) => idx !== i))}
                  className="p-1.5 border border-border rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2.5">
              <ActionSettings
                action={action} writable={writable} staff={vocabulary.staff}
                onChange={(config) => setAction(i, { config })}
              />

              {action.type !== "request_approval" && (
                <div className="pt-2 border-t border-border/60">
                  <Field title="Needs approval first (optional)">
                    <select
                      value={action.approverStaffId ? String(action.approverStaffId) : ""}
                      onChange={(e) => setAction(i, {
                        approverStaffId: e.target.value ? Number(e.target.value) : null,
                      })}
                      className={inputClass}
                    >
                      <option value="">Nobody — run it straight away</option>
                      {vocabulary.staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.displayName} must approve</option>
                      ))}
                    </select>
                  </Field>
                  {action.approverStaffId && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
                      The rule waits here until they decide. Only they can decide it, and a rejection
                      stops the whole run with their reason attached.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setActions((l) => [...l, { type: vocabulary.actionTypes[0] ?? "add_note", config: {} }])}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors"
        >
          <Plus className="w-3 h-3" /> Add a step
        </button>

        <p className="text-[11px] text-muted-foreground">
          None of these steps can contact a customer. Notifications are the in-app bell; there is no
          email, text or call step, so a rule cannot reach a client by accident.
        </p>
      </Panel>

      <Panel title="Unless" hint="Checked before the first step and again before every step after it, so a run already under way still stops.">
        <ConditionRows
          group={stopConditions} fields={fields}
          operators={vocabulary.operators} combiners={vocabulary.combiners}
          onChange={setStopConditions}
          emptyText="Nothing stops this rule once it starts."
        />
      </Panel>

      <Panel
        title="Safety limits"
        right={(
          <button type="button" onClick={() => setBrakesOpen((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground">
            {brakesOpen ? "Hide" : "Show"}
          </button>
        )}
      >
        <p className="text-[11px] text-muted-foreground">
          A rule whose action causes its own trigger would otherwise run forever. Chain depth counts
          automation hops; the cap limits how often this rule may touch one record. Neither can be
          switched off.
        </p>
        {brakesOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field title="Chain depth limit">
              <input type="number" min={1} max={10} value={maxChainDepth}
                onChange={(e) => setMaxChainDepth(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field title="Runs per record">
              <input type="number" min={1} max={500} value={windowCap}
                onChange={(e) => setWindowCap(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field title="…within this many minutes">
              <input type="number" min={1} max={10080} value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field title="Retries for a failed step">
              <input type="number" min={1} max={10} value={maxActionAttempts}
                onChange={(e) => setMaxActionAttempts(Number(e.target.value))} className={inputClass} />
            </Field>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" onClick={submit} disabled={saving}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initial?.id ? "Save changes" : "Create rule"}
        </button>
        <button
          type="button" onClick={onCancel} disabled={saving}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
