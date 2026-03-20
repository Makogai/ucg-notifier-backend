import dayjs from "dayjs";

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
  // Try common date formats used on the site (DD.MM.YYYY, etc).
  const parsed = dayjs(s, ["DD.MM.YYYY", "DD-MM-YYYY", "YYYY-MM-DD"], true);
  return parsed.isValid() ? parsed.toDate() : null;
}

