/**
 * Visible-progress checkpoint: sample data for the Call Logs demo screens.
 *
 * Inbound phone calls, transcript ingestion, lead extraction, and
 * appointment booking are not implemented in the backend yet (see
 * docs/roadmap/ACTIVE.md — explicitly out of scope for the current
 * milestone). This fixture set exists only so a customer/reviewer can see
 * what those screens will look like once that backend work lands. Nothing
 * here reads from or writes to any API, database, or provider — nothing is
 * a real call.
 */

export type DemoCallOutcome =
  | "appointment_requested"
  | "message_taken"
  | "missed_no_answer"
  | "spam_declined";

export interface DemoTranscriptLine {
  speaker: "assistant" | "caller";
  text: string;
}

export interface DemoCall {
  id: string;
  callerName: string;
  callerPhone: string;
  assistantName: string;
  startedAt: string;
  durationSec: number;
  outcome: DemoCallOutcome;
  transcript: DemoTranscriptLine[];
  extracted: {
    name: string;
    phone: string;
    reason: string;
  };
  appointment?: {
    service: string;
    requestedTime: string;
  };
}

export const DEMO_CALLS: DemoCall[] = [
  {
    id: "demo-1",
    callerName: "Jordan Reyes",
    callerPhone: "(555) 010-2231",
    assistantName: "Riverside Dental Receptionist",
    startedAt: "2026-07-28T14:12:00-07:00",
    durationSec: 96,
    outcome: "appointment_requested",
    transcript: [
      { speaker: "assistant", text: "Thanks for calling Riverside Dental, this is Ava. How can I help you today?" },
      { speaker: "caller", text: "Hi, I chipped a tooth and I'd like to get in as soon as possible." },
      { speaker: "assistant", text: "I'm sorry to hear that. I can have someone call you back to find the soonest opening. Can I get your name and a callback number?" },
      { speaker: "caller", text: "Sure, it's Jordan Reyes, (555) 010-2231." },
      { speaker: "assistant", text: "Got it, Jordan. I've noted a chipped tooth as urgent and passed it to the front desk to schedule you in. Anything else?" },
      { speaker: "caller", text: "No, that's it, thank you." },
    ],
    extracted: { name: "Jordan Reyes", phone: "(555) 010-2231", reason: "Chipped tooth, requesting urgent appointment" },
    appointment: { service: "Emergency exam", requestedTime: "As soon as possible" },
  },
  {
    id: "demo-2",
    callerName: "Priya Nair",
    callerPhone: "(555) 018-7745",
    assistantName: "Riverside Dental Receptionist",
    startedAt: "2026-07-28T11:03:00-07:00",
    durationSec: 58,
    outcome: "message_taken",
    transcript: [
      { speaker: "assistant", text: "Thanks for calling Riverside Dental, this is Ava. How can I help you today?" },
      { speaker: "caller", text: "I just wanted to ask about your hours on Saturdays." },
      { speaker: "assistant", text: "We're open Saturdays from 9am to 1pm. Is there anything else I can help with?" },
      { speaker: "caller", text: "No, that answers it, thanks." },
    ],
    extracted: { name: "Priya Nair", phone: "(555) 018-7745", reason: "Asked about Saturday business hours" },
  },
  {
    id: "demo-3",
    callerName: "Unknown caller",
    callerPhone: "(555) 099-0012",
    assistantName: "Riverside Dental Receptionist",
    startedAt: "2026-07-27T19:41:00-07:00",
    durationSec: 12,
    outcome: "missed_no_answer",
    transcript: [
      { speaker: "assistant", text: "Thanks for calling Riverside Dental, this is Ava. How can I help you today?" },
    ],
    extracted: { name: "Unknown", phone: "(555) 099-0012", reason: "Call disconnected before caller responded" },
  },
  {
    id: "demo-4",
    callerName: "Blocked spam caller",
    callerPhone: "(555) 077-4400",
    assistantName: "Riverside Dental Receptionist",
    startedAt: "2026-07-27T09:15:00-07:00",
    durationSec: 21,
    outcome: "spam_declined",
    transcript: [
      { speaker: "assistant", text: "Thanks for calling Riverside Dental, this is Ava. How can I help you today?" },
      { speaker: "caller", text: "This is an important message about your business's warranty..." },
      { speaker: "assistant", text: "This line is for patient calls only. I'll end the call here." },
    ],
    extracted: { name: "Unknown", phone: "(555) 077-4400", reason: "Automated marketing call, not a patient inquiry" },
  },
];

export function findDemoCall(id: string): DemoCall | undefined {
  return DEMO_CALLS.find((c) => c.id === id);
}

export function formatDemoOutcome(outcome: DemoCallOutcome): string {
  switch (outcome) {
    case "appointment_requested":
      return "Appointment requested";
    case "message_taken":
      return "Message taken";
    case "missed_no_answer":
      return "Missed — no answer";
    case "spam_declined":
      return "Spam declined";
  }
}

export function demoOutcomeTone(outcome: DemoCallOutcome): "success" | "info" | "warning" | "neutral" {
  switch (outcome) {
    case "appointment_requested":
      return "success";
    case "message_taken":
      return "info";
    case "missed_no_answer":
      return "warning";
    case "spam_declined":
      return "neutral";
  }
}

export function formatDemoDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
