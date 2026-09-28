import { useState } from "react";
import { FlaskConical, RotateCcw, CheckCircle2 } from "lucide-react";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";

/** Local scenario preview: deliberately has no API, speech or provider dependency. */
export function AssistantSimulation({ draft }: { draft: AssistantDraft }) {
  const [scenario, setScenario] = useState<"greeting" | "booking" | "handoff">("greeting");
  const [running, setRunning] = useState(false);
  const name = draft.setup.businessName.trim() || "your business";
  const answers = {
    greeting: draft.prompt.firstMessage.trim() || `Thanks for calling ${name}. How can I help?`,
    booking: draft.prompt.appointmentRules.trim() || "I can take your preferred time and contact details. Availability must be checked before confirming an appointment.",
    handoff: draft.prompt.escalationRules.trim() || "I can take a message for the team. A live transfer needs an available, configured destination.",
  };
  const questions = { greeting: "Hello, can you tell me how you can help?", booking: "I'd like to book an appointment.", handoff: "Can I speak to someone on your team?" };
  return <div className="cl-assistant-side"><aside className="mc-simulation">
    <div className="mc-panel-heading"><FlaskConical size={20} aria-hidden="true"/><h2>Try a simulated conversation</h2></div>
    <span className="mc-simulation-label">Simulation · no real call or booking</span>
    <p>Preview your greeting and handling instructions. This scripted walkthrough does not predict a live AI response.</p>
    <label htmlFor="simulation-scenario">Choose a scenario</label>
    <select id="simulation-scenario" value={scenario} onChange={e => {setScenario(e.target.value as typeof scenario); setRunning(false);}}>
      <option value="greeting">Greeting</option><option value="booking">Appointment request</option><option value="handoff">Speak to the team</option>
    </select>
    {running ? <div className="mc-simulation-history" aria-live="polite"><div><small>Example caller</small><p>{questions[scenario]}</p></div><div><small>{scenario === "greeting" ? "Your draft greeting" : "Your handling instructions"}</small><p>{answers[scenario]}</p></div><p className="mc-simulation-label">Preview complete. Nothing was sent or booked.</p></div> : <div className="mc-simulation-empty">Your draft, brought into context.<br/>Choose a scenario to begin.</div>}
    <button className="mc-primary" onClick={() => setRunning(!running)} type="button">{running ? <><RotateCcw size={16}/>Reset preview</> : "Run simulation"}</button>
    </aside><aside className="cl-card cl-draft-checklist"><h3>Draft checklist</h3>
    <ul className="mc-checklist">{[["Business name", !!draft.setup.businessName.trim()], ["Greeting", !!draft.prompt.firstMessage.trim()], ["Call handling", !!draft.prompt.escalationRules.trim()]].map(([label, done]) => <li key={String(label)}><CheckCircle2 size={16} aria-hidden="true" data-done={done}/><span>{label}</span><small>{done ? "Added" : "To do"}</small></li>)}</ul>
    <p className="mc-simulation-label">Live service requires a subscription and activation checks.</p>
  </aside></div>;
}
