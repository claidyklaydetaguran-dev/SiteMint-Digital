import { Link } from "wouter";
import { LayoutDashboard, Phone, Inbox, CalendarDays, Bot, Settings, CreditCard } from "lucide-react";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { ROUTES } from "@/lib/routes";

const settings = [
  ["Business", ROUTES.settings], ["Team", ROUTES.team], ["Calendar", ROUTES.calendar],
  ["Phone & transfers", ROUTES.phoneNumber], ["Transfer contacts", ROUTES.transferContacts],
  ["Billing", ROUTES.billing], ["Usage", ROUTES.usage], ["Text settings", ROUTES.sms], ["Support", ROUTES.support], ["Issues", ROUTES.issues],
] as const;
const scheduling = [["Appointments", ROUTES.appointments], ["Availability", ROUTES.availability], ["Services", ROUTES.appointmentTypes], ["Test booking", ROUTES.testBooking]] as const;
const inbox = [["Messages", ROUTES.inquiries], ["Texts", "/activity/texts"], ["Conversations", ROUTES.conversations], ["Contacts & texts", ROUTES.contacts]] as const;
const gated = new Set<string>([ROUTES.phoneNumber, ROUTES.transferContacts, ROUTES.usage, ROUTES.inquiries, ROUTES.issues]);
const match = (path: string, href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));
export function workspaceSection(path: string) {
  if (settings.some(([, href]) => match(path, href))) return "Settings";
  if (scheduling.some(([, href]) => match(path, href))) return "Appointments";
  if (inbox.some(([, href]) => match(path, href))) return "Inbox";
  if (match(path, ROUTES.assistants) || path === ROUTES.setup) return "Assistant";
  if (match(path, ROUTES.calls)) return "Calls";
  return "Overview";
}
export function WorkspaceNavigation({ location, onNavigate }: { location: string; onNavigate: () => void }) {
  const section = workspaceSection(location);
  const items = [
    { label: "Overview", href: ROUTES.overview, icon: LayoutDashboard },
    { label: "Assistant", href: voicePlatformEnabled ? ROUTES.assistants : ROUTES.setup, icon: Bot },
    ...(voicePlatformEnabled ? [{ label: "Calls", href: ROUTES.calls, icon: Phone }] : []),
    { label: "Inbox", href: voicePlatformEnabled ? ROUTES.inquiries : ROUTES.conversations, icon: Inbox },
    { label: "Appointments", href: ROUTES.appointments, icon: CalendarDays },
    { label: "Settings", href: ROUTES.settings, icon: Settings },
  ];
  return <nav className="sd-rail__nav mc-navigation" aria-label="Dashboard"><ul className="sd-rail__list">{items.map(({label,href,icon: Icon}) => <li key={label}><Link href={href} onClick={onNavigate} className="sd-navlink" aria-current={section === label ? "page" : undefined}><Icon className="sd-navlink__icon" aria-hidden="true"/><span>{label}</span></Link></li>)}</ul><Link href={ROUTES.billing} className="mc-plan-link" onClick={onNavigate}><CreditCard size={18} aria-hidden="true"/>Plan and usage</Link></nav>;
}
export function WorkspaceTabs({ location }: { location: string }) {
  const section = workspaceSection(location);
  const items = section === "Settings" ? settings : section === "Appointments" ? scheduling : section === "Inbox" ? inbox : null;
  if (!items) return null;
  return <nav className="mc-section-tabs" aria-label={`${section} pages`}>{items.filter(([, href]) => voicePlatformEnabled || !gated.has(href)).map(([label, href]) => <Link key={href} href={href} aria-current={match(location, href) ? "page" : undefined}>{label}</Link>)}</nav>;
}
export function WorkspaceQuote({ location }: { location: string }) {
  const section = workspaceSection(location);
  const quotes: Record<string, string> = { Overview: "A clearer day starts with a clear next step.", Calls: "Every conversation deserves a clear next step.", Inbox: "Clear conversations. More time for what matters.", Appointments: "Make room for the work that matters.", Assistant: "Your business, thoughtfully represented.", Settings: "A little clarity goes a long way." };
  return <p className="mc-workspace-quote">{section === "Overview" ? <>Clear conversations.<br/>More time for what matters.</> : quotes[section]}</p>;
}
