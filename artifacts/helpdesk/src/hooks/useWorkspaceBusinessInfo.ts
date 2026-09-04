import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  AGENT_CONFIG_PATH,
  AGENT_CONFIG_QUERY_KEY,
  readAgentConfig,
} from "@/pages/receptionist/receptionistContract";

/**
 * V5 PR-6 (C-2): read-only view of the firm's business name and industry.
 *
 * Sourced from the same `GET /api/receptionist/agent-config` endpoint (and
 * the same `["agent-config"]` query cache key) the Workspace Settings /
 * Receptionist page reads and owns — `receptionistContract.ts` is imported
 * here for its response parsing only and is never modified by this file or
 * anything in the assistant builder. The assistant Configuration tab shows
 * these values for reference and links the customer to Workspace Settings to
 * change them; nothing in the assistant builder writes to this endpoint.
 */
export interface WorkspaceBusinessInfo {
  name: string;
  industry: string;
}

export function useWorkspaceBusinessInfo(): {
  data: WorkspaceBusinessInfo | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: [AGENT_CONFIG_QUERY_KEY],
    queryFn: () => apiFetch<unknown>(AGENT_CONFIG_PATH),
  });

  const config = data === undefined ? null : readAgentConfig(data);

  return {
    data: config ? { name: config.name ?? "", industry: config.industry ?? "" } : null,
    isLoading,
  };
}
