import { randomUUID } from "node:crypto";

export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 24;

export function normalizeUsername(value: FormDataEntryValue | string | null): string {
  const username = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    username.length < MIN_USERNAME_LENGTH ||
    username.length > MAX_USERNAME_LENGTH ||
    !/^[\p{L}\p{N} _.-]+$/u.test(username)
  ) {
    throw new Error(
      `Username must be ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} characters using letters, numbers, spaces, _, . or -.`,
    );
  }
  return username;
}

export function newCareerKey(): string {
  return randomUUID();
}
