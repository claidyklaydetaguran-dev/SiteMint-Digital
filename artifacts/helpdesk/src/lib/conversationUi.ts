export const PHONE_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b",
  "#3b82f6", "#10b981", "#ef4444",
];

export function phoneColor(phone: string): string {
  let hash = 0;
  for (const c of phone) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PHONE_COLORS[Math.abs(hash) % PHONE_COLORS.length];
}

export function phoneInitials(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2).toUpperCase() || "??";
}

export const TIER_STYLES: Record<string, string> = {
  Hot:           "bg-rose-100 text-rose-700",
  Warm:          "bg-amber-100 text-amber-700",
  Cold:          "bg-blue-100 text-blue-700",
  Disqualified:  "bg-slate-100 text-slate-500",
  "Needs Review": "bg-yellow-100 text-yellow-700",
};

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
