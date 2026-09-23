import { useState } from "react";
import { MintArrow } from "./MintArrow";
import services from "@/assets/mint/services-scene.webp";
import servicesSmall from "@/assets/mint/services-scene-768.webp";
import { MintProductVisual } from "./MintProductVisual";
import work from "@/assets/mint/work-scene.webp";
import workSmall from "@/assets/mint/work-scene-768.webp";
import pricing from "@/assets/mint/pricing-scene.webp";
import pricingSmall from "@/assets/mint/pricing-scene-768.webp";
import about from "@/assets/mint/about-scene.webp";
import aboutSmall from "@/assets/mint/about-scene-768.webp";

// Every scene ships a 768px rendition for narrow screens (launch audit,
// 2026-09-24: Lighthouse measured the 1536px files at 371px wide on phones).
const small: Record<string, string> = { [services]: servicesSmall, [work]: workSmall, [pricing]: pricingSmall, [about]: aboutSmall };
const sceneSrcSet = (image: string) => `${small[image]} 768w, ${image} 1536w`;
/** The story grid is two columns above 760px, so the figure is roughly half the 1260px wrap. */
const sceneSizes = "(max-width: 760px) calc(100vw - 48px), min(640px, 50vw)";

const stories = {
  services: { image: services, eyebrow: "A useful starting point", title: "The right pieces. In the right order.", text: "A new website, a better way to answer callers, or less manual follow-up: start with the problem that matters most. We map the journey with you before recommending the tools.", points: ["Understand your customers and daily work", "Agree what to improve first", "Connect the pieces your business actually needs"], alt: "Illustrative business owner and designer reviewing a wall of website plans" },
  receptionist: { image: services, eyebrow: "Made for the working day", title: "Stay with the job. Give callers a next step.", text: "When your hands are full, a helpful first conversation matters. Together we define what your assistant can answer, when it should transfer, and what needs a callback from your team.", points: ["Your services, hours and service area", "Your calendar and booking rules", "Clear handoffs when a person is needed"], alt: "Illustrative home-service professional working on a cabinet with a phone nearby" },
  work: { image: work, eyebrow: "Picture the possibilities", title: "Good design should make the next step feel natural.", text: "This fictional garden-service concept shows the direction: recognizable work, a clear explanation and a useful inquiry path. The projects below are labeled so you can distinguish working products from concepts.", points: ["A clear service story", "A considered mobile experience", "A visible route to an inquiry"], alt: "Fictional garden-service website concept on a laptop and phone" },
  pricing: { image: pricing, eyebrow: "Choose a scope, not a guessing game", title: "Start with what will make a difference.", text: "Pages, integrations and ongoing support shape the work. We review your starting point, identify the essentials and explain the scope before you commit. AI receptionist pricing is by request.", points: ["Agree the deliverables", "Separate essentials from later ideas", "Understand setup and ongoing costs"], alt: "Illustrative hands arranging paper website plans on an oak table" },
  about: { image: about, eyebrow: "A thoughtful working relationship", title: "Built with you. Clear at every step.", text: "You know your business. Our job is to turn that knowledge into a useful digital experience. Expect a clear recommendation, a design you can review and a practical explanation of how it works.", points: ["Listen before choosing a solution", "Make progress visible", "Leave you with a clear next step"], alt: "Illustrative creative collaboration around website plans; not a photograph of SiteMint staff" },
};

export function MintPageStory({ kind }: { kind: keyof typeof stories }) {
  const story = stories[kind];
  return <section className="section wrap story-chapter mint-page-story">
    {kind === "receptionist" ? <MintProductVisual /> : <figure className="story-image"><img src={story.image} srcSet={sceneSrcSet(story.image)} sizes={sceneSizes} alt={story.alt} width="1536" height="1024" loading="lazy" decoding="async" /><figcaption>{kind === "work" ? "Illustrative website concept" : "Illustrative business scene"}</figcaption></figure>}
    <div className="story-copy"><span className="tag">{story.eyebrow}</span><h2>{story.title}</h2><p>{story.text}</p><ol className="story-checkpoints">{story.points.map((point, i) => <li key={point}><span>0{i + 1}</span><strong>{point}</strong></li>)}</ol></div>
  </section>;
}

