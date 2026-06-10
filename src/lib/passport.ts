// Passport travel-readiness helper. "Expiring soon" means within 6 months.

export type PassportStatus = "missing" | "expired" | "expiring_soon" | "ok";

export const PASSPORT_WARN_MONTHS = 6;

export function getPassportStatus(
  passportExpiry: string | null | undefined,
  referenceDate: Date = new Date(),
): PassportStatus {
  if (!passportExpiry) {
    return "missing";
  }

  const expiry = new Date(passportExpiry);
  if (Number.isNaN(expiry.getTime())) {
    return "missing";
  }

  if (expiry.getTime() < referenceDate.getTime()) {
    return "expired";
  }

  const threshold = new Date(referenceDate);
  threshold.setMonth(threshold.getMonth() + PASSPORT_WARN_MONTHS);

  if (expiry.getTime() <= threshold.getTime()) {
    return "expiring_soon";
  }

  return "ok";
}

export function isPassportActionNeeded(status: PassportStatus): boolean {
  return status !== "ok";
}

const PASSPORT_LABELS: Record<PassportStatus, string> = {
  missing: "Passport expiry not provided",
  expired: "Passport has expired",
  expiring_soon: "Passport expiring within 6 months",
  ok: "Passport valid",
};

export function passportStatusLabel(status: PassportStatus): string {
  return PASSPORT_LABELS[status];
}
