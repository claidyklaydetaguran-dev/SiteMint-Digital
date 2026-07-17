import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Conversation {
  id: number;
  createdAt: string;
  lastMessageAt: string;
  callerPhone: string;
  status: "in_progress" | "completed" | "opted_out";
  isOverCap?: boolean;
  tier: "Hot" | "Warm" | "Cold" | "Disqualified" | "Needs Review" | null;
  disqualifyReason: string | null;
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () =>
      apiFetch<{ conversations: Conversation[] }>("/receptionist/conversations").then(
        (d) => d.conversations,
      ),
    refetchInterval: 30_000,
  });
}
