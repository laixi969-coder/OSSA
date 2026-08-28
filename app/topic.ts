import {
  briefSystem,
  briefUser,
  draftSystem,
  draftUser,
  EMPTY_SCAN,
  loadNewsangleSkill,
  parseIdea,
  parseScan,
  type AngleIdea,
  type NewsScan,
} from "./newsangle";

export type ContentFormat = "short_video" | "xhs" | "short_drama" | "bilibili" | "ad";

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  short_video: "短视频",
  xhs: "小红书图文",
  short_drama: "短剧",
  bilibili: "B站中长视频",
  ad: "广告创意",
};

export type Situation = {
  niche: string;
  persona: string;
  audience: string;
  formats: ContentFormat[];
};

export type SignalInput = {
  title: string;
  url: string;
  source: string;
  summary: string;
  cover: string;
};

export type TopicIdea = AngleIdea;
export type { NewsScan };
export { EMPTY_SCAN };

export type DraftPack = {
  format: ContentFormat;
  shoot: { hook: string; structure: string; ending: string; shots: string };
  write: { titles: string[]; opening: string; body: string; tags: string[] };
};

export type TopicBrief = {
  noSignal: boolean;
  noSignalReason: string;
  followReason: string;
  verdictHint: "follow" | "skip" | "need_evidence";
  topicIdeas: TopicIdea[];
  evidenceLimitations: string[];
  scan: NewsScan;
  goldLine: string;
};

const RISK: Record<string, TopicIdea["risk"]> = { 低: "low", 中: "mid", 高: "high", low: "low", mid: "mid", high: "high" };

function extractJson(raw: string): unknown {
  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可用的选题结构");
  return JSON.parse(text.slice(start, end + 1));
}

export const AGNES_BASE = (process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
export const AGNES_CHAT_MODEL = process.env.AGNES_MODEL || "agnes-2.5-flash";

export type LlmModel = { id: string; kind: "chat" | "image" | "video" };

export const FALLBACK_MODELS: LlmModel[] = [
  { id: "agnes-2.5-flash", kind: "chat" },
  { id: "agnes-2.0-flash", kind: "chat" },
  { id: "agnes-1.5-flash", kind: "chat" },
  { id: "agnes-image-2.1-flash", kind: "image" },
  { id: "agnes-image-2.0-flash", kind: "image" },
  { id: "agnes-video-v2.0", kind: "video" },
];

export function modelKind(id: string): LlmModel["kind"] {
  const s = id.toLowerCase();
  if (s.includes("video")) return "video";
  if (s.includes("image") || s.includes("img") || s.includes("flux") || s.includes("dall")) return "image";
  return "chat";
}

export function normalizeBase(raw: string) {
  return (raw || AGNES_BASE).trim().replace(/\/$/, "") || AGNES_BASE;
}

export function llmConfig(opts: { envKey?: string; storeKey?: string; base?: string; model?: string }) {
  const apiKey = (opts.envKey || opts.storeKey || "").trim();
  const base = normalizeBase(opts.base || "");
  const model = (opts.model || AGNES_CHAT_MODEL).trim() || AGNES_CHAT_MODEL;
  return {
    apiKey,
    model,
    configured: Boolean(apiKey),
    fromEnv: Boolean((opts.envKey || "").trim()),
    base,
    chatUrl: `${base}/chat/completions`,
  };
}

function errDetail(body: string) {
  let detail = body.slice(0, 220);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") detail = parsed.error;
    else detail = parsed.error?.message || parsed.message || detail;
  } catch {
    /* keep */
  }
  return detail;
}

