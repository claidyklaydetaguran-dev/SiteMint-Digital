import {
  CalendarDays,
  Check,
  Globe2,
  Phone,
  MessageSquare,
} from "lucide-react";
import "./mint-depth.css";

/** Illustrative product scene, never connected to customer metrics or actions. */
export function MintDepthScene({
  receptionist = false,
}: {
  receptionist?: boolean;
}) {
  return (
    <figure
      className={`mint-depth ${receptionist ? "mint-depth--voice" : ""}`}
      aria-label="Illustration of a connected website, receptionist and appointment workflow"
    >
      <div className="mint-depth__stage">
        <div className="mint-depth__window">
          <div className="mint-depth__bar">
            <span className="mint-depth__brand">SiteMint</span>
            <span>Business workspace</span>
            <i />
            <i />
            <i />
          </div>
          <div className="mint-depth__body">
            <aside>
              <Globe2 size={20} />
              <Phone size={20} />
              <CalendarDays size={20} />
              <MessageSquare size={20} />
            </aside>
            <div>
              <small>A little more room in your day</small>
              <h3>
                {receptionist
                  ? "Every conversation.\nA clear next step."
                  : "Good things,\nworking together."}
              </h3>
              <div className="mint-depth__schedule">
                <CalendarDays size={22} />
                <div>
                  Discovery consultation
                  <small>Request, review, calendar</small>
                </div>
                <Check size={18} />
              </div>
              <div className="mint-depth__rows">
                <span>
                  Website inquiry <b>Received</b>
                </span>
                <span>
                  Customer details <b>In one place</b>
                </span>
                <span>
                  Next step <b>Follow up</b>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="mint-depth__call">
          <span className="mint-depth__phone">
            <Phone size={22} />
          </span>
          <div>
            A helpful first conversation
            <small>“How can I help your business?”</small>
          </div>
          <div className="mint-depth__wave" aria-hidden="true">
            ▂ ▅ ▃ ▇ ▄ ▂
          </div>
        </div>
        <div className="mint-depth__note">
          <Check size={18} />
          <span>
            One clear next step.<small>More time for your work.</small>
          </span>
        </div>
      </div>
      <figcaption>
        Product illustration · Scroll to see the pieces come together
      </figcaption>
    </figure>
  );
}

export function MintReceptionistGuide() {
  return (
    <section
      className="section wrap mint-owner-guide"
      aria-labelledby="owner-guide-title"
    >
      <div className="section-heading">
        <div>
          <span className="tag">Built around your working day</span>
          <h2 id="owner-guide-title">
            Your receptionist handles the first hello.
            <br />
            You stay in control.
          </h2>
        </div>
        <p>
          One workspace for your calls, appointment requests and follow-up. We
          help connect the pieces before your number goes live.
        </p>
      </div>
      <div className="mint-owner-guide__grid">
        {[
          [
            Phone,
            "Before a call",
            "Your business, in its own words",
            "Set your services, opening hours and answers to common questions. Choose when your team should take over.",
          ],
          [
            CalendarDays,
            "During a call",
            "A useful conversation",
            "The assistant gathers the details and checks your connected calendar. A request stays a request until booking succeeds.",
          ],
          [
            MessageSquare,
            "After a call",
            "A clear place to follow up",
            "Review the conversation, appointment and next action in your workspace. Notification channels are enabled and tested during setup.",
          ],
        ].map(([Icon, label, title, copy]) => {
          const Glyph = Icon as typeof Phone;
          return (
            <article key={String(label)}>
              <Glyph size={28} strokeWidth={1.5} />
              <small>{String(label)}</small>
              <h3>{String(title)}</h3>
              <p>{String(copy)}</p>
            </article>
          );
        })}
      </div>
      <div className="mint-owner-guide__help">
        <div>
          <h3>You don’t need to configure everything alone.</h3>
          <p>
            Create your business account. Connect your own calendar. We help
            prepare your assistant, test the handoffs and agree on activation.
          </p>
        </div>
        <a className="button" href="/start?service=ai-receptionist">
          Plan my receptionist
        </a>
      </div>
      <details className="mint-owner-guide__faq">
        <summary>
          Does every customer get their own account and calendar?
        </summary>
        <p>
          Yes. Your receptionist workspace belongs to your business. You connect
          the Google account whose calendar you want to use. SiteMint’s staff
          CRM and agency project portal are separate. Calendar access for new
          customers is arranged during setup.
        </p>
      </details>
      <details className="mint-owner-guide__faq">
        <summary>What should be ready before I send callers to it?</summary>
        <p>
          Your business information, calendar rules, phone routing, fallback
          contact and notifications must be checked together. SMS and
          subscription billing require separate activation; creating an account
          does not activate them.
        </p>
      </details>
    </section>
  );
}
