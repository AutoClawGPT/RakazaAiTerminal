/** A tool can throw this to return a clean, typed error (bad input, not found, rate limit) instead of a generic failure. */
export class ToolFail extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
