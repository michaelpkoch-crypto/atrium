/** Strip credential-shaped text before it can reach a response, a trace, or a log. */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = text;
  const unique = [...new Set(secrets.map((secret) => secret.trim()).filter((secret) => secret.length >= 8))].sort(
    (a, b) => b.length - a.length,
  );
  for (const secret of unique) out = out.split(secret).join("[redacted]");

  out = out
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/([?&](?:api[_-]?key|access_token|token|key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\/api\/[^/\s]+\/groups\//g, "/api/[redacted]/groups/");

  return out.slice(0, 300);
}
