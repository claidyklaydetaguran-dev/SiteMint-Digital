import { teamV5 } from "@/components/v5/teamV5";
import { portfolioProjects } from "@/components/platform-preview/portfolioProjects";
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
 const projects = portfolioProjects.filter(p => p.id === "simply-save-solar" || p.projectName.toLowerCase().includes("onefil"));
 return <>
  <section className="section wrap"><div className="section-heading"><h2>Built around real businesses.</h2><p>A closer look at two projects, from the first impression to a clear next step.</p></div><div className="mint-featured-projects">{projects.map(p => <a key={p.id} href="/work" className="mint-featured-project"><img src={p.desktopAsset?.src} alt={p.desktopAsset?.alt ?? p.projectName} loading="lazy"/><div><small>{p.category}</small><h3>{p.projectName}</h3><p>{p.summary}</p><span>Explore the project</span></div></a>)}</div></section>
  <section className="mint-studio-section section"><div className="wrap"><div className="section-heading"><h2>A studio you can work with directly.</h2><p>Strategy, engineering and project care. Meet the three people bringing your project together.</p></div><div className="mint-team-grid">{teamV5.map(m => <article key={m.name}><img src={m.photo} alt={m.name} style={{objectPosition:m.portraitPosition}} loading="lazy"/><h3>{m.name}</h3><strong>{m.role}</strong><p>{m.summary}</p><a className="more" href="/about">Meet {m.name.split(" ")[0]}</a></article>)}</div></div></section>
 </>;
}
