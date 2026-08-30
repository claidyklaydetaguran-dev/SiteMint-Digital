import type { FieldErrors } from "react-hook-form";
import type { DiscoveryDraft } from "./discoveryFormModel";

interface FlatError {
  path: string;
  message: string;
}

/** Presentation-only: turns a dot-path's last segment into a readable label. Never used for validation. */
function humanizeFieldName(path: string): string {
  const last = path.replace(/\]$/, "").split(/[.[]/).pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Presentation-only: replaces raw Zod issue text with friendlier business language. Never changes what passes or fails. */
function friendlyMessage(rawMessage: string, path: string): string {
  const label = humanizeFieldName(path);
  if (/expected string, received undefined/i.test(rawMessage)) return `${label} is required.`;
  if (/expected true, received/i.test(rawMessage)) return `Please check "${label}" to continue.`;
  if (/expected boolean, received undefined/i.test(rawMessage)) return `Please choose Yes or No for "${label}".`;
  if (/invalid option/i.test(rawMessage)) return `Please make a selection for "${label}".`;
  if (/too small|at least 1 character/i.test(rawMessage)) return `${label} is required.`;
  if (/invalid.*url/i.test(rawMessage)) return `Please enter a valid web address for "${label}".`;
  if (/invalid.*email/i.test(rawMessage)) return `Please enter a valid email address.`;
  return `${label}: ${rawMessage}`;
}

function flattenErrors(node: unknown, path: string, out: FlatError[]): void {
  if (node === undefined || node === null) return;
  if (typeof node === "object" && "message" in (node as Record<string, unknown>) && !Array.isArray(node)) {
    const message = (node as { message?: unknown }).message;
    if (typeof message === "string") {
      out.push({ path, message: friendlyMessage(message, path) });
      return;
    }
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => flattenErrors(child, path ? `${path}[${index}]` : `${index}`, out));
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flattenErrors(value, path ? `${path}.${key}` : key, out);
    }
  }
}

interface DiscoveryValidationSummaryProps {
  stepKey: keyof DiscoveryDraft;
  errors: FieldErrors<DiscoveryDraft>;
  onFocusField: (path: string) => void;
}

export function DiscoveryValidationSummary({ stepKey, errors, onFocusField }: DiscoveryValidationSummaryProps) {
  const stepErrors = errors[stepKey];
  if (!stepErrors) return null;

  const flat: FlatError[] = [];
  flattenErrors(stepErrors, String(stepKey), flat);

  if (flat.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-6 rounded-md border border-[hsl(var(--sm-color-status-danger))]/30 bg-[hsl(var(--sm-color-status-danger))]/5 p-4"
    >
      <p className="mb-2 text-sm font-medium text-[hsl(var(--sm-color-status-danger))]">
        {flat.length === 1 ? "1 field needs attention" : `${flat.length} fields need attention`}
      </p>
      <ul className="space-y-1">
        {flat.map((error) => (
          <li key={error.path}>
            <button
              type="button"
              onClick={() => onFocusField(error.path)}
              className="text-sm text-[hsl(var(--sm-color-status-danger))] underline underline-offset-2 hover:no-underline"
            >
              {error.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
