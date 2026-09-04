/**
 * V5 customer-shell foundation — the Settings workspace (D-7).
 *
 * Editable now: business name, business type/industry, primary contact (name
 * + email), timezone, default business location — all through
 * `GET/PATCH /api/receptionist/agent-config` via `lib/accountApi.ts` — and
 * account password, through `POST /api/receptionist/account/password/change`
 * (which may not exist yet; `changePassword` in `accountApi.ts` reads a 404
 * as "not available yet", never as a password error). Team membership stays
 * out of scope, per the brief ("Team later").
 *
 * Also reads `?calendar=connected|error` (set by the OAuth return trip from
 * Scheduling → Calendar) and renders a one-time banner, per D-7 / B-4.
 *
 * Sign-out is unchanged from Phase 11: the same `useLogout` hook, the same
 * bounded wait, the same focus-return-on-failure behaviour.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { ArrowRight } from "lucide-react";
import { useSession, useLogout } from "@/hooks/useSession";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAgentConfig, readAccountProfile, updateAccountProfile, changePassword } from "@/lib/accountApi";
import {
  accountFields,
  accountNote,
  buildProfilePatch,
  calendarBannerCopy,
  destinations,
  EMPTY_PASSWORD_FORM,
  NOT_AVAILABLE,
  pageCopy,
  PROFILE_SAVE_ERROR,
  readCalendarParam,
  saveButtonLabel,
  sessionCopy,
  signOutLabel,
  SIGN_OUT_TIMEOUT_MS,
  TIMEZONE_OPTIONS,
  validatePasswordChange,
  validateProfile,
  type PasswordFormValues,
  type ProfileFormValues,
  type SaveState,
  type SignOutState,
} from "@/pages/settings/settingsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-settings.css";
import "@/styles/v2-signin.css";

const EMPTY_PROFILE_FORM: ProfileFormValues = {
  name: "",
  industry: "",
  timezone: "",
  primaryContactName: "",
  primaryContactEmail: "",
  defaultLocation: "",
};

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

export default function Settings() {
  const { data: me, isLoading } = useSession();
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const logout = useLogout();
  const qc = useQueryClient();

  const [signOut, setSignOut] = useState<SignOutState>("idle");
  const signOutRef = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (signOut === "failed") signOutRef.current?.focus();
  }, [signOut]);

  const handleSignOut = useCallback(async () => {
    if (signOut === "pending") return;
    setSignOut("pending");
    try {
      await Promise.race([
        logout(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), SIGN_OUT_TIMEOUT_MS)),
      ]);
      if (!alive.current) return;
      navigate("/login");
    } catch {
      if (!alive.current) return;
      setSignOut("failed");
    }
  }, [logout, navigate, signOut]);

  // ── Profile form ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileFormValues>(EMPTY_PROFILE_FORM);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileFieldError, setProfileFieldError] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetchAgentConfig()
      .then((body) => {
        if (cancelled) return;
        const account = readAccountProfile(body);
        setProfile({
          name: account.name,
          industry: account.industry,
          timezone: account.timezone || browserTimezone(),
          primaryContactName: account.primaryContact.name,
          primaryContactEmail: account.primaryContact.email,
          defaultLocation: account.defaultLocation,
        });
        setProfileLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // A read failure leaves the form blank with the browser timezone
        // preselected — never a fabricated business name or address.
        setProfile((f) => ({ ...f, timezone: f.timezone || browserTimezone() }));
        setProfileLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileFieldError(undefined);
    const validation = validateProfile(profile);
    if (!validation.ok) {
      setProfileError(validation.formError);
      setProfileFieldError(validation.fieldErrors.name);
      return;
    }
    setSaveState("saving");
    try {
      await updateAccountProfile(buildProfilePatch(profile));
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["agent-config"] });
      window.setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setProfileError(PROFILE_SAVE_ERROR);
    }
  };

  // ── Password form ─────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState<PasswordFormValues>(EMPTY_PASSWORD_FORM);
  const [pwError, setPwError] = useState("");
  const [pwFieldErrors, setPwFieldErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});
  const [pwState, setPwState] = useState<"idle" | "saving" | "done" | "unavailable">("idle");

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwFieldErrors({});
    const validation = validatePasswordChange(pwForm);
    if (!validation.ok) {
      setPwError(validation.formError);
      setPwFieldErrors(validation.fieldErrors);
      return;
    }
    setPwState("saving");
    const result = await changePassword(pwForm.currentPassword, pwForm.newPassword);
    if (result.ok) {
      setPwState("done");
      setPwForm(EMPTY_PASSWORD_FORM);
    } else if (result.reason === "unavailable") {
      setPwState("unavailable");
      setPwError(result.message);
    } else {
      setPwState("idle");
      setPwError(result.message);
    }
  };

  const page = pageCopy();
  const session = sessionCopy();
  const calendarState = readCalendarParam(searchParams.get("calendar"));

  if (isLoading) {
    return (
      <div className="sg-page">
        <p className="sg-loading" role="status" aria-live="polite">
          Loading account information…
        </p>
      </div>
    );
  }

  if (!me) return null;

  const fields = accountFields(me.firm);
  const places = destinations();

  return (
    <div className="sg-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{page.eyebrow}</span>
          <h1 className="sd-page__title">{page.title}</h1>
          <p className="sg-lede">{page.detail}</p>
        </div>
      </div>

      {calendarState && (
        <div
          className="sd-status"
          data-state={calendarState === "connected" ? "answering" : "incomplete"}
          role="status"
          style={{ marginBottom: "var(--sd-space-4, 1rem)" }}
        >
          <div className="sd-status__head">
            <span className="sd-status__dot" aria-hidden="true" />
            <div className="sd-status__body">
              <h2 className="sd-status__title">{calendarBannerCopy(calendarState).title}</h2>
              <p className="sd-status__detail">{calendarBannerCopy(calendarState).detail}</p>
            </div>
          </div>
          <div className="sd-status__foot">
            <Link href="/scheduling/calendar" className="sd-step__action">
              Go to Calendar
            </Link>
          </div>
        </div>
      )}

      <section className="sd-section" aria-labelledby="sg-account-title">
        <div className="sd-section__head">
          <div>
            <h2 className="sd-h2" id="sg-account-title">
              Account
            </h2>
            <p className="sg-note">{accountNote()}</p>
          </div>
        </div>
        <dl className="sg-fields">
          {fields.map((field) => (
            <div className="sg-fields__row" key={field.label}>
              <dt className="sg-fields__label">{field.label}</dt>
              <dd className="sg-fields__value" data-missing={field.value === null}>
                {field.value ?? NOT_AVAILABLE}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Editable business profile (D-7). */}
      <section className="sd-section" aria-labelledby="sg-profile-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-profile-title">
            Business profile
          </h2>
        </div>
        <form className="si-form" onSubmit={handleProfileSubmit} noValidate>
          {profileError && (
            <div className="si-alert" role="alert">
              <span className="si-alert__label">Error</span>
              <span className="si-alert__text">{profileError}</span>
            </div>
          )}
          {saveState === "saved" && (
            <div className="si-alert" role="status" data-tone="confirmed">
              <span className="si-alert__label">Saved</span>
              <span className="si-alert__text">Your business profile was updated.</span>
            </div>
          )}

          <div className="si-field">
            <label htmlFor="settings-name" className="si-label">
              Business name <span className="si-req">Required</span>
            </label>
            <input
              id="settings-name"
              className={`si-input${profileFieldError ? " si-input--invalid" : ""}`}
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((f) => ({ ...f, name: e.target.value }))}
              disabled={!profileLoaded}
              aria-invalid={profileFieldError ? true : undefined}
            />
            {profileFieldError && <p className="si-error">{profileFieldError}</p>}
          </div>

          <div className="si-field">
            <label htmlFor="settings-industry" className="si-label">
              Business type / industry <span className="si-req">Optional</span>
            </label>
            <input
              id="settings-industry"
              className="si-input"
              type="text"
              value={profile.industry}
              onChange={(e) => setProfile((f) => ({ ...f, industry: e.target.value }))}
              disabled={!profileLoaded}
            />
          </div>

          <div className="si-field">
            <label htmlFor="settings-contact-name" className="si-label">
              Primary contact name <span className="si-req">Optional</span>
            </label>
            <input
              id="settings-contact-name"
              className="si-input"
              type="text"
              value={profile.primaryContactName}
              onChange={(e) => setProfile((f) => ({ ...f, primaryContactName: e.target.value }))}
              disabled={!profileLoaded}
            />
          </div>

          <div className="si-field">
            <label htmlFor="settings-contact-email" className="si-label">
              Primary contact email <span className="si-req">Optional</span>
            </label>
            <input
              id="settings-contact-email"
              className="si-input"
              type="email"
              value={profile.primaryContactEmail}
              onChange={(e) => setProfile((f) => ({ ...f, primaryContactEmail: e.target.value }))}
              disabled={!profileLoaded}
            />
          </div>

          <div className="si-field">
            <label htmlFor="settings-timezone" className="si-label">
              Timezone <span className="si-req">Optional</span>
            </label>
            <select
              id="settings-timezone"
              className="si-input"
              value={profile.timezone}
              onChange={(e) => setProfile((f) => ({ ...f, timezone: e.target.value }))}
              disabled={!profileLoaded}
            >
              {!TIMEZONE_OPTIONS.includes(profile.timezone as (typeof TIMEZONE_OPTIONS)[number]) && profile.timezone && (
                <option value={profile.timezone}>{profile.timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="si-field">
            <label htmlFor="settings-location" className="si-label">
              Default business location <span className="si-req">Optional</span>
            </label>
            <input
              id="settings-location"
              className="si-input"
              type="text"
              value={profile.defaultLocation}
              onChange={(e) => setProfile((f) => ({ ...f, defaultLocation: e.target.value }))}
              disabled={!profileLoaded}
              placeholder="e.g. 123 Main St, Austin, TX"
            />
          </div>

          <button type="submit" className="si-submit" disabled={!profileLoaded || saveState === "saving"}>
            {saveButtonLabel(saveState)}
          </button>
        </form>
      </section>

      {/* Change password (S-2). */}
      <section className="sd-section" aria-labelledby="sg-password-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-password-title">
            Change password
          </h2>
        </div>
        {pwState === "unavailable" ? (
          <p className="sg-note">{pwError}</p>
        ) : (
          <form className="si-form" onSubmit={handlePasswordSubmit} noValidate>
            {pwError && (
              <div className="si-alert" role="alert">
                <span className="si-alert__label">Error</span>
                <span className="si-alert__text">{pwError}</span>
              </div>
            )}
            {pwState === "done" && (
              <div className="si-alert" role="status" data-tone="confirmed">
                <span className="si-alert__label">Password changed</span>
                <span className="si-alert__text">Your password has been updated.</span>
              </div>
            )}

            <div className="si-field">
              <label htmlFor="pw-current" className="si-label">
                Current password <span className="si-req">Required</span>
              </label>
              <input
                id="pw-current"
                className={`si-input${pwFieldErrors.currentPassword ? " si-input--invalid" : ""}`}
                type="password"
                autoComplete="current-password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
              />
              {pwFieldErrors.currentPassword && <p className="si-error">{pwFieldErrors.currentPassword}</p>}
            </div>

            <div className="si-field">
              <label htmlFor="pw-new" className="si-label">
                New password <span className="si-req">Required</span>
              </label>
              <input
                id="pw-new"
                className={`si-input${pwFieldErrors.newPassword ? " si-input--invalid" : ""}`}
                type="password"
                autoComplete="new-password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
              />
              {pwFieldErrors.newPassword && <p className="si-error">{pwFieldErrors.newPassword}</p>}
            </div>

            <div className="si-field">
              <label htmlFor="pw-confirm" className="si-label">
                Confirm new password <span className="si-req">Required</span>
              </label>
              <input
                id="pw-confirm"
                className={`si-input${pwFieldErrors.confirmPassword ? " si-input--invalid" : ""}`}
                type="password"
                autoComplete="new-password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              />
              {pwFieldErrors.confirmPassword && <p className="si-error">{pwFieldErrors.confirmPassword}</p>}
            </div>

            <button type="submit" className="si-submit" disabled={pwState === "saving"}>
              {pwState === "saving" ? "Changing…" : "Change password"}
            </button>
          </form>
        )}
      </section>

      <section className="sd-section" aria-labelledby="sg-config-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-config-title">
            Configuration
          </h2>
        </div>
        <ul className="sg-places">
          {places.map((place) => (
            <li className="sg-place" key={place.href}>
              <div className="sg-place__body">
                <h3 className="sg-place__title">{place.title}</h3>
                <p className="sg-place__detail">{place.detail}</p>
              </div>
              <Link href={place.href} className="sd-link sg-place__action">
                {place.action}
                <ArrowRight className="sg-icon" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="sd-section" aria-labelledby="sg-session-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-session-title">
            {session.title}
          </h2>
        </div>
        <div className="sg-session">
          <p className="sg-session__detail">{session.detail}</p>
          <button
            ref={signOutRef}
            type="button"
            className="sg-signout"
            onClick={handleSignOut}
            disabled={signOut === "pending"}
            aria-busy={signOut === "pending"}
          >
            {signOutLabel(signOut)}
          </button>
        </div>
        {signOut === "failed" && (
          <div className="sg-failure" role="alert">
            <p className="sg-failure__title">{session.errorTitle}</p>
            <p className="sg-failure__detail">{session.errorDetail}</p>
          </div>
        )}
      </section>
    </div>
  );
}
