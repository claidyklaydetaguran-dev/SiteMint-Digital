import { useSearch } from "wouter";
import { useState } from "react";

export const SCOPE_DRAFT_KEY = "sitemint:pricing-scope";

/** An optional local summary, never a submitted inquiry or a server draft. */
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
  const subject = isReceptionist
    ? "AI receptionist pilot pricing"
    : "My SiteMint project scope";
  const body = isReceptionist
    ? "Hi SiteMint, I'd like to discuss the assisted AI receptionist pilot.\n\nBusiness name:\nBusiness type:\nApproximate monthly calls:\nWhat I need help with:\n"
    : `Hi SiteMint, I'd like to discuss this starting scope:\n\n${scope}`;
  return (
    <aside
      id="pilot-pricing"
      className="mint-inquiry"
      aria-labelledby="inquiry-title"
    >
      <span className="v3-eyebrow">
        {isReceptionist ? "Assisted receptionist pilot" : "Your starting point"}
      </span>
      <h2 id="inquiry-title">
        {isReceptionist
          ? "Let's find the right fit for your calls."
          : "Your project summary is here."}
      </h2>
      <p>
        {isReceptionist
          ? "Tell us about your business, call volume and the help you need. We'll discuss setup, subscription and usage pricing with you before you decide."
          : scope
            ? "Review your summary below. You can email it to us, or copy it into the discovery brief. Nothing has been submitted yet."
            : "This summary was saved in another browser tab or is no longer available. Return to pricing to recreate it, or contact us directly."}
      </p>
      {scope && <pre>{scope}</pre>}
      <div className="mint-inquiry-actions">
        {(scope || isReceptionist) && (
          <a
            className="button"
            href={`mailto:info.sitemint@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
          >
            {isReceptionist
              ? "Email us for pilot pricing"
              : "Email this summary"}
          </a>
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
        {copied
          ? "Copied. Paste this into your discovery brief."
          : `Email opens your mail app. Review and send it there.${scope ? " You can also select and copy the summary above." : ""}`}
      </p>
    </aside>
  );
}
