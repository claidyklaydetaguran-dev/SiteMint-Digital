/**
 * The template picker.
 *
 * Presentation only: the same `sd-page`/`PageHeader` frame every other
 * dashboard page uses, with the eight starting points as rows of one shared
 * `sd-list`. Selecting one still navigates and creates nothing — no request is
 * issued from this page at all.
 */

import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ASSISTANT_TEMPLATES, type AssistantTemplate } from "@/lib/assistantTemplates";
import { TemplateCard } from "@/components/common/TemplateCard";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CREATE,
  LIST_PATH,
  NEW_PATH,
  DEFAULT_BUILDER_TAB,
} from "@/pages/assistants/assistantsContract";
import "@/styles/v2-dashboard.css";

export default function AssistantCreate() {
  const [, navigate] = useLocation();

  const handleSelect = (template: AssistantTemplate) => {
    // Local-only: no API call, no persisted row. The assistant is created
    // only when Save changes is activated in the builder.
    navigate(`${NEW_PATH}/${DEFAULT_BUILDER_TAB}?templateKey=${encodeURIComponent(template.id)}`);
  };

  return (
    <div className="sd-page sd-enter">
      <PageHeader
        eyebrow={CREATE.eyebrow}
        title={CREATE.title}
        description={CREATE.detail}
        breadcrumb={
          <Link href={LIST_PATH} className="sd-link">
            <ArrowLeft className="sd-navlink__icon" aria-hidden="true" />
            {CREATE.back}
          </Link>
        }
      />

      <ul className="sd-list">
        {ASSISTANT_TEMPLATES.map((template) => (
          <TemplateCard key={template.id} template={template} onSelect={handleSelect} />
        ))}
      </ul>
    </div>
  );
}
