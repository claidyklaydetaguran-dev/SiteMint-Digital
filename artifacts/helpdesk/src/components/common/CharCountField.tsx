import { Fragment } from "react";

interface CharCountFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  helpText?: string;
  multiline?: boolean;
  rows?: number;
}

/**
 * A labelled field with a live-announced character count.
 *
 * Presentation only: it now uses the dashboard's own `si-field` / `si-label` /
 * `si-input` / `si-hint` classes instead of utility classes of its own, so a
 * prompt field looks like a field on Settings. Those classes read `--v2-*`
 * custom properties that only resolve inside an element carrying `si-form`
 * (see the `.sd-app .si-form` block in `v5-app.css`) — every builder section is
 * rendered inside one, which is why this component does not carry its own.
 *
 * The counter keeps its `aria-live` announcement and is referenced by the
 * control's `aria-describedby`, so the remaining allowance is available to a
 * screen reader rather than only to the eye.
 */
export function CharCountField({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  helpText,
  multiline = true,
  rows = 4,
}: CharCountFieldProps) {
  const len = value.length;
  const overLimit = len > maxLength;
  const nearLimit = !overLimit && len >= Math.floor(maxLength * 0.85);
  const countId = `${id}-count`;
  const helpId = `${id}-help`;
  const describedBy = helpText ? `${helpId} ${countId}` : countId;

  const common = {
    id,
    className: "si-input",
    value,
    placeholder,
    maxLength,
    "aria-describedby": describedBy,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };

  return (
    <div className="si-field">
      <label className="si-label" htmlFor={id}>
        {label}
      </label>

      {multiline ? (
        <textarea {...common} rows={rows} style={{ resize: "vertical", minHeight: "6rem" }} />
      ) : (
        <input {...common} type="text" />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--sd-space-3, .75rem)",
        }}
      >
        {helpText ? (
          <p className="si-hint" id={helpId}>
            {helpText}
          </p>
        ) : (
          <Fragment />
        )}
        <span
          id={countId}
          aria-live="polite"
          style={{
            flex: "0 0 auto",
            fontSize: "var(--sd-text-micro, .6875rem)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: overLimit ? 600 : 400,
            color: overLimit
              ? "var(--sd-danger, #9c2233)"
              : nearLimit
                ? "var(--sd-warn, #8a5200)"
                : "var(--sd-text-muted, #3b5265)",
          }}
        >
          {len} of {maxLength}
        </span>
      </div>
    </div>
  );
}
