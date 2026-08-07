/**
 * Frontend V2 Phase 3 — section 11, frequently asked questions.
 *
 * Built on native `<details>/<summary>`, so every answer is reachable and
 * openable with **no JavaScript at all** — no intersection observer, no state,
 * nothing hidden behind a hydration boundary. Keyboard and screen-reader
 * behaviour come from the platform.
 *
 * The questions are the ones CONTENT-SPECIFICATION.md §3 row 11 names: timeline,
 * cost basis, ownership, life after launch, keeping existing tools, and what
 * SiteMint needs from the owner — plus the readiness question the product
 * honesty rule requires.
 *
 * **No answer states a delivery timeline, a price, a response time, a customer
 * count, or a business result.** Where the honest answer is "it depends on
 * scope", that is what it says.
 */

const faqs: Array<{ q: string; a: string }> = [
  {
    q: "How does a project start?",
    a: "It starts with Discovery. You tell us about the business, what you are trying to fix, and where things are getting lost today. That conversation is what a scope gets built from — we do not quote work we have not understood yet.",
  },
  {
    q: "How long does a project take?",
    a: "It depends entirely on scope, and we will not put a number on it before we know yours. The Discover and Architect phases exist to answer exactly that question, and you get the timeline as part of the plan rather than as a sales promise.",
  },
  {
    q: "How is cost determined?",
    a: "Cost follows the scope agreed in Architect — what is being built, what it connects to, and what is deliberately out of scope. We do not publish package prices, because a number without a scope behind it is not a real price.",
  },
  {
    q: "Who owns what you build?",
    a: "Your business does. The site, the application, the content, and the data are yours. You are not renting your own system from us.",
  },
  {
    q: "Can we keep the tools we already use?",
    a: "Often, yes. Part of Discover is looking at what you already run and deciding honestly what is worth keeping, what is worth connecting, and what is quietly costing you more than it saves.",
  },
  {
    q: "What happens after launch?",
    a: "Launch is not the end of the work. The Improve phase is about reviewing how the system is actually performing once real customers are using it, refining it, and flagging real opportunities as the business changes.",
  },
  {
    q: "What do you need from us?",
    a: "Time from whoever makes decisions, access to the systems we are connecting, and the real details about how the business runs. The more accurate that picture is, the better the system fits.",
  },
  {
    q: "Is the AI Receptionist available now?",
    a: "The SMS receptionist is available now. A voice experience is in development and is not answering customer calls. Connected CRM and automated follow-up are planned direction, not shipped features — and they are labelled that way everywhere on this page.",
  },
];

export function FaqSection() {
  return (
    <section className="v2-section" aria-labelledby="faq-heading" id="faq">
      <div className="v2-wrap v2-wrap--narrow">
        <p className="v2-eyebrow">Questions</p>
        <h2 id="faq-heading" className="v2-h2">
          Frequently asked questions
        </h2>

        <div className="v2-faq">
          {faqs.map((item) => (
            <details key={item.q} className="v2-faq__item">
              <summary className="v2-faq__q">{item.q}</summary>
              <p className="v2-faq__a">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
