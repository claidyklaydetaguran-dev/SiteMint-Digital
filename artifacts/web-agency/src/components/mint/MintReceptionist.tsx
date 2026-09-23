import { MintCinemaHero } from "./MintCinemaHero";
import { MintReceptionistGuide } from "./MintDepthScene";
import { MintPageStory } from "./MintStories";
import { useState } from "react";
import { PublicShell } from "@/shells/PublicShell";
import { usePageMeta } from "@/hooks/usePageMeta";
function ScenarioContent({ selected }: { selected: string }) {
  switch (selected) {
    case "booking":
      return (
        <div
          className="scenario"
          role="tabpanel"
          id="scenario"
          aria-labelledby="tab-booking"
        >
          <div className="conversation">
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"I’d like to book a consultation on Tuesday morning."}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {"There’s an opening at 10 AM. May I take your name?"}
            </div>
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"Jordan Lee. Ten works for me."}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {"Your consultation is confirmed for Tuesday at 10 AM."}
            </div>
          </div>
          <div className="outcome">
            <span className="tag">{"What the business sees"}</span>
            <h3>{"An appointment, clearly confirmed."}</h3>
            <p>
              {
                "The time is confirmed only after the calendar booking succeeds."
              }
            </p>
            <div className="record">
              <div>
                {"Consultation"}
                <small>{"Jordan Lee · Tuesday, 10 AM"}</small>
              </div>
              <span className="status ">{"Confirmed"}</span>
            </div>
            <div className="record">
              <div>
                {"Calendar"}
                <small>{"The business’s connected calendar"}</small>
              </div>
              <span className="status ">{"Saved"}</span>
            </div>
            <p className="fine">
              {
                "If the calendar is unavailable or the slot cannot be booked, the assistant saves a request instead."
              }
            </p>
          </div>
        </div>
      );
    case "transfer":
      return (
        <div
          className="scenario"
          role="tabpanel"
          id="scenario"
          aria-labelledby="tab-transfer"
        >
          <div className="conversation">
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"Could I speak to someone about an existing job?"}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {"I can try to connect you with the team."}
            </div>
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"Thank you."}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {
                "They’re unavailable right now. Would you like to leave a message for a callback?"
              }
            </div>
          </div>
          <div className="outcome">
            <span className="tag">{"What the business sees"}</span>
            <h3>{"A sensible fallback."}</h3>
            <p>
              {
                "Try the approved transfer destination. If nobody answers, offer a message or callback."
              }
            </p>
            <div className="record">
              <div>
                {"Transfer attempt"}
                <small>{"Approved business contact"}</small>
              </div>
              <span className="status pending">{"Unavailable"}</span>
            </div>
            <div className="record">
              <div>
                {"Next step"}
                <small>{"Caller chooses whether to leave a message"}</small>
              </div>
              <span className="status pending">{"Callback offered"}</span>
            </div>
            <p className="fine">
              {
                "A transfer attempt is never shown as a successful conversation."
              }
            </p>
          </div>
        </div>
      );
    case "message":
      return (
        <div
          className="scenario"
          role="tabpanel"
          id="scenario"
          aria-labelledby="tab-message"
        >
          <div className="conversation">
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"Could someone call me about a quote?"}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {"Of course. What name and number should the team use?"}
            </div>
            <div className="bubble caller">
              <small>{"Caller"}</small>
              {"Jordan Lee. I’ll give you my number."}
            </div>
            <div className="bubble ">
              <small>{"Receptionist"}</small>
              {"Thank you. I’ll pass your message to the team."}
            </div>
          </div>
          <div className="outcome">
            <span className="tag">{"What the business sees"}</span>
            <h3>{"A message your team can act on."}</h3>
            <p>
              {
                "Keep the caller’s details and request together, with a clear follow-up status."
              }
            </p>
            <div className="record">
              <div>
                {"Message"}
                <small>{"Question about a quote"}</small>
              </div>
              <span className="status ">{"Saved"}</span>
            </div>
            <div className="record">
              <div>
                {"Follow-up"}
                <small>{"Assigned to the business team"}</small>
              </div>
              <span className="status pending">{"Open"}</span>
            </div>
            <p className="fine">
              {
                "Caller email or SMS copies require appropriate consent and a valid destination."
              }
            </p>
          </div>
        </div>
      );
    default:
      return null;
  }
}
export function MintReceptionist() {
  const [selected, setSelected] = useState("booking");
  usePageMeta({
    title: "AI Receptionist | SiteMint Digital",
    description:
      "Explore SiteMint’s assisted AI receptionist pilot for service businesses.",
  });
  return (
    <PublicShell chrome="v4" headerMode="product" routeLabel="AI Receptionist">
      <MintCinemaHero receptionist />
      <MintReceptionistGuide />
      <MintPageStory kind="receptionist" />
      <div className="benefit-strip wrap">
        <div>
          <span>{"☎"}</span>
          {"A helpful first response"}
        </div>
        <div>
          <span>{"▦"}</span>
          {"Appointments with clarity"}
        </div>
        <div>
          <span>{"↗"}</span>
          {"Transfers to your team"}
        </div>
        <div>
          <span>{"☷"}</span>
          {"Messages worth following up"}
        </div>
      </div>
      <section className="section wrap" id="example">
        <div className="section-heading">
          <h2>
            {"What happens"}
            <br />
            {"after hello?"}
          </h2>
          <p>
            {
              "Explore three example conversations. These are written demonstrations, not live calls."
            }
            <br /><a className="text-link" href="/ai-receptionist/demo">Try the guided voice demo</a>
          </p>
        </div>
        <div
          className="scenario-tabs"
          role="tablist"
          aria-label="Sample call type"
          onKeyDown={(event) => {
            const keys = ["booking", "transfer", "message"];
            const index = keys.indexOf(selected);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % 3
                : event.key === "ArrowLeft"
                  ? (index + 2) % 3
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            setSelected(keys[next]);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>("[role=tab]")
              [next]?.focus();
          }}
        >
          <button
            role="tab"
            id="tab-booking"
            aria-controls="scenario"
            aria-selected={selected === "booking"}
            tabIndex={selected === "booking" ? 0 : -1}
            onClick={() => setSelected("booking")}
          >
            {"Book an appointment"}
          </button>
          <button
            role="tab"
            id="tab-transfer"
            aria-controls="scenario"
            aria-selected={selected === "transfer"}
            tabIndex={selected === "transfer" ? 0 : -1}
            onClick={() => setSelected("transfer")}
          >
            {"Reach the team"}
          </button>
          <button
            role="tab"
            id="tab-message"
            aria-controls="scenario"
            aria-selected={selected === "message"}
            tabIndex={selected === "message" ? 0 : -1}
            onClick={() => setSelected("message")}
          >
            {"Leave a message"}
          </button>
        </div>
        <ScenarioContent selected={selected} />
      </section>
      <section className="wrap">
        <div className="section-heading">
          <h2>
            {"Your day,"}
            <br />
            {"at a glance."}
          </h2>
          <p>
            {
              "Review calls, appointments and messages without digging through technical settings."
            }
          </p>
        </div>
        <div className="dashboard">
          <aside>
            <strong>{"SiteMint"}</strong>
            <div className="selected">{"Overview"}</div>
            <div>{"Calls & messages"}</div>
            <div>{"Appointments"}</div>
            <div>{"Assistant"}</div>
            <div>{"Billing"}</div>
            <div>{"Settings"}</div>
          </aside>
          <article>
            <small>{"Cedar Services · Fictional sample account"}</small>
            <h3>{"Good morning, Alex."}</h3>
            <div className="stats">
              <div>
                {"Calls today"}
                <b>{"8"}</b>
              </div>
              <div>
                {"Appointments"}
                <b>{"3"}</b>
              </div>
              <div>
                {"Needs follow-up"}
                <b>{"2"}</b>
              </div>
            </div>
            <div className="record">
              <div>
                {"Consultation with Jordan"}
                <small>{"Tuesday · 10 AM · Business timezone"}</small>
              </div>
              <span className="status">{"Confirmed"}</span>
            </div>
            <div className="record">
              <div>
                {"Taylor requested a callback"}
                <small>{"Question about a service"}</small>
              </div>
              <span className="status pending">{"Needs follow-up"}</span>
            </div>
          </article>
        </div>
        <div className="calendar-note">
          <div className="calendar-icon">{"▦"}</div>
          <p>
            <strong>{"Your business. Your calendar."}</strong>
            <br />
            {
              "You connect your own Google account and choose the calendar. SiteMint guides the setup; your customers book with your business."
            }
          </p>
        </div>
      </section>
      <section className="section wrap" id="setup">
        <div className="section-heading">
          <h2>
            {"We’ll set it up"}
            <br />
            {"with you."}
          </h2>
          <p>
            {
              "You know your business. We help turn that knowledge into a useful receptionist."
            }
          </p>
        </div>
        <div className="steps">
          <div className="step">
            <span>{"Step 1"}</span>
            <h3>{"Tell us about your business"}</h3>
            <p>
              {
                "Share services, hours, booking rules and who callers should reach."
              }
            </p>
          </div>
          <div className="step">
            <span>{"Step 2"}</span>
            <h3>{"Connect and review"}</h3>
            <p>
              {
                "Connect your calendar, choose call handling and review example outcomes with us."
              }
            </p>
          </div>
          <div className="step">
            <span>{"Step 3"}</span>
            <h3>{"Test before going live"}</h3>
            <p>
              {
                "Check the assistant together. Confirm the scope, subscription and usage terms before activation."
              }
            </p>
          </div>
        </div>
      </section>
      <section className="section wrap" style={{ paddingTop: "0" }}>
        <div className="faq">
          <h2>{"A few things you might be wondering."}</h2>
          <details>
            <summary>{"Can it book into my Google Calendar?"}</summary>
            <p>
              {
                "That is the planned booking workflow. You authorize your own calendar. Appointments are confirmed only when availability and the calendar write succeed; otherwise they remain requests."
              }
            </p>
          </details>
          <details>
            <summary>{"What if my team cannot take a transfer?"}</summary>
            <p>
              {
                "We recommend offering a message or callback. The business sees the actual outcome rather than a misleading “transfer completed” status."
              }
            </p>
          </details>
          <details>
            <summary>{"Will callers get an email or text?"}</summary>
            <p>
              {
                "Caller copies depend on consent, valid contact information and the enabled channels. Email and SMS availability must be verified for the pilot before being promised."
              }
            </p>
          </details>
          <details>
            <summary>{"How does pricing work?"}</summary>
            <p>
              {
                "The pilot uses request pricing. The proposal will explain the subscription, included usage, any overage charges and setup scope before you agree."
              }
            </p>
          </details>
          <details>
            <summary>{"Can I try it before committing?"}</summary>
            <p>
              {
                "We’ll walk you through an assisted demonstration and test your setup together before launch. The examples above illustrate the intended experience."
              }
            </p>
          </details>
        </div>
      </section>
      <section className="cta wrap">
        <h2>{"A better first hello starts here."}</h2>
        <p>
          {"Let’s talk about your calls, your team and the setup you need."}
        </p>
        <div className="actions">
          <a className="button " href="/start?service=ai-receptionist">
            {"Request pilot pricing"}
          </a>
          <a className="button outline" href="/ai-receptionist/signup">
            {"Create an account"}
          </a>
        </div>
      </section>
    </PublicShell>
  );
}
