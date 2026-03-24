export function normalizeText(input: string | null | undefined): string {
  const s = (input ?? "").toString();
  // Replace non-breaking spaces and collapse whitespace
  return s
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFirstGroup(input: string, re: RegExp): string | null {
  const m = input.match(re);
  return m?.[1] ?? null;
}

export function toAbsoluteUrl(baseUrl: string, href: string): string {
  if (!href) return href;
  try {
    // Already absolute
    if (/^https?:\/\//i.test(href)) return href;
    // Protocol-relative URLs
    if (href.startsWith("//")) return new URL(href, baseUrl).toString();
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

export function parseMaybeDate(input: string | null | undefined): Date | null {
  const s = normalizeText(input);
  if (!s) return null;

  const toUtcNoon = (year: number, month: number, day: number): Date =>
    // Use 12:00 UTC to avoid timezone day-shift when persisted/read across environments.
    new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  // Deterministic parsing for known UCG formats:
  // - DD.MM.YYYY
  // - DD-MM-YYYY
  // - YYYY-MM-DD
  const dmyDot = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (dmyDot) {
    const day = Number(dmyDot[1]);
    const month = Number(dmyDot[2]);
    const year = Number(dmyDot[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return toUtcNoon(year, month, day);
    }
  }

  const dmyDash = s.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (dmyDash) {
    const day = Number(dmyDash[1]);
    const month = Number(dmyDash[2]);
    const year = Number(dmyDash[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return toUtcNoon(year, month, day);
    }
  }

  const ymdDash = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (ymdDash) {
    const year = Number(ymdDash[1]);
    const month = Number(ymdDash[2]);
    const day = Number(ymdDash[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return toUtcNoon(year, month, day);
    }
  }
  return null;
}

