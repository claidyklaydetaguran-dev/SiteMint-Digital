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
import { voicePlatformEnabled } from "./featureFlags.js";

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

/**
 * ── AR-001J correction B: the gated catalogue is built in, or not at all ───
 *
 * Hiding a navigation item is a runtime decision. `visibleNavGroups` makes it,
 * and it is unchanged. Whether that item's text exists in the bundle at all is
 * a build decision, and this catalogue was making neither: all fifteen
 * voice-gated records were written into one flat `NAV_GROUPS` literal, so a
 * default-gated build shipped every gated label, description, href and icon to
 * every reader — the shape of an unreleased product, for destinations that
 * build cannot route to.
 *
 * The records themselves are untouched: same keys, labels, descriptions,
 * hrefs, icons, groups, states, ordering and placeholder classification. Only
 * where they are referenced from has changed. They now sit in one `VOICE_NAV`
 * constant, and the groups splice it back into the exact positions it always
 * occupied. When the platform flag folds to false the selection below folds
 * with it, `VOICE_NAV` loses its only reference, and Rollup drops both the
 * records and the icons that only they import. When it folds to true the
 * composed array is value-identical to the previous literal.
 *
 * This is a plain synchronous constant, deliberately: an asynchronously loaded
 * catalogue would make the navigation appear a frame late on every load.
 *
 * `voicePlatformEnabled` is imported rather than re-derived, so navigation
 * inclusion, route registration and the page import boundary cannot disagree
 * about what the flag means — see `lib/featureFlags.ts`.
 *
 * `VOICE_NAV` and `navGroupsWith` are exported for the committed `tsx`
 * contract tests, which need the enabled catalogue whatever the ambient
 * environment says. Nothing in the application imports either, so a build in
 * which the selection below folds to `NO_VOICE_NAV` leaves `VOICE_NAV` with
 * no reference at all and drops it.
 */

/**
 * The six positions the fifteen voice-gated records occupy. Build and Observe
 * are wholly gated; Operate and Manage interleave with ungated items, so their
 * gated records are held in the lead and tail slots their order requires.
 */
export interface VoiceNavSlots {
  build: NavItem[];
  operateLead: NavItem[];
  operateTail: NavItem[];
  observe: NavItem[];
  manageLead: NavItem[];
  manageTail: NavItem[];
}

export const VOICE_NAV: VoiceNavSlots = {
  build: [
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
  operateLead: [
    {
      key: "appointments", label: "Appointments", href: "/appointments", icon: CalendarDays,
      state: "live", voiceGated: true,
      description: "Visual booking calendar, requests, and availability rules. Development preview — no real calendar is connected yet.",
    },
  ],
  operateTail: [
    { key: "outbound", label: "Outbound", icon: PhoneOutgoing, state: "later", voiceGated: true },
  ],
  observe: [
    {
      key: "logs", label: "Call Logs", href: "/logs", icon: ScrollText,
      state: "live", voiceGated: true,
      description: "Review stored call records and analysis.",
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
  manageLead: [
    {
      key: "integrations", label: "Integrations", href: "/integrations", icon: Plug,
      state: "comingSoon", voiceGated: true,
      description: "Connect Google Calendar, Google Sheets, and other accounts.",
      availability: "Arriving in a later milestone",
    },
  ],
  manageTail: [
    {
      key: "api-keys", label: "API Keys", href: "/settings/api-keys", icon: KeyRound,
      state: "advanced", voiceGated: true,
      description: "Manage API credentials for advanced integrations.",
      availability: "Arriving in a later milestone",
    },
  ],
};

/** The same six slots, empty. What a default-gated build selects. */
const NO_VOICE_NAV: VoiceNavSlots = {
  build: [],
  operateLead: [],
  operateTail: [],
  observe: [],
  manageLead: [],
  manageTail: [],
};

/**
 * The approved architecture, with the voice-gated records spliced back into
 * the positions they have always occupied. The ungated records are written
 * here once and only here; passing the slots in is what keeps a single
 * catalogue rather than two.
 */
export function navGroupsWith(voice: VoiceNavSlots): NavGroup[] {
  return [
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
      items: [...voice.build],
    },
    {
      key: "operate",
      label: "Operate",
      items: [
        ...voice.operateLead,
        { key: "conversations", label: "Conversations", href: "/conversations", icon: MessageSquare, state: "live", voiceGated: false },
        { key: "receptionist", label: "Current SMS Receptionist", href: "/receptionist", icon: Bot, state: "live", voiceGated: false },
        { key: "contacts", label: "Contacts", href: "/contacts", icon: Contact, state: "live", voiceGated: false },
        ...voice.operateTail,
      ],
    },
    {
      key: "observe",
      label: "Observe",
      items: [...voice.observe],
    },
    {
      key: "manage",
      label: "Manage",
      items: [
        ...voice.manageLead,
        { key: "billing", label: "Billing", href: "/billing", icon: CreditCard, state: "live", voiceGated: false },
        { key: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, state: "live", voiceGated: false },
        ...voice.manageTail,
      ],
    },
  ];
}

export const NAV_GROUPS: NavGroup[] = navGroupsWith(
  voicePlatformEnabled ? VOICE_NAV : NO_VOICE_NAV,
);

export function isNavItemActive(item: NavItem, location: string): boolean {
  if (!item.href) return false;
  return item.href === "/" ? location === "/" : location.startsWith(item.href);
}
