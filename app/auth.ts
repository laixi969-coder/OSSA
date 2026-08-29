import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ACCOUNTS = join(ROOT, "data", "accounts.json");
const WORKSPACES = join(ROOT, "data", "workspaces");
const LEGACY_STORE = join(ROOT, "data", "store.json");
const COOKIE = "ossa";
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const CAPTCHA_MS = 8 * 60 * 1000;
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60 * 1000;

export const ADMIN_EMAIL = "66445039@qq.com";

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
  failedLogins: number;
  lockedUntil: string;
};

type Session = { id: string; userId: string; expiresAt: number; createdAt: string };
type Captcha = { id: string; answer: string; expiresAt: number; issuedAt: number };
type AccountsFile = { users: AuthUser[]; sessions: Session[] };

const captchas = new Map<string, Captcha>();
const buckets = new Map<string, { n: number; reset: number }>();
let dummyHash = "";

async function timingGuardHash() {
  if (!dummyHash) dummyHash = await Bun.password.hash("ossa-timing-guard-password", { algorithm: "argon2id" });
  return dummyHash;
}

async function readAccounts(): Promise<AccountsFile> {
  const file = Bun.file(ACCOUNTS);
  if (!(await file.exists())) return { users: [], sessions: [] };
  try {
    const data = JSON.parse(await file.text()) as AccountsFile;
    const users = (data.users || []).map((u) => ({ ...u, role: userRole(u.email, u.role) }));
    return { users, sessions: data.sessions || [] };
  } catch {
    return { users: [], sessions: [] };
  }
}

async function writeAccounts(data: AccountsFile) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  const sessions = data.sessions.filter((s) => s.expiresAt > Date.now());
  await Bun.write(ACCOUNTS, JSON.stringify({ users: data.users, sessions }, null, 2));
}

export function clientIp(req: Request) {
  const forwarded = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (forwarded && forwarded.length < 80) return forwarded;
  return req.headers.get("cf-connecting-ip") || "127.0.0.1";
}

export function takeToken(ip: string, bucket: string, limit: number, windowMs: number) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const row = buckets.get(key);
  if (!row || row.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (row.n >= limit) return { ok: false, retryAfter: Math.ceil((row.reset - now) / 1000) };
  row.n += 1;
  return { ok: true, retryAfter: 0 };
}

export function rateLimited(ip: string, path: string) {
  const api = takeToken(ip, "api", 90, 60_000);
  if (!api.ok) return api;
  if (path === "/api/auth/login") return takeToken(ip, "login", 8, 15 * 60_000);
  if (path === "/api/auth/register") return takeToken(ip, "register", 5, 60 * 60_000);
  if (path === "/api/auth/captcha") return takeToken(ip, "captcha", 30, 60_000);
  return api;
}

function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAdminEmail(email: string) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function userRole(email: string, role?: AuthUser["role"]): AuthUser["role"] {
  return isAdminEmail(email) || role === "admin" ? "admin" : "user";
}

function emailOk(email: string) {
  return /^[^\s@]{1,64}@[^\s@]{1,80}\.[^\s@]{2,24}$/.test(email);
}

export function passwordIssue(password: string, email = "") {
  if (password.length < 8) return "密码至少 8 位";
  if (password.length > 72) return "密码太长";
  if (email && password.toLowerCase() === email.toLowerCase()) return "密码不能和邮箱一样";
  if (/^\s|\s$/.test(password)) return "密码两端不要空格";
  return "";
}

export function parseCookie(req: Request, name = COOKIE) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

