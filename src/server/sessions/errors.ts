export type SessionErrorCode =
  | "PAYWALL"
  | "INSUFFICIENT_BALANCE"
  | "TRIAL_USED"
  | "TRIAL_NEEDS_DIAGNOSTIC"
  | "TRIAL_NEEDS_VERIFIED_EMAIL"
  | "TRIAL_LIMIT_REACHED"
  | "CAPTCHA_REQUIRED"
  | "SERVICE_PAUSED"
  | "NOT_CONFIGURED"
  | "SESSION_OPEN"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "TAVUS_ERROR";

const STATUS: Record<SessionErrorCode, number> = {
  PAYWALL: 402,
  INSUFFICIENT_BALANCE: 402,
  TRIAL_USED: 403,
  TRIAL_NEEDS_DIAGNOSTIC: 403,
  TRIAL_NEEDS_VERIFIED_EMAIL: 403,
  TRIAL_LIMIT_REACHED: 429,
  CAPTCHA_REQUIRED: 403,
  SERVICE_PAUSED: 503,
  NOT_CONFIGURED: 503,
  SESSION_OPEN: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  TAVUS_ERROR: 502,
};

export class SessionError extends Error {
  readonly status: number;
  constructor(
    readonly code: SessionErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SessionError";
    this.status = STATUS[code];
  }
}