const needs = [
  { label: "A better first impression", title: "Help the right customers recognize you.", copy: "A clear website brings your services, examples and contact options together. We shape the story around what customers need to understand before reaching out.", image: work, alt: "Illustrative website displayed on desktop and mobile", href: "/websites-apps", link: "Explore website design", steps: ["Show your services", "Answer common questions", "Make getting in touch easy"] },
  { label: "Help with incoming calls", title: "Turn a ringing phone into a useful conversation.", copy: "We help configure and test your assistant with you before it handles live calls, starting from your real services and rules, then check the booking, message and transfer paths together.", image: services, alt: "Illustrative technician focused on a customer job", href: "/ai-receptionist", link: "Meet the AI receptionist", steps: ["Understand the caller", "Follow your business rules", "Record the next step"] },
  { label: "Less scattered follow-up", title: "Give the next action a clear home.", copy: "When inquiries live in too many places, follow-up becomes harder. We map a practical workflow with clear ownership, useful records and fewer repeated steps.", image: services, alt: "Illustrative business workflow planning session", href: "/ai-systems", link: "Explore connected systems", steps: ["Capture the request", "Assign responsibility", "Track the outcome"] },
];

export function MintServiceFinder() {
  const [selected, setSelected] = useState(0);
  const need = needs[selected];
  return <section className="mint-finder section" aria-labelledby="finder-title"><div className="wrap">
    <div className="section-heading"><div><span className="tag">Start where you are</span><h2 id="finder-title">What would make your day easier?</h2></div><p>You don’t need to figure out the technology first. Choose a challenge to see a sensible starting point.</p></div>
    <div className="finder-options" aria-label="Choose a business challenge">{needs.map((item, i) => <button key={item.label} type="button" aria-pressed={selected === i} aria-controls="finder-result" onClick={() => setSelected(i)}>{item.label}<MintArrow size={15} /></button>)}</div>
    <div className="finder-result story-chapter" id="finder-result">{selected === 1 ? <MintProductVisual /> : <figure className="story-image"><img src={need.image} srcSet={sceneSrcSet(need.image)} sizes={sceneSizes} alt={need.alt} width="1536" height="1024" loading="lazy" decoding="async"/><figcaption>Illustrative scenario</figcaption></figure>}<div className="story-copy" aria-live="polite" aria-atomic="true"><h3>{need.title}</h3><p>{need.copy}</p><ol className="story-checkpoints">{need.steps.map((step, i) => <li key={step}><span>0{i + 1}</span><strong>{step}</strong></li>)}</ol><a href={need.href} className="button">{need.link}</a></div></div>
  </div></section>;
}

export function MintLaunchJourney() {
  return <section className="section wrap mint-launch" aria-labelledby="launch-story-title"><div className="section-heading"><div><span className="tag">Beyond a beautiful homepage</span><h2 id="launch-story-title">A good experience connects the whole journey.</h2></div><p>We plan what happens after someone clicks, calls or asks a question. Open each step to see what we consider.</p></div><div className="launch-layout"><figure className="story-image"><img src={pricing} srcSet={sceneSrcSet(pricing)} sizes={sceneSizes} alt="Illustrative paper plans for a connected customer journey" width="1536" height="1024" loading="lazy" decoding="async"/><figcaption>Plan the experience before adding complexity.</figcaption></figure><div className="launch-steps">
    <details open><summary><span>01</span> Discover your business</summary><p>Visitors need to understand your offer quickly. Clear services, relevant visuals and genuine examples help them decide whether you are a fit.</p></details>
    <details><summary><span>02</span> Take a useful next step</summary><p>A focused inquiry form or a helpful call should ask for the right details and explain what happens next. Mobile users deserve the same care as desktop visitors.</p></details>
    <details><summary><span>03</span> Keep the handoff clear</summary><p>Decide who receives the request, where it is recorded and when to follow up. Bookings must distinguish confirmed appointments from requests awaiting a decision.</p></details>
    <details><summary><span>04</span> Launch, learn and improve</summary><p>Review the real customer journey, explain the tools and agree on ongoing support. Add the next improvement when it solves a real business need.</p></details>
  </div></div></section>;
}