export function sessionCookie(sessionId: string, req: Request) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`;
}

export function clearSessionCookie(req: Request) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function readSession(req: Request) {
  const id = parseCookie(req);
  if (!id) return null;
  const data = await readAccounts();
  const session = data.sessions.find((s) => s.id === id && s.expiresAt > Date.now());
  if (!session) return null;
  const user = data.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { session, user: publicUser(user) };
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    role: userRole(user.email, user.role),
  };
}

export function workspacePath(userId: string) {
  return join(WORKSPACES, `${userId}.json`);
}

export async function ensureWorkspace(userId: string, inheritLegacy: boolean) {
  await mkdir(WORKSPACES, { recursive: true });
  const dest = workspacePath(userId);
  const exists = await Bun.file(dest).exists();
  if (inheritLegacy && (await Bun.file(LEGACY_STORE).exists())) {
    let empty = !exists;
    if (exists) {
      try {
        const cur = JSON.parse(await Bun.file(dest).text()) as { tasks?: unknown[] };
        empty = !(cur.tasks || []).length;
      } catch {
        empty = true;
      }
    }
    if (empty) await Bun.write(dest, await Bun.file(LEGACY_STORE).text());
    return dest;
  }
  return dest;
}

function captchaSvg(code: string) {
  const chars = [...code];
  const letters = chars
    .map((ch, i) => {
      const x = 18 + i * 28;
      const y = 28 + ((i % 2) * 4 - 2);
      const rot = (i - 1.5) * 11;
      return `<text x="${x}" y="${y}" rotate="${rot}" font-size="22" font-family="ui-monospace,monospace" fill="#1e1712">${ch}</text>`;
    })
    .join("");
  const noise = Array.from({ length: 8 }, (_, i) => {
    const x1 = (i * 17) % 120;
    const y1 = (i * 9) % 44;
    return `<line x1="${x1}" y1="${y1}" x2="${x1 + 20}" y2="${y1 + 8}" stroke="#9c4a38" stroke-opacity="0.25"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="44" viewBox="0 0 130 44" role="img" aria-label="验证码">${noise}${letters}</svg>`;
}

export function issueCaptcha() {
  const answer = String(1000 + Math.floor(Math.random() * 9000));
  const id = token(16);
  const now = Date.now();
  captchas.set(id, { id, answer, expiresAt: now + CAPTCHA_MS, issuedAt: now });
  if (captchas.size > 2000) {
    for (const [k, v] of captchas) {
      if (v.expiresAt < now) captchas.delete(k);
    }
  }
  return { id, svg: captchaSvg(answer) };
}

export function checkCaptcha(id: string, answer: string, honeypot: string, startedAt: number) {
  if (honeypot) return "验证失败，请重试";
  if (Date.now() - startedAt < 800) return "提交太快，请重试";
  const row = captchas.get(id);
  captchas.delete(id);
  if (!row || row.expiresAt < Date.now()) return "验证码过期，请换一张";
  if (String(answer || "").trim() !== row.answer) return "验证码不对";
  return "";
}

export async function registerUser(opts: {
  email: string;
  password: string;
  passwordConfirm?: string;
  captchaId: string;
  captchaAnswer: string;
  honeypot: string;
  startedAt: number;
}) {
  const email = normalizeEmail(opts.email);
  if (!emailOk(email)) return { ok: false as const, error: "邮箱格式不对" };
  const pw = passwordIssue(opts.password, email);
  if (pw) return { ok: false as const, error: pw };
  if (opts.passwordConfirm === undefined || opts.passwordConfirm !== opts.password) {
    return { ok: false as const, error: "两次密码不一致" };
  }
  const cap = checkCaptcha(opts.captchaId, opts.captchaAnswer, opts.honeypot, opts.startedAt);
  if (cap) return { ok: false as const, error: cap };
  const data = await readAccounts();
  if (data.users.some((u) => u.email === email)) return { ok: false as const, error: "这个邮箱已经注册过" };
  const role = userRole(email);
  const user: AuthUser = {
    id: `u_${token(9)}`,
    email,
    passwordHash: await Bun.password.hash(opts.password, { algorithm: "argon2id" }),
    role,
    createdAt: new Date().toISOString(),
    failedLogins: 0,
    lockedUntil: "",
  };
  const inherit = data.users.length === 0 || role === "admin";
  data.users.push(user);
  const session: Session = {
    id: token(24),
    userId: user.id,
    expiresAt: Date.now() + SESSION_MS,
    createdAt: new Date().toISOString(),
  };
  data.sessions.push(session);
  await writeAccounts(data);
  await ensureWorkspace(user.id, inherit);
  return { ok: true as const, user: publicUser(user), sessionId: session.id, inherited: inherit };
}

export async function loginUser(opts: {
  email: string;
  password: string;
  captchaId: string;
  captchaAnswer: string;
  honeypot: string;
  startedAt: number;
}) {
  const cap = checkCaptcha(opts.captchaId, opts.captchaAnswer, opts.honeypot, opts.startedAt);
  if (cap) return { ok: false as const, error: cap };
  const email = normalizeEmail(opts.email);
  const data = await readAccounts();
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    await Bun.password.verify("nope", await timingGuardHash()).catch(() => false);
    return { ok: false as const, error: "邮箱或密码不对" };
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    return { ok: false as const, error: "试得太多，过一刻钟再来" };
  }
  const ok = await Bun.password.verify(opts.password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= LOCK_AFTER) user.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
    await writeAccounts(data);
    return { ok: false as const, error: "邮箱或密码不对" };
  }
  user.failedLogins = 0;
  user.lockedUntil = "";
  user.role = userRole(user.email, user.role);
  data.sessions = data.sessions.filter((s) => s.userId !== user.id || s.expiresAt > Date.now());
  const session: Session = {
    id: token(24),
    userId: user.id,
    expiresAt: Date.now() + SESSION_MS,
    createdAt: new Date().toISOString(),
  };
  data.sessions.push(session);
  await writeAccounts(data);
  await ensureWorkspace(user.id, false);
  return { ok: true as const, user: publicUser(user), sessionId: session.id };
}

export async function logoutUser(req: Request) {
  const id = parseCookie(req);
  if (!id) return;
  const data = await readAccounts();
  data.sessions = data.sessions.filter((s) => s.id !== id);
  await writeAccounts(data);
}
