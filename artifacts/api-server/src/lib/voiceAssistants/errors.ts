// Milestone 1 / Checkpoint E1: normalized application errors for the
// assistant persistence API. Routes map these directly to safe HTTP
// responses; VoiceProviderError (Checkpoint D) is never surfaced here
// because no provider is called in this checkpoint.

export type AssistantApiErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "PAYLOAD_TOO_LARGE";

const STATUS_BY_CODE: Record<AssistantApiErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
};

export class AssistantApiError extends Error {
  readonly code: AssistantApiErrorCode;
  readonly status: number;

  constructor(code: AssistantApiErrorCode, message: string) {
    super(message);
    this.name = "AssistantApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
