const QLOO_URL_ERROR = "QLOO_API_URL must be an https URL on a qloo.com host.";

/** Origin of a Qloo API base URL. Rejects anything that would send the API key elsewhere. */
export function qlooBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(QLOO_URL_ERROR);
  }
  const host = url.hostname.toLowerCase();
  const qlooHost = host === "qloo.com" || host.endsWith(".qloo.com");
  if (url.protocol !== "https:" || !qlooHost || url.username || url.password || url.search || url.hash) {
    throw new Error(QLOO_URL_ERROR);
  }
  return url.origin;
}

/** Absolute http(s) URL with no userinfo. Returns null when the value is not usable. */
export function publicHttpUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Origin only, so a configured host cannot smuggle a path or credentials. */
export function publicHttpOrigin(raw: string): string | null {
  if (!raw) return null;
  const withScheme = raw.includes("://") ? raw : `http://${raw}`;
  const url = publicHttpUrl(withScheme);
  if (!url) return null;
  return new URL(url).origin;
}