export async function listRemoteModels(apiKey: string, base: string): Promise<{ ok: boolean; error: string; models: LlmModel[] }> {
  const root = normalizeBase(base);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${root}/models`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: errDetail(body) || `同步失败 ${res.status}`, models: FALLBACK_MODELS };
    }
    const parsed = JSON.parse(body) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
    const rows = parsed.data || parsed.models || [];
    const models = rows
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
      .map((id) => ({ id, kind: modelKind(id) }));
    if (!models.length) return { ok: false, error: "接口没返回模型列表，先用常用模型", models: FALLBACK_MODELS };
    return { ok: true, error: "", models };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "同步超时" : err instanceof Error ? err.message : "同步失败";
    return { ok: false, error: message, models: FALLBACK_MODELS };
  } finally {
    clearTimeout(t);
  }
}

export async function pingLlm(apiKey: string, base: string, model: string) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${normalizeBase(base)}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word ok." }],
      }),
    });
    const body = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, hint: errDetail(body) || `连通失败 ${res.status}`, ms, model };
    const parsed = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = (parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.message?.reasoning_content || "").trim();
    const used = Number(parsed.usage?.total_tokens || 0);
    if (!text && used <= 0) return { ok: false, hint: "连上了，但模型没回内容", ms, model };
    return { ok: true, hint: `通了 · ${model} · ${ms}ms`, ms, model };
  } catch (err) {
    const ms = Date.now() - started;
    const hint = err instanceof Error && err.name === "AbortError" ? "测连通超时" : err instanceof Error ? err.message : "测连通失败";
    return { ok: false, hint, ms, model };
  } finally {
    clearTimeout(t);
  }
}

async function chat(apiKey: string, model: string, system: string, user: string, timeout = 55000, base = AGNES_BASE): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${normalizeBase(base)}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      let detail = body.slice(0, 180);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        detail = parsed.error?.message || detail;
      } catch {
        /* keep */
      }
      throw new Error(`模型请求失败：${detail}`);
    }
    const parsed = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
    const content = parsed.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("模型返回空");
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("选题生成超时，请再试一次");
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function situationBlock(s: Situation) {
  const filled = Boolean(s.niche || s.persona || s.audience);
  return {
    filled,
    text: filled
      ? `赛道：${s.niche || "未写"}\n人设：${s.persona || "未写"}\n受众：${s.audience || "未写"}\n主做格式：${(s.formats || []).map((f) => FORMAT_LABELS[f] || f).join("、") || "短视频、小红书"}`
      : "这家还没写处境。不要假设任何行业。只根据这条热本身说话，对不上就交白卷，不要编成适合所有人的题。",
  };
}

export async function generateBrief(opts: {
  apiKey: string;
  model: string;
  base?: string;
  situation: Situation;
  signal: SignalInput;
  priorTitles: string[];
}): Promise<TopicBrief> {
  const sit = situationBlock(opts.situation);
  const prior = opts.priorTitles.slice(0, 12).map((t) => `• ${t}`).join("\n");
  const skill = await loadNewsangleSkill();
  const formats = (opts.situation.formats || []).join("、");
  const raw = await chat(
    opts.apiKey,
    opts.model,
    briefSystem(skill),
    briefUser({
      sitText: sit.text,
      title: opts.signal.title,
      source: opts.signal.source,
      summary: opts.signal.summary,
      url: opts.signal.url,
      prior,
      formats,
    }),
    90000,
    opts.base,
  );
  const data = extractJson(raw) as Record<string, unknown>;
  const ideasRaw = Array.isArray(data.topicIdeas) ? data.topicIdeas : [];
  const scanRaw = data.scan && typeof data.scan === "object" ? (data.scan as Record<string, unknown>) : {};
  const scan = parseScan({ ...scanRaw, mode: scanRaw.mode || data.mode });
  const topicIdeas = ideasRaw.slice(0, 3).map((row) => parseIdea(row, RISK));
  const noSignal = Boolean(data.noSignal) && topicIdeas.length === 0 ? true : Boolean(data.noSignal);
  const hint = String(data.verdictHint || "");
  const verdictHint: TopicBrief["verdictHint"] =
    hint === "skip" || hint === "need_evidence" ? hint : noSignal && !topicIdeas.length ? "skip" : "follow";
  const limitations = Array.isArray(data.evidenceLimitations)
    ? data.evidenceLimitations.map((x) => String(x))
    : [];
  if (!limitations.some((x) => /一次|采样|趋势/.test(x))) {
    limitations.unshift("这是这一条热点，不是连续数据，不能据此说它正在上升或已经退潮。");
  }
  return {
    noSignal,
    noSignalReason: String(data.noSignalReason || (noSignal ? "这条热和我们的处境对不上，先别拍。" : "")),
    followReason: String(data.followReason || "").trim(),
    verdictHint,
    topicIdeas,
    evidenceLimitations: limitations.slice(0, 6),
    scan,
    goldLine: String(data.goldLine || "").trim(),
  };
}

export async function generateDraft(opts: {
  apiKey: string;
  model: string;
  base?: string;
  situation: Situation;
  signal: SignalInput;
  idea: TopicIdea;
  format: ContentFormat;
}): Promise<DraftPack> {
  const sit = situationBlock(opts.situation);
  const label = FORMAT_LABELS[opts.format];
  const formatHint: Record<ContentFormat, string> = {
    short_video: "如何拍=前3秒可念台词或画面、中段分点带大概秒数、结尾行动引导、2-4个画面。如何写=5个备选标题+完整口播。视频/口播必须过可拍闸门。",
    xhs: "如何拍=封面打法、图序建议。如何写=3个封面标题、3个首句、完整正文、8-12个话题标签（大词/垂类分开写在 tags 里）。小红书必须落到「和我有什么关系」。",
    short_drama: "如何拍=第一集开头冲突和结尾悬念。如何写=剧情大纲+人物记忆点。",
    bilibili: "如何拍=开头15-30秒的信息承诺、中段知识爆点。如何写=标题+分段口播大纲。",
    ad: "如何拍=可执行的概念画面。如何写=不像广告的脚本初稿。",
  };
  const skill = await loadNewsangleSkill();
  const raw = await chat(
    opts.apiKey,
    opts.model,
    draftSystem(skill),
    draftUser({
      sitText: sit.text,
      signalTitle: opts.signal.title,
      source: opts.signal.source,
      idea: opts.idea,
      format: opts.format,
      formatHint: formatHint[opts.format],
      formatLabel: label,
    }),
    90000,
    opts.base,
  );
  const data = extractJson(raw) as Record<string, unknown>;
  const shoot = (data.shoot || {}) as Record<string, unknown>;
  const write = (data.write || {}) as Record<string, unknown>;
  const titles = Array.isArray(write.titles) ? write.titles.map((x) => String(x)).filter(Boolean) : [];
  const tags = Array.isArray(write.tags) ? write.tags.map((x) => String(x)).filter(Boolean) : [];
  return {
    format: opts.format,
    shoot: {
      hook: String(shoot.hook || "").trim(),
      structure: String(shoot.structure || "").trim(),
      ending: String(shoot.ending || "").trim(),
      shots: String(shoot.shots || "").trim(),
    },
    write: {
      titles: titles.slice(0, 6),
      opening: String(write.opening || "").trim(),
      body: String(write.body || "").trim(),
      tags: tags.slice(0, 12),
    },
  };
}
