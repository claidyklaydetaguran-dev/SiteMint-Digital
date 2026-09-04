import {
  LayoutDashboard,
  ListChecks,
  Bot,
  Wrench,
  Phone,
  AudioLines,
  BookOpen,
  Users,
  Clock,
  Tag,
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  MessageSquare,
  Contact,
  PhoneOutgoing,
  ScrollText,
  Smartphone,
  BarChart3,
  FlaskConical,
  Braces,
  AlertTriangle,
  Plug,
  Gauge,
  CreditCard,
  Settings as SettingsIcon,
  LifeBuoy,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { voicePlatformEnabled } from "./featureFlags.js";

/**
 * SiteMint AI Receptionist — approved navigation architecture.
 *
 * Current architecture: the 2026-09 owner replan (OWNER-REVIEW-WORKBOOK.md
 * D-2, INFORMATION-ARCHITECTURE.md §4). It replaces the previous Checkpoint
 * B1 groups (Build / Operate / Observe / Manage) with seven groups —
 * Overview, Setup, Assistant, Scheduling, Activity, Channels, Account — and
 * moves the calendar features (Availability, Appointment Types, Calendar,
 * Appointments, Test Booking) out of the voice-platform gate entirely (owner
 * decision B-1): they are calendar features, not voice features, and are
 * wired unconditionally.
 *
 * state:
 *  - "live"       fully working destination; combine with voiceGated: true
 *                 for a built voice-platform surface that only appears when
 *                 the flag is on
 *  - "comingSoon" voice-platform destination, rendered with the shared
 *                 ComingSoon component; only reachable when the voice flag
 *                 is on. D-8 removed every one of these from the *visible*
 *                 rail — they render only because `visibleNavGroups` already
 *                 filters to state "live"; the records themselves stay so
 *                 their `ComingSoon` route (and the flag-off capability-state
 *                 answer in `lib/routes.ts`) keeps existing.
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
 * a build decision: this catalogue's voice-gated records live in one
 * `VOICE_NAV` constant, and the groups splice it back into the positions it
 * always occupies. When the platform flag folds to false the selection below
 * folds with it, `VOICE_NAV` loses its only reference, and Rollup drops both
 * the records and the icons that only they import. When it folds to true the
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
 * The gated slots the D-2 architecture needs. Assistant, Scheduling, Activity,
 * Channels and Account each interleave a gated item (or none) with ungated
 * ones in `navGroupsWith` below; `placeholders` holds every D-8
 * "removed from nav until functional" record plus the two route-less "later"
 * items — none of them are ever visible (see the `state` doc above), but they
 * still exist so their `ComingSoon` routes and flag-off capability-state
 * answers keep working.
 */
export interface VoiceNavSlots {
  assistant: NavItem[];
  activity: NavItem[];
  channels: NavItem[];
  accountLead: NavItem[];
  accountTail: NavItem[];
  placeholders: NavItem[];
}

export const VOICE_NAV: VoiceNavSlots = {
  assistant: [
    {
      key: "assistants", label: "Assistant", href: "/assistants", icon: Bot,
      state: "live", voiceGated: true,
      description: "Build and manage AI voice assistants for your business.",
    },
  ],
  activity: [
    {
      key: "calls", label: "Calls", href: "/activity/calls", icon: ScrollText,
      state: "live", voiceGated: true,
      description: "Review stored call records and analysis.",
    },
  ],
  channels: [
    {
      key: "phone-number", label: "Phone Number", href: "/channels/phone-number", icon: Phone,
      state: "live", voiceGated: true,
      description: "The number your assistant answers and makes calls from.",
    },
  ],
  accountLead: [
    {
      key: "usage", label: "Usage", href: "/account/usage", icon: Gauge,
      state: "live", voiceGated: true,
      description: "Minutes used, minutes remaining, and your billing period.",
    },
  ],
  accountTail: [
    {
      key: "issues", label: "Issues", href: "/account/issues", icon: AlertTriangle,
      state: "live", voiceGated: true,
      description: "Problems SiteMint has flagged that may need your attention.",
    },
  ],
  placeholders: [
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
    {
      key: "integrations", label: "Integrations", href: "/integrations", icon: Plug,
      state: "comingSoon", voiceGated: true,
      description: "Connect Google Calendar, Google Sheets, and other accounts.",
      availability: "Arriving in a later milestone",
    },
    {
      key: "api-keys", label: "API Keys", href: "/settings/api-keys", icon: KeyRound,
      state: "advanced", voiceGated: true,
      description: "Manage API credentials for advanced integrations.",
      availability: "Arriving in a later milestone",
    },
    { key: "squads", label: "Squads", icon: Users, state: "later", voiceGated: true },
    { key: "outbound", label: "Outbound", icon: PhoneOutgoing, state: "later", voiceGated: true },
  ],
};

/** The same slots, empty. What a default-gated build selects. */
const NO_VOICE_NAV: VoiceNavSlots = {
  assistant: [],
  activity: [],
  channels: [],
  accountLead: [],
  accountTail: [],
  placeholders: [],
};

/**
 * The approved architecture, with the voice-gated records spliced back into
 * the positions they have always occupied. The ungated records are written
 * here once and only here; passing the slots in is what keeps a single
 * catalogue rather than two.
 *
 * `placeholders` is deliberately its own trailing group: none of its items are
 * ever `state: "live"`, so `visibleNavGroups` always filters it down to zero
 * items and it never renders in the rail — it exists purely so the D-8
 * placeholder records (and the two route-less "later" items) still generate
 * their `ComingSoon` routes in `App.tsx` when the voice flag is on.
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
      key: "setup",
      label: "Setup",
      items: [
        {
          key: "setup", label: "Setup", href: "/setup", icon: ListChecks,
          state: "live", voiceGated: false,
          description: "Finish setting up your receptionist.",
        },
      ],
    },
    {
      key: "assistant",
      label: "Assistant",
      items: [...voice.assistant],
    },
    {
      key: "scheduling",
      label: "Scheduling",
      items: [
        {
          key: "availability", label: "Availability", href: "/scheduling/availability", icon: Clock,
          state: "live", voiceGated: false,
          description: "Business hours and booking rules.",
        },
        {
          key: "appointment-types", label: "Appointment Types", href: "/scheduling/appointment-types", icon: Tag,
          state: "live", voiceGated: false,
          description: "The services clients can request.",
        },
        {
          key: "calendar", label: "Calendar", href: "/scheduling/calendar", icon: CalendarDays,
          state: "live", voiceGated: false,
          description: "Connect and manage your calendar.",
        },
        {
          key: "appointments", label: "Appointments", href: "/scheduling/appointments", icon: CalendarCheck,
          state: "live", voiceGated: false,
          description: "Requests, approvals, and reschedules.",
        },
        {
          key: "test-booking", label: "Test Booking", href: "/scheduling/test-booking", icon: ClipboardCheck,
          state: "live", voiceGated: false,
          description: "Try the booking flow without creating a real appointment.",
        },
      ],
    },
    {
      key: "activity",
      label: "Activity",
      items: [
        ...voice.activity,
        { key: "conversations", label: "Conversations", href: "/activity/conversations", icon: MessageSquare, state: "live", voiceGated: false },
        { key: "contacts", label: "Contacts", href: "/activity/contacts", icon: Contact, state: "live", voiceGated: false },
      ],
    },
    {
      key: "channels",
      label: "Channels",
      items: [
        ...voice.channels,
        {
          key: "sms", label: "SMS", href: "/channels/sms", icon: Smartphone,
          state: "live", voiceGated: false,
          description: "The SMS channel that texts with your clients.",
        },
      ],
    },
    {
      key: "account",
      label: "Account",
      items: [
        ...voice.accountLead,
        { key: "billing", label: "Billing", href: "/account/billing", icon: CreditCard, state: "live", voiceGated: false },
        { key: "settings", label: "Settings", href: "/account/settings", icon: SettingsIcon, state: "live", voiceGated: false },
        {
          key: "support", label: "Support", href: "/account/support", icon: LifeBuoy,
          state: "live", voiceGated: false,
          description: "Get help from SiteMint.",
        },
        ...voice.accountTail,
      ],
    },
    {
      key: "placeholders",
      label: "Placeholders",
      items: [...voice.placeholders],
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
