import { useSearch } from "wouter";
import { useState } from "react";
import { MintArrow } from "./MintArrow";

export const SCOPE_DRAFT_KEY = "sitemint:pricing-scope";

/**
 * An optional local summary, never a submitted inquiry or a server draft.
 *
 * Receptionist variant (launch follow-up, 2026-09-24): "Request pricing" now
 * leads to the working discovery brief (persisted + acknowledged by the
 * backend since the 2026-09-24 release) rather than a mail-only action. The
 * email address stays available as a plain secondary link.
 */
export function InquiryContext() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isReceptionist = params.get("service") === "ai-receptionist";
  const scopeParam = params.get("scope");
  let scope = "";
  try {
    scope =
      scopeParam === "draft"
        ? sessionStorage.getItem(SCOPE_DRAFT_KEY) || ""
        : scopeParam?.slice(0, 4000) || "";
  } catch {
    /* Storage may be disabled. The normal contact journey stays usable. */
  }
  const [copied, setCopied] = useState(false);
  if (!isReceptionist && !scopeParam) return null;
  const subject = isReceptionist ? "AI receptionist pricing request" : "My SiteMint project scope";
  const body = isReceptionist
    ? "Hi SiteMint, I'd like pricing for the AI receptionist.\n\nBusiness name:\nBusiness type:\nApproximate monthly calls:\nWhat I need help with:\n"
    : `Hi SiteMint, I'd like to discuss this starting scope:\n\n${scope}`;
  const mailto = `mailto:info.sitemint@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <aside
      id={isReceptionist ? "request-pricing" : "project-summary"}
      className="mint-inquiry"
      aria-labelledby="inquiry-title"
    >
      <span className="v3-eyebrow">
        {isReceptionist ? "AI receptionist pricing" : "Your starting point"}
      </span>
      <h2 id="inquiry-title">
        {isReceptionist
          ? "Let's find the right fit for your calls."
          : "Your project summary is here."}
      </h2>
      <p>
        {isReceptionist
          ? "We’ll review your call volume, setup and expected usage, then give you a clear quote before activation. We help configure and test your assistant with you before it handles live calls."
          : scope
            ? "Review your summary below. You can email it to us, or copy it into the discovery brief. Nothing has been submitted yet."
            : "This summary was saved in another browser tab or is no longer available. Return to pricing to recreate it, or contact us directly."}
      </p>
      {scope && <pre>{scope}</pre>}
      <div className="mint-inquiry-actions">
        {isReceptionist ? (
          <a className="button" href="/discovery">
            Request pricing
          </a>
        ) : (
          scope && (
            <a className="button" href={mailto}>
              Email this summary
            </a>
          )
        )}
        {scope && (
          <button
            type="button"
            className="button outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(scope);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            Copy summary
          </button>
        )}
      </div>
      <p className="mint-inquiry-note" role="status">
        {isReceptionist ? (
          <>
            The brief takes about ten minutes; choose “AI receptionist” as the system you need and tell us about your calls. Prefer email?{" "}
            <a className="text-link" href={mailto}>
              Write to info.sitemint@gmail.com <MintArrow size={12} />
            </a>
          </>
        ) : copied ? (
          "Copied. Paste this into your discovery brief."
        ) : (
          `Email opens your mail app. Review and send it there.${scope ? " You can also select and copy the summary above." : ""}`
        )}
      </p>
    </aside>
  );
}
