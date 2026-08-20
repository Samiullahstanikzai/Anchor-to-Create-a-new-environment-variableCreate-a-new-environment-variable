export function parseCookies(header) {
  const map = new Map();
  if (!header) return map;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    if (key) map.set(key, value);
  }
  return map;
}

export function serializeCookie(name, value, { maxAgeSeconds, httpOnly = true, sameSite = "Lax", secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (httpOnly) parts.push("HttpOnly");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
