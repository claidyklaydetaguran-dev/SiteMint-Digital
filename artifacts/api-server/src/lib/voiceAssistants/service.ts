// Milestone 1 / Checkpoint E1: application service between the router and
// the repository. Owns validation orchestration, duplicate naming, safe DTO
// mapping, and normalized application errors. Knows nothing about HTTP
// status codes or Express.

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import { voiceAssistantRepository } from "./repository.js";
import { validateCreateBody, validateRouteId, validateUpdateBody } from "./validation.js";
import { AssistantApiError } from "./errors.js";
import { deriveProviderSyncState, type ProviderSyncState } from "./providerSyncState.js";

const MAX_NAME_LENGTH = 100;
const COPY_SUFFIX = " Copy";

export interface AssistantDto {
  id: number;
  name: string;
  templateKey: string;
  status: string;
  provider: string | null;
  /**
   * AR-001V.1: the provider assistant id is NOT in this DTO. Ordinary list and
   * detail reads answer only whether a provider resource exists, because that
   * is the only thing the dashboard needs in order to render status, gate
   * delete, and decide eligibility. The id itself is handed out solely by the
   * dedicated browser-test session endpoint, after an explicit owner
   * confirmation, and only while the server-side browser-test flag is on.
   */
  providerLinked: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  syncError: string | null;
  /**
   * AR-001V. Derived, never stored: whether the provider is running what this
   * row currently says. The digest itself is not exposed — the client only
   * needs the answer, and a state string cannot be mistaken for a credential
   * or a provider identifier.
   */
  providerSyncState: ProviderSyncState;
  /** Safe static code from PROVIDER_SYNC_ERROR_CODES, or null. Never provider text. */
  providerSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: VoiceAssistant): AssistantDto {
  return {
    id: row.id,
    name: row.name,
    templateKey: row.templateKey,
    status: row.status,
    provider: row.provider,
    providerLinked:
      row.provider !== null &&
      row.provider.trim().length > 0 &&
      row.providerAssistantId !== null &&
      row.providerAssistantId.trim().length > 0,
    config: row.config,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncError: row.syncError,
    providerSyncState: deriveProviderSyncState(row),
    providerSyncError: row.providerSyncError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildCopyName(originalName: string): string {
  const candidate = `${originalName}${COPY_SUFFIX}`;
  if (candidate.length <= MAX_NAME_LENGTH) return candidate;

  const truncatedBase = originalName.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length);
  return `${truncatedBase}${COPY_SUFFIX}`;
}

export const voiceAssistantService = {
  async list(firmId: number): Promise<{ items: AssistantDto[]; count: number }> {
    const rows = await voiceAssistantRepository.listByFirm(firmId);
    return { items: rows.map(toDto), count: rows.length };
  },

  async create(firmId: number, body: unknown): Promise<AssistantDto> {
    const input = validateCreateBody(body);
    const row = await voiceAssistantRepository.createForFirm(firmId, input);
    return toDto(row);
  },

  async get(firmId: number, rawId: string): Promise<AssistantDto> {
    const id = validateRouteId(rawId);
    const row = await voiceAssistantRepository.findByIdForFirm(firmId, id);
    if (!row) throw new AssistantApiError("NOT_FOUND", "Assistant not found");
    return toDto(row);
  },

  async update(firmId: number, rawId: string, body: unknown): Promise<AssistantDto> {
    const id = validateRouteId(rawId);
    const patch = validateUpdateBody(body);
    const row = await voiceAssistantRepository.updateByIdForFirm(firmId, id, patch);
    if (!row) throw new AssistantApiError("NOT_FOUND", "Assistant not found");
    return toDto(row);
  },

  async duplicate(firmId: number, rawId: string): Promise<AssistantDto> {
    const id = validateRouteId(rawId);
    const copy = await voiceAssistantRepository.duplicateByIdForFirm(firmId, id, buildCopyName);
    if (!copy) throw new AssistantApiError("NOT_FOUND", "Assistant not found");
    return toDto(copy);
  },

  async remove(firmId: number, rawId: string): Promise<void> {
    const id = validateRouteId(rawId);
    const outcome = await voiceAssistantRepository.deleteByIdForFirm(firmId, id);

    if (outcome === "not_found") {
      throw new AssistantApiError("NOT_FOUND", "Assistant not found");
    }
    if (outcome === "conflict") {
      throw new AssistantApiError(
        "CONFLICT",
        "Assistant is provider-linked or published and cannot be deleted",
      );
    }
  },
};
