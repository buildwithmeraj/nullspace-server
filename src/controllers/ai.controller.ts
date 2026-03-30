import type { Request, Response } from "express";

type EnhanceBody = { content?: unknown };

function getRequestUser(req: Request) {
  return (req as Request & { user?: Express.User }).user;
}

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    ""
  ).trim();
}

function normalizeModelId(raw: string) {
  // Accept either "gemini-*" or "models/gemini-*".
  const s = String(raw ?? "").trim();
  return s.startsWith("models/") ? s.slice("models/".length) : s;
}

let cachedModelId: string | null = null;
let cachedAt = 0;

async function resolveModelId(apiKey: string) {
  const envModel = String(process.env.GEMINI_MODEL ?? "").trim();
  if (envModel) return normalizeModelId(envModel);

  // Cache discovery for a short period to avoid calling ListModels too often.
  const now = Date.now();
  if (cachedModelId && now - cachedAt < 5 * 60 * 1000) return cachedModelId;

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => null)) as unknown;

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

  const models = isRecord(json) && Array.isArray(json.models) ? json.models : [];
  const usable = models
    .filter((m): m is Record<string, unknown> => isRecord(m))
    .filter((m) => {
      const methods = m.supportedGenerationMethods;
      return Array.isArray(methods) && methods.includes("generateContent");
    })
    .map((m) => String(m.name ?? "").trim())
    .filter(Boolean);

  // Prefer a "flash" model if available, otherwise first usable.
  const pick =
    usable.find((n) => /flash/i.test(n)) ??
    usable.find((n) => /gemini/i.test(n)) ??
    usable[0] ??
    "";

  cachedModelId = normalizeModelId(pick);
  cachedAt = now;
  return cachedModelId || "gemini-1.5-flash";
}

function countWords(text: string) {
  const matches = text.match(/[A-Za-z0-9_']+/g);
  return matches ? matches.length : 0;
}

function stripCode(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`]*`/g, " ");
}

function buildPrompt(userMarkdown: string) {
  return [
    "You are an expert editor.",
    "Rewrite the user's Markdown post to be professional, clear, and easy to understand.",
    "Fix spelling and grammar mistakes. Improve readability.",
    "Do NOT change the meaning or add new facts.",
    "Preserve Markdown structure (headings, lists, links, mentions, and code blocks).",
    "Return ONLY the rewritten Markdown content with no extra explanation.",
    "",
    "USER POST (Markdown):",
    userMarkdown,
  ].join("\n");
}

const enhancePost = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const body = (req.body ?? {}) as EnhanceBody;
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) return res.status(400).json({ success: false, message: "content is required" });

  const prose = stripCode(content);
  if (countWords(prose) < 5) {
    return res.status(400).json({
      success: false,
      message: "Write at least one sentence (5+ words) to enhance.",
    });
  }

  const key = getApiKey();
  if (!key) {
    return res.status(500).json({
      success: false,
      message: "GEMINI_API_KEY is not set on the backend",
    });
  }

  const modelId = await resolveModelId(key);
  const model = encodeURIComponent(modelId);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const prompt = buildPrompt(content);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  const json = (await r.json().catch(() => null)) as unknown;
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

  if (!r.ok) {
    const message =
      (isRecord(json) &&
      isRecord(json.error) &&
      typeof json.error.message === "string"
        ? json.error.message
        : undefined) ??
      (isRecord(json) && typeof json.message === "string" ? json.message : undefined) ??
      "Gemini request failed";
    return res.status(502).json({
      success: false,
      message,
      hint: "Set `GEMINI_MODEL` to a model that supports `generateContent`, or leave it unset to auto-pick from ListModels.",
    });
  }

  let text = "";
  if (isRecord(json) && Array.isArray(json.candidates) && json.candidates[0]) {
    const c0 = json.candidates[0];
    if (isRecord(c0) && isRecord(c0.content) && Array.isArray(c0.content.parts) && c0.content.parts[0]) {
      const p0 = c0.content.parts[0];
      if (isRecord(p0) && typeof p0.text === "string") text = p0.text;
    }
  }

  const enhanced = String(text ?? "").trim();
  if (!enhanced) return res.status(502).json({ success: false, message: "No output from Gemini" });

  return res.status(200).json({ success: true, data: { content: enhanced } });
};

export const aiControllers = { enhancePost };
