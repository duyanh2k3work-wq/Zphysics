import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_TABLES = new Set([
  "students",
  "lessons",
  "exams",
  "questions",
  "student_progress",
]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getConfiguredSecretKeys(): string[] {
  const keys: string[] = [];
  const rawSecretMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (rawSecretMap) {
    try {
      const parsed = JSON.parse(rawSecretMap);
      if (parsed && typeof parsed === "object") {
        for (const val of Object.values(parsed)) {
          if (typeof val === "string" && val.length > 0) {
            keys.push(val);
          }
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  const legacyServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyServiceRole && legacyServiceRole.length > 0) {
    keys.push(legacyServiceRole);
  }
  return keys;
}

function validateRestPath(rawPath: unknown): string | null {
  if (typeof rawPath !== "string") return null;
  const trimmed = rawPath.trim().replace(/^\/+/, "");
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    trimmed.includes("//") ||
    /[\r\n]/.test(trimmed)
  ) {
    return null;
  }
  const qIndex = trimmed.indexOf("?");
  const table = qIndex === -1 ? trimmed : trimmed.slice(0, qIndex);
  if (!ALLOWED_TABLES.has(table)) {
    return null;
  }
  return trimmed;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return Response.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
  }

  const configuredKeys = getConfiguredSecretKeys();
  const providedKey = (req.headers.get("x-sync-key") || "").trim();

  if (configuredKeys.length === 0) {
    console.error("[sheets-proxy] No secret keys configured in runtime env");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let matchedKey: string | null = null;
  for (const candidate of configuredKeys) {
    if (providedKey.length > 0 && timingSafeEqual(providedKey, candidate)) {
      matchedKey = candidate;
    }
  }

  if (!matchedKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: unknown; method?: unknown; payload?: unknown; prefer?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const method = typeof body.method === "string" ? body.method.trim().toUpperCase() : "";
  if (!ALLOWED_METHODS.has(method)) {
    return Response.json({ error: "Invalid REST method" }, { status: 400 });
  }

  const validatedPath = validateRestPath(body.path);
  if (!validatedPath) {
    return Response.json({ error: "Invalid or disallowed REST path" }, { status: 400 });
  }

  const upstreamHeaders: Record<string, string> = {
    "apikey": matchedKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (!matchedKey.startsWith("sb_secret_")) {
    upstreamHeaders["Authorization"] = `Bearer ${matchedKey}`;
  }
  if (typeof body.prefer === "string" && body.prefer.trim().length > 0) {
    upstreamHeaders["Prefer"] = body.prefer.trim();
  }

  const fetchInit: RequestInit = {
    method,
    headers: upstreamHeaders,
  };
  if ((method === "POST" || method === "PATCH") && body.payload !== null && body.payload !== undefined) {
    fetchInit.body = JSON.stringify(body.payload);
  }

  const upstreamRes = await fetch(`${supabaseUrl}/rest/v1/${validatedPath}`, fetchInit);
  const responseText = await upstreamRes.text();

  return new Response(responseText, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json; charset=utf-8",
    },
  });
});
