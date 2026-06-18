import crypto from "crypto";

const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

export function getSessionToken(): string {
  return SESSION_TOKEN;
}

export function validateToken(token: string): boolean {
  return token === SESSION_TOKEN;
}
