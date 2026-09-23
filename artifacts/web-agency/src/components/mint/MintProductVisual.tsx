import { useState } from "react";
import { Phone, CalendarDays, ClipboardCheck, Check, ArrowRight } from "lucide-react";

const moments = [
  { label: "Answer", icon: Phone, title: "A helpful first hello.", quote: "Thanks for calling. How can I help you today?", detail: "Your business name, services and opening hours shape the conversation.", result: "Understand the caller" },
  { label: "Arrange", icon: CalendarDays, title: "Find the right next step.", quote: "Let me check your preferred time against the calendar.", detail: "Confirm only when the booking succeeds. Otherwise, save a clearly labeled request.", result: "Check availability" },
  { label: "Follow up", icon: ClipboardCheck, title: "Leave the team informed.", quote: "Here’s the caller’s request and what needs your attention.", detail: "Review the outcome in your workspace. Email notifications depend on your configured delivery setup.", result: "Keep the outcome together" },
];

/** An interactive illustration, never a fake live call or customer record. */
export function MintProductVisual() {
  const [selected, setSelected] = useState(0);
  const moment = moments[selected];
  const Icon = moment.icon;
  return <div className="mint-product-visual">
    <div className="product-visual-top"><span className="product-monogram">s</span><strong>Your receptionist</strong><span>Illustration</span></div>
    <div className="product-moments" aria-label="Explore the call journey">{moments.map((item, i) => <button type="button" key={item.label} aria-pressed={i === selected} onClick={() => setSelected(i)}><item.icon size={16} aria-hidden="true"/>{item.label}</button>)}</div>
    <div className="product-moment" aria-live="polite" aria-atomic="true" key={selected}>
      <div className="product-orbit"><Icon size={32} strokeWidth={1.5} aria-hidden="true"/></div>
      <h3>{moment.title}</h3><blockquote>{moment.quote}</blockquote>
      <div className="product-result"><Check size={17} aria-hidden="true"/><strong>{moment.result}</strong><ArrowRight size={17} aria-hidden="true"/></div>
      <p>{moment.detail}</p>
    </div>
    <div className="product-visual-foot">Your business. Your calendar. Your workspace.</div>
  </div>;
}

export function MintStudioChapters() {
  return <>
    <section className="section wrap mint-work-preview" aria-labelledby="work-preview-title"><div className="section-heading"><div><span className="tag">A closer look at the work</span><h2 id="work-preview-title">Considered on the outside.<br/>Connected underneath.</h2></div><p>Explore the experiences we design: a clear first impression, a useful conversation and an organized next step.</p></div>
      <div className="mint-work-pair"><a className="mint-work-window" href="/work"><div className="window-chrome"><span/><span/><span/><small>Website concept</small></div><div className="work-site-preview"><span>Small business, clearly presented</span><h3>Your work deserves<br/>a thoughtful home.</h3><div className="work-preview-lines"><i/><i/><i/></div><span className="work-preview-link">Explore design examples ↗</span></div></a><div><MintProductVisual/><a className="more" href="/ai-receptionist">Explore the receptionist experience</a></div></div>
    </section>
    <section className="mint-studio-section section" aria-labelledby="studio-title"><div className="wrap mint-studio-layout"><div><span className="tag">The people behind the process</span><h2 id="studio-title">A studio you can<br/>work with directly.</h2><p>SiteMint brings business direction and technical delivery together. You share the goal; we explain the options, shape the experience and make progress visible.</p><a href="/about" className="button outline">Get to know SiteMint</a></div><div className="studio-responsibilities"><article><span className="studio-role-symbol" aria-hidden="true">↗</span><div><h3>Business direction</h3><p>Your priorities, a clear scope and a practical conversation about what comes next.</p></div></article><article><span className="studio-role-symbol" aria-hidden="true">⌘</span><div><h3>Claidy Taguran</h3><strong>Technical Director</strong><p>The design, connections and testing that turn an agreed plan into a working experience.</p></div></article><div className="studio-promise">You review the direction before we build out the details.</div></div></div></section>
  </>;
}
