/**
 * V7 — the Transfer contacts settings screen.
 *
 * Copy lives in `pages/transfer-contacts/transferContactsContract.ts`.
 *
 * Two behaviours worth naming, because the obvious implementation of each would
 * be wrong:
 *
 *  - Saving writes a row and nothing else. No dial, no provider call, no
 *    "verifying…" spinner that implies a phone rang somewhere.
 *  - "Check setup" runs the server's own resolver and reports what it found,
 *    including when a DIFFERENT contact would win the routing order. It says
 *    plainly that nobody was called, because a resolved destination proves
 *    nothing about whether a phone rings.
 */

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import {
  useDeleteTransferContact,
  useSaveTransferContact,
  useTransferContactCheck,
  useTransferContacts,
} from "@/hooks/useInquiries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  CONTACT_ROLES,
  TransferContactValidationError,
  type ContactRole,
  type TransferContact,
  type TransferContactDraft,
  type TransferContactFieldError,
  type TransferTestReport,
} from "@/lib/inquiriesApi";
import {
  CONTACT_ROLE_LABEL,
  COPY,
  PAGE,
  minutesToTimeValue,
  roleLabel,
  testOutcomeLabel,
  timeValueToMinutes,
} from "@/pages/transfer-contacts/transferContactsContract";
import "@/styles/v2-dashboard.css";

/**
 * Calling codes offered in the country selector. Deliberately a short, explicit
 * list plus a free international option: the server never guesses a country, so
 * neither does this form.
 */
const COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "1", name: "United States / Canada (+1)" },
  { code: "44", name: "United Kingdom (+44)" },
  { code: "61", name: "Australia (+61)" },
  { code: "63", name: "Philippines (+63)" },
  { code: "64", name: "New Zealand (+64)" },
  { code: "65", name: "Singapore (+65)" },
  { code: "353", name: "Ireland (+353)" },
  { code: "91", name: "India (+91)" },
  { code: "971", name: "United Arab Emirates (+971)" },
];

const TIMEZONES: readonly string[] = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Dublin",
  "Asia/Manila",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

interface FormState {
  id: number | null;
  label: string;
  phone: string;
  countryCode: string;
  contactRole: ContactRole;
  roleLabel: string;
  useBusinessHours: boolean;
  timezone: string;
  hoursStart: string;
  hoursEnd: string;
  businessHoursOnly: boolean;
  active: boolean;
  priority: string;
  isDefault: boolean;
  consentConfirmed: boolean;
}

function emptyForm(): FormState {
  return {
    id: null,
    label: "",
    phone: "",
    countryCode: "1",
    contactRole: "manager",
    roleLabel: "",
    useBusinessHours: true,
    timezone: "America/New_York",
    hoursStart: "09:00",
    hoursEnd: "17:00",
    businessHoursOnly: true,
    active: true,
    priority: "100",
    isDefault: false,
    consentConfirmed: false,
  };
}

function formFrom(contact: TransferContact): FormState {
  return {
    id: contact.id,
    label: contact.label,
    // An existing contact is edited in the international form it was stored in,
    // so a round-trip cannot silently re-derive a different country.
    phone: contact.phoneE164,
    countryCode: "1",
    contactRole: contact.contactRole,
    roleLabel: contact.roleLabel ?? "",
    useBusinessHours: contact.useBusinessHours,
    timezone: contact.timezone ?? "America/New_York",
    hoursStart: minutesToTimeValue(contact.hoursStartMinute) || "09:00",
    hoursEnd: minutesToTimeValue(contact.hoursEndMinute) || "17:00",
    businessHoursOnly: contact.businessHoursOnly,
    active: contact.active,
    priority: String(contact.priority),
    isDefault: contact.isDefault,
    consentConfirmed: contact.consentConfirmed,
  };
}

