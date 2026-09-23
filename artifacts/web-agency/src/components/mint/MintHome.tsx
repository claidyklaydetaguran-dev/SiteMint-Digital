import { MintCinemaHero } from "./MintCinemaHero";
import { MintDemonstration } from "./MintDemonstration";
import { MintStudioChapters } from "./MintProductVisual";
import { MintServiceFinder, MintLaunchJourney } from "./MintStories";
import { usePageMeta } from "@/hooks/usePageMeta";
import understandingPhoto from "@/assets/mint/understanding.webp";
import websitePhoto from "@/assets/mint/website-review.webp";
export function MintHome() {
  usePageMeta({
    title: "SiteMint Digital | Websites, AI Receptionists & Business Systems",
    description:
      "Websites, AI receptionists and practical systems, thoughtfully connected and set up with you.",
  });
  return (
    <>
      <MintCinemaHero />
      <MintDemonstration />
      <section className="section wrap" id="services">
        <div className="section-heading">
          <h2>
            {"A little less juggling."}
            <br />
            {"A lot more connected."}
          </h2>
          <p>
            {
              "Start with what you need today. We’ll help you make the pieces work together."
            }
          </p>
        </div>
        <div className="service-grid">
          <article className="service">
            <div className="service-visual">
              <div className="mini-site">
                <header>{"Oak Studio   /   About   Work"}</header>
                <div className="picture"></div>
                <div className="mini-text">
                  {"A place for your"}
                  <br />
                  {"business to grow."}
                  <small>{"Illustrative website concept"}</small>
                </div>
              </div>
            </div>
            <h3>{"Websites & web apps"}</h3>
            <p>
              {
                "Show what you do clearly and make it easy for the right customers to get in touch."
              }
            </p>
            <a className="more" href="/websites-apps">
              {"Explore websites"}
            </a>
          </article>
          <article className="service">
            <div className="service-visual">
              <div className="mini-call">
                <div className="phone-icon">{"☎"}</div>
                <strong>{"A helpful first hello."}</strong>
                <div className="wave" aria-hidden="true">
                  <i style={{ height: "10px" }}></i>
                  <i style={{ height: "19px" }}></i>
                  <i style={{ height: "31px" }}></i>
                  <i style={{ height: "20px" }}></i>
                  <i style={{ height: "40px" }}></i>
                  <i style={{ height: "27px" }}></i>
                  <i style={{ height: "45px" }}></i>
                  <i style={{ height: "33px" }}></i>
                  <i style={{ height: "20px" }}></i>
                  <i style={{ height: "38px" }}></i>
                  <i style={{ height: "26px" }}></i>
                  <i style={{ height: "15px" }}></i>
                  <i style={{ height: "23px" }}></i>
                  <i style={{ height: "10px" }}></i>
                </div>
                <small>{"AI receptionist · Concept preview"}</small>
              </div>
            </div>
            <h3>{"AI receptionist"}</h3>
            <p>
              {
                "Give callers a useful next step: an appointment, a conversation or a message for your team."
              }
            </p>
            <a className="more" href="/ai-receptionist">
              {"Meet your receptionist"}
            </a>
          </article>
          <article className="service">
            <div className="service-visual">
              <div className="mini-workflow">
                <div>
                  <span>{"✓"}</span>
                  {" New inquiry received"}
                </div>
                <div>
                  <span>{"↳"}</span>
                  {" Follow-up assigned"}
                </div>
                <div>
                  <span>{"◷"}</span>
                  {" Next step organized"}
                </div>
              </div>
            </div>
            <h3>{"Business systems"}</h3>
            <p>
              {
                "Bring inquiries, tasks and follow-ups into a workflow that makes sense to your team."
              }
            </p>
            <a className="more" href="/ai-systems">
              {"Explore business systems"}
            </a>
          </article>
        </div>
      </section>
      <MintServiceFinder />
      <section className="section wrap story-chapter" aria-labelledby="website-story-title">
        <figure className="story-image">
          <img src={websitePhoto} alt="Illustration of a business owner and designer reviewing a website on desktop and mobile" width="1536" height="1024" loading="lazy" decoding="async" />
          <figcaption>Illustrative design review · Your business shapes the direction.</figcaption>
        </figure>
        <div className="story-copy">
          <span className="tag">From first impression to first conversation</span>
          <h2 id="website-story-title">Make it easy to see why you’re the right choice.</h2>
          <p>A useful website answers the questions your next customer already has: what you do, who you help, and how to get started.</p>
          <ol className="story-checkpoints">
            <li><span>01</span><div><strong>Show the work</strong><p>Services, genuine examples and a clear sense of your business.</p></div></li>
            <li><span>02</span><div><strong>Make the next step obvious</strong><p>A focused inquiry journey, designed for phones as well as desktops.</p></div></li>
            <li><span>03</span><div><strong>Give every inquiry a place</strong><p>Agree where new requests go and who follows up before launch.</p></div></li>
          </ol>
          <a className="more" href="/websites-apps">Explore our website service</a>
        </div>
      </section>
      <section className="wrap">
        <div className="feature">
          <div>
            <span className="tag">{"Meet the SiteMint receptionist"}</span>
            <h2>
              {"A helpful voice."}
              <br />
              {"A clear next step."}
            </h2>
            <p>
              {
                "Your business has its own hours, services and way of doing things. Your receptionist should understand them."
              }
            </p>
            <a className="button" href="/ai-receptionist">
              {"See how it works"}
            </a>
          </div>
          <div className="demo-card">
            <p className="fine" style={{ margin: "0 0 15px" }}>
              {"Illustrative call outcome"}
            </p>
            <h3>{"“Could I book a consultation?”"}</h3>
            <div className="record">
              <div>
                {"Appointment confirmed"}
                <small>{"Saved to the business calendar"}</small>
              </div>
              <span className="status">{"Confirmed"}</span>
            </div>
            <div className="record">
              <div>
                {"Business summary"}
                <small>{"The team can review the outcome"}</small>
              </div>
              <span className="status">{"Saved"}</span>
            </div>
            <p className="fine">
              {
                "If a booking cannot be confirmed, it stays a clearly labeled request."
              }
            </p>
          </div>
        </div>
      </section>
      <section className="section wrap" id="approach">
        <div className="section-heading">
          <h2>
            {"Good work starts"}
            <br />
            {"with understanding."}
          </h2>
          <p>
            {
              "A straightforward process, with room for your feedback before we move forward."
            }
          </p>
        </div>
        <figure className="understanding-image story-image">
          <img src={understandingPhoto} alt="Illustration of a business owner and designer discussing goals with paper wireframes at a table" width="1536" height="1024" loading="lazy" decoding="async" />
          <figcaption>Illustrative planning session · Listen first. Build with purpose.</figcaption>
        </figure>
        <div className="steps">
          <div className="step">
            <span>{"Step 1"}</span>
            <h3>{"Tell us what you need"}</h3>
            <p>
              {
                "We listen to how your business works and agree on a useful scope."
              }
            </p>
          </div>
          <div className="step">
            <span>{"Step 2"}</span>
            <h3>{"See the direction"}</h3>
            <p>
              {
                "Review the design and customer experience before we build out the details."
              }
            </p>
          </div>
          <div className="step">
            <span>{"Step 3"}</span>
            <h3>{"Launch with clarity"}</h3>
            <p>
              {
                "We check the real journey and explain how to use what we’ve built."
              }
            </p>
          </div>
        </div>
      </section>
      <MintLaunchJourney />
      <MintStudioChapters />
      <section className="section wrap" style={{ paddingTop: "10px" }}>
        <div className="faq">
          <h2>{"A few things you might be wondering."}</h2>
          <details>
            <summary>{"Do I need all three services?"}</summary>
            <p>
              {
                "No. Start with a website, the receptionist or a specific workflow. We’ll recommend a scope that fits the problem you want to solve."
              }
            </p>
          </details>
          <details>
            <summary>{"Can you work with what I already have?"}</summary>
            <p>
              {
                "We first review your existing website and tools. The proposal will explain what can be reused and what needs to change."
              }
            </p>
          </details>
          <details>
            <summary>{"How much does a project cost?"}</summary>
            <p>
              {
                "We quote after understanding scope, integrations and support needs. Receptionist pilot pricing is available on request; no plan amounts have been finalized."
              }
            </p>
          </details>
          <details>
            <summary>{"Will I have to manage technical setup?"}</summary>
            <p>
              {
                "We plan the setup with you. You provide business details and approve access to your own accounts; we guide the technical work."
              }
            </p>
          </details>
        </div>
      </section>
      <section className="cta wrap">
        <h2>{"Let’s make your next step simpler."}</h2>
        <p>{"Tell us what you’d like to improve. We’ll start there."}</p>
        <a className="button " href="/discovery">
          {"Start a conversation"}
        </a>
      </section>
    </>
  );
}
