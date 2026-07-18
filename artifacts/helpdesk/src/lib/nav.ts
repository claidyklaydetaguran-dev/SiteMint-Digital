import {
  LayoutDashboard,
  Bot,
  Wrench,
  Phone,
  AudioLines,
  BookOpen,
  Users,
  CalendarDays,
  MessageSquare,
  Contact,
  PhoneOutgoing,
  ScrollText,
  BarChart3,
  FlaskConical,
  Braces,
  AlertTriangle,
  Plug,
  CreditCard,
  Settings as SettingsIcon,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

/**
 * SiteMint AI Receptionist — approved navigation architecture (Checkpoint B1).
 *
 * state:
 *  - "live"       fully working destination; combine with voiceGated: true
 *                 for a built voice-platform surface that only appears when
 *                 the flag is on (see Assistants, Checkpoint B3)
 *  - "comingSoon" voice-platform destination, rendered with the shared
 *                 ComingSoon component; only reachable when the voice flag
 *                 is on
 *  - "later"      deferred item, always visibly disabled, no route
 *  - "advanced"   voice-platform destination revealed under an "Advanced"
 *                 disclosure in Manage
 */
export type NavItemState = "live" | "comingSoon" | "later" | "advanced";

export interface NavItem {
  key: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  state: NavItemState;
  /** True if this item should be hidden entirely when the voice flag is off. */
  voiceGated: boolean;
  description?: string;
  availability?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { key: "overview", label: "Overview", href: "/", icon: LayoutDashboard, state: "live", voiceGated: false },
    ],
  },
  {
    key: "build",
    label: "Build",
    items: [
      {
        key: "assistants", label: "Assistants", href: "/assistants", icon: Bot,
        state: "live", voiceGated: true,
        description: "Build and manage AI voice assistants for your business.",
      },
      {
        key: "tools", label: "Tools", href: "/tools", icon: Wrench,
        state: "comingSoon", voiceGated: true,
        description: "Assign actions your assistant can take during a call, like booking or transferring.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "phone-numbers", label: "Phone Numbers", href: "/phone-numbers", icon: Phone,
        state: "comingSoon", voiceGated: true,
        description: "Get a SiteMint number or connect one you already own.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "voice-library", label: "Voice Library", href: "/voice-library", icon: AudioLines,
        state: "comingSoon", voiceGated: true,
        description: "Browse and preview voices for your assistant.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "knowledge", label: "Knowledge Base", href: "/knowledge", icon: BookOpen,
        state: "comingSoon", voiceGated: true,
        description: "Give your assistant reference material to draw on during calls.",
        availability: "Arriving in a later milestone",
      },
      { key: "squads", label: "Squads", icon: Users, state: "later", voiceGated: true },
    ],
  },
  {
    key: "operate",
    label: "Operate",
    items: [
      {
        key: "appointments", label: "Appointments", href: "/appointments", icon: CalendarDays,
        state: "comingSoon", voiceGated: true,
        description: "See and manage the bookings your assistant makes.",
        availability: "Arriving in a later milestone",
      },
      { key: "conversations", label: "Conversations", href: "/conversations", icon: MessageSquare, state: "live", voiceGated: false },
      { key: "receptionist", label: "Current SMS Receptionist", href: "/receptionist", icon: Bot, state: "live", voiceGated: false },
      { key: "contacts", label: "Contacts", href: "/contacts", icon: Contact, state: "live", voiceGated: false },
      { key: "outbound", label: "Outbound", icon: PhoneOutgoing, state: "later", voiceGated: true },
    ],
  },
  {
    key: "observe",
    label: "Observe",
    items: [
      {
        key: "logs", label: "Call Logs", href: "/logs", icon: ScrollText,
        state: "comingSoon", voiceGated: true,
        description: "Calls, chats, sessions, and webhook activity in one place.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3,
        state: "comingSoon", voiceGated: true,
        description: "Business metrics — calls answered, appointments booked, hours saved.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "testing", label: "Testing", href: "/testing", icon: FlaskConical,
        state: "comingSoon", voiceGated: true,
        description: "Test your assistant with a browser call or a text conversation.",
        availability: "Arriving in a later milestone",
      },
      {
        key: "structured-outputs", label: "Structured Outputs", href: "/structured-outputs", icon: Braces,
        state: "comingSoon", voiceGated: true,
        description: "Data your assistant extracts and structures from each call.",
        availability: "Arriving in a later milestone",
      },
      { key: "issues", label: "Issues", icon: AlertTriangle, state: "later", voiceGated: true },
    ],
  },
  {
    key: "manage",
    label: "Manage",
    items: [
      {
        key: "integrations", label: "Integrations", href: "/integrations", icon: Plug,
        state: "comingSoon", voiceGated: true,
        description: "Connect Google Calendar, Google Sheets, and other accounts.",
        availability: "Arriving in a later milestone",
      },
      { key: "billing", label: "Billing", href: "/billing", icon: CreditCard, state: "live", voiceGated: false },
      { key: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, state: "live", voiceGated: false },
      {
        key: "api-keys", label: "API Keys", href: "/settings/api-keys", icon: KeyRound,
        state: "advanced", voiceGated: true,
        description: "Manage API credentials for advanced integrations.",
        availability: "Arriving in a later milestone",
      },
    ],
  },
];

export function isNavItemActive(item: NavItem, location: string): boolean {
  if (!item.href) return false;
  return item.href === "/" ? location === "/" : location.startsWith(item.href);
}