function toDraft(form: FormState): TransferContactDraft {
  const draft: TransferContactDraft = {
    label: form.label,
    phone: form.phone,
    countryCode: form.countryCode,
    contactRole: form.contactRole,
    useBusinessHours: form.useBusinessHours,
    businessHoursOnly: form.businessHoursOnly,
    active: form.active,
    priority: Number(form.priority) || 100,
    isDefault: form.isDefault,
    consentConfirmed: form.consentConfirmed,
  };
  if (form.contactRole === "custom") draft.roleLabel = form.roleLabel;
  if (!form.useBusinessHours) {
    draft.timezone = form.timezone;
    const start = timeValueToMinutes(form.hoursStart);
    const end = timeValueToMinutes(form.hoursEnd);
    if (start !== null) draft.hoursStartMinute = start;
    if (end !== null) draft.hoursEndMinute = end;
  }
  return draft;
}

function errorFor(errors: TransferContactFieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export default function TransferContacts() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const contactsQuery = useTransferContacts();
  const saveContact = useSaveTransferContact();
  const removeContact = useDeleteTransferContact();
  const runCheck = useTransferContactCheck();

  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TransferContactFieldError[]>([]);
  const [report, setReport] = useState<{ id: number; report: TransferTestReport } | null>(null);
  const [checkFailedId, setCheckFailedId] = useState<number | null>(null);

  if (sessionLoading || contactsQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} list />;
  }
  if (!me) return null;

  const contacts = contactsQuery.data?.items ?? [];
  const capability = contactsQuery.data?.capability;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }));

  const handleSave = async () => {
    if (form === null) return;
    setFieldErrors([]);
    try {
      await saveContact.mutateAsync({ id: form.id, draft: toDraft(form) });
      setForm(null);
    } catch (err) {
      if (err instanceof TransferContactValidationError) setFieldErrors(err.errors);
      else setFieldErrors([{ field: "form", code: "unknown", message: COPY.errorDetail }]);
    }
  };

  const handleCheck = async (contact: TransferContact) => {
    setCheckFailedId(null);
    setReport(null);
    try {
      const result = await runCheck.mutateAsync(contact.id);
      setReport({ id: contact.id, report: result });
    } catch {
      setCheckFailedId(contact.id);
    }
  };

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
        {form === null && (
          <Button type="button" onClick={() => setForm(emptyForm())}>
            {COPY.addLabel}
          </Button>
        )}
      </div>

      {capability && (
        <section className="mb-5 rounded-lg border border-card-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {COPY.capabilityTitle}
          </h2>
          <p className="mt-1 text-sm text-foreground">
            <span className="font-medium">
              {capability.state === "active" ? COPY.capabilityStateActive : COPY.capabilityStateBlocked}
            </span>{" "}
            {capability.explanation}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.browserVsPhoneNote}</p>
        </section>
      )}

      {contactsQuery.isError && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{COPY.errorTitle}</span>
            <p className="sd-error__detail">{COPY.errorDetail}</p>
          </div>
          <button
            type="button"
            className="sd-error__action"
            onClick={() => contactsQuery.refetch()}
            disabled={contactsQuery.isRefetching}
          >
            {contactsQuery.isRefetching ? COPY.retryingLabel : COPY.retryLabel}
          </button>
        </section>
      )}

      {form !== null && (
        <section className="mb-6 rounded-lg border border-card-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            {form.id === null ? COPY.formNewTitle : COPY.formEditTitle}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{COPY.nameLabel}</span>
              <input
                type="text"
                className="rounded-md border border-card-border bg-background px-3 py-2"
                value={form.label}
                placeholder={COPY.namePlaceholder}
                onChange={(e) => set("label", e.target.value)}
              />
              {errorFor(fieldErrors, "label") && (
                <span className="text-xs text-destructive">{errorFor(fieldErrors, "label")}</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{COPY.roleLabel}</span>
              <select
                className="rounded-md border border-card-border bg-background px-3 py-2"
                value={form.contactRole}
                onChange={(e) => set("contactRole", e.target.value as ContactRole)}
              >
                {CONTACT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {CONTACT_ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">{COPY.roleHint}</span>
            </label>

            {form.contactRole === "custom" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{COPY.customRoleLabel}</span>
                <input
                  type="text"
                  className="rounded-md border border-card-border bg-background px-3 py-2"
                  value={form.roleLabel}
                  placeholder={COPY.customRolePlaceholder}
                  onChange={(e) => set("roleLabel", e.target.value)}
                />
                {errorFor(fieldErrors, "roleLabel") && (
                  <span className="text-xs text-destructive">{errorFor(fieldErrors, "roleLabel")}</span>
                )}
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{COPY.countryLabel}</span>
              <select
                className="rounded-md border border-card-border bg-background px-3 py-2"
                value={form.countryCode}
                onChange={(e) => set("countryCode", e.target.value)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{COPY.phoneLabel}</span>
              <input
                type="tel"
                inputMode="tel"
                className="rounded-md border border-card-border bg-background px-3 py-2"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">{COPY.phoneHint}</span>
              {errorFor(fieldErrors, "phone") && (
                <span className="text-xs text-destructive">{errorFor(fieldErrors, "phone")}</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{COPY.priorityLabel}</span>
              <input
                type="number"
                min={1}
                max={999}
                className="rounded-md border border-card-border bg-background px-3 py-2"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">{COPY.priorityHint}</span>
            </label>
          </div>

          <fieldset className="mt-4 rounded-md border border-card-border p-3">
            <legend className="px-1 text-sm font-medium">{COPY.hoursLegend}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hours-mode"
                checked={form.useBusinessHours}
                onChange={() => set("useBusinessHours", true)}
              />
              <span>{COPY.useBusinessHoursLabel}</span>
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hours-mode"
                checked={!form.useBusinessHours}
                onChange={() => set("useBusinessHours", false)}
              />
              <span>{COPY.ownHoursLabel}</span>
            </label>

            {!form.useBusinessHours && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{COPY.timezoneLabel}</span>
                  <select
                    className="rounded-md border border-card-border bg-background px-3 py-2"
                    value={form.timezone}
                    onChange={(e) => set("timezone", e.target.value)}
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                  {errorFor(fieldErrors, "timezone") && (
                    <span className="text-xs text-destructive">{errorFor(fieldErrors, "timezone")}</span>
                  )}
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{COPY.hoursStartLabel}</span>
                  <input
                    type="time"
                    className="rounded-md border border-card-border bg-background px-3 py-2"
                    value={form.hoursStart}
                    onChange={(e) => set("hoursStart", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{COPY.hoursEndLabel}</span>
                  <input
                    type="time"
                    className="rounded-md border border-card-border bg-background px-3 py-2"
                    value={form.hoursEnd}
                    onChange={(e) => set("hoursEnd", e.target.value)}
                  />
                  {errorFor(fieldErrors, "hoursStartMinute") && (
                    <span className="text-xs text-destructive">{errorFor(fieldErrors, "hoursStartMinute")}</span>
                  )}
                </label>
              </div>
            )}
          </fieldset>

          <div className="mt-4 flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.businessHoursOnly}
                onChange={(e) => set("businessHoursOnly", e.target.checked)}
              />
              <span>
                {COPY.businessHoursOnlyLabel}
                <span className="block text-xs text-muted-foreground">{COPY.businessHoursOnlyHint}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              <span>
                {COPY.activeLabel}
                <span className="block text-xs text-muted-foreground">{COPY.activeHint}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.isDefault}
                onChange={(e) => set("isDefault", e.target.checked)}
              />
              <span>{COPY.defaultLabel}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.consentConfirmed}
                onChange={(e) => set("consentConfirmed", e.target.checked)}
              />
              <span>
                {COPY.consentLabel}
                <span className="block text-xs text-muted-foreground">{COPY.consentHint}</span>
              </span>
            </label>
          </div>

          {errorFor(fieldErrors, "form") && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {errorFor(fieldErrors, "form")}
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">{COPY.saveNeverDialsNote}</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={handleSave} disabled={saveContact.isPending}>
              {saveContact.isPending ? COPY.savingLabel : COPY.saveLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForm(null);
                setFieldErrors([]);
              }}
            >
              {COPY.cancelLabel}
            </Button>
          </div>
        </section>
      )}

      {!contactsQuery.isError && contacts.length === 0 && form === null && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{COPY.emptyTitle}</h3>
          <p className="sd-empty__detail">{COPY.emptyDetail}</p>
          <Button type="button" className="mt-3" onClick={() => setForm(emptyForm())}>
            {COPY.addLabel}
          </Button>
        </div>
      )}

      {contacts.length > 0 && (
        <ul className="sd-list">
          {contacts.map((contact) => (
            <li className="sd-list__item" key={contact.id}>
              <div className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {contact.isDefault && <Badge variant="secondary">{COPY.defaultBadge}</Badge>}
                  {!contact.active && <Badge variant="outline">{COPY.inactiveBadge}</Badge>}
                  {!contact.consentConfirmed && <Badge variant="destructive">{COPY.needsConsentBadge}</Badge>}
                  <Badge variant="outline">
                    {contact.businessHoursOnly ? COPY.businessHoursBadge : COPY.alwaysAvailableBadge}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-foreground">{contact.label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {roleLabel(contact.contactRole, contact.roleLabel)} · {contact.phoneDisplay}
                  </p>
                  {!contact.useBusinessHours && contact.timezone && (
                    <p className="text-xs text-muted-foreground">
                      {minutesToTimeValue(contact.hoursStartMinute)}–{minutesToTimeValue(contact.hoursEndMinute)}{" "}
                      {contact.timezone}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {COPY.lastTestLabel}: {testOutcomeLabel(contact.lastTestOutcome)}
                  </p>
                </div>

                {checkFailedId === contact.id && (
                  <div className="sd-error" role="alert">
                    <div className="sd-error__body">
                      <span className="sd-error__title">{COPY.checkFailedTitle}</span>
                      <p className="sd-error__detail">{COPY.checkFailedDetail}</p>
                    </div>
                  </div>
                )}

                {report?.id === contact.id && (
                  <div className="rounded-md border border-card-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={report.report.readyToAttempt ? "secondary" : "destructive"}>
                        {report.report.readyToAttempt ? COPY.checkPassedLabel : COPY.checkFailedLabel}
                      </Badge>
                      <span className="text-sm font-medium">{COPY.checkResultTitle}</span>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {report.report.checks.map((check) => (
                        <li key={check.name} className="flex gap-2">
                          <span aria-hidden="true">{check.pass ? "✓" : "✗"}</span>
                          <span>
                            <span className="font-medium">{check.name}</span> — {check.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/*
                      The number, not just the name. A business authorising a
                      transfer is agreeing that callers may be put through to
                      these digits, and the resolver may pick a different
                      contact than the one being checked.
                    */}
                    {report.report.wouldDial != null && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">{COPY.wouldDialLabel}</span>{" "}
                        {report.report.wouldDial.label} —{" "}
                        <span className="tabular-nums">{report.report.wouldDial.phoneDisplay}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {COPY.checkNobodyCalledNote} {report.report.limitation}
                    </p>
                    {report.report.handoffNote != null && (
                      <p className="mt-1 text-xs text-muted-foreground">{report.report.handoffNote}</p>
                    )}
                    {report.report.costNote != null && (
                      <p className="mt-1 text-xs text-muted-foreground">{report.report.costNote}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={runCheck.isPending}>
                        {runCheck.isPending ? COPY.checkingLabel : COPY.checkLabel}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{COPY.checkConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {contact.label} · {contact.phoneDisplay}
                          <br />
                          {COPY.checkConfirmDetail}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{COPY.checkConfirmDismiss}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleCheck(contact)}>
                          {COPY.checkConfirmAction}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm(formFrom(contact));
                      setFieldErrors([]);
                    }}
                  >
                    {COPY.editLabel}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={removeContact.isPending}>
                        {COPY.removeLabel}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{COPY.removeConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{COPY.removeConfirmDetail}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{COPY.removeConfirmDismiss}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeContact.mutate(contact.id)}>
                          {COPY.removeConfirmAction}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
