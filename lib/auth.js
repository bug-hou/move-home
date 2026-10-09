import {
  COOKIE_NAME,
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_FAILS,
  PBKDF2_ITERATIONS,
  SESSION_TTL,
} from './config.js';
import { HttpError } from './http.js';
import { getKV } from './kv.js';

const enc = new TextEncoder();

// KV key 仅允许 数字/字母/下划线，所以用户名同样限制
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return toHex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256,
    ),
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt: toHex(salt), hash, iterations: PBKDF2_ITERATIONS };
}

async function verifyPassword(password, record) {
  const hash = await pbkdf2(password, fromHex(record.salt), record.iterations);
  return safeEqual(hash, record.hash);
}

export function normalizeUsername(input) {
  const name = String(input ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new HttpError(400, '用户名需为 3-20 位小写字母、数字或下划线');
  }
  return name;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, '密码长度需为 8-128 位');
  }
  return password;
}

// ---------- 用户 ----------

export async function getUser(username) {
  return getKV().get(`user_${username}`, { type: 'json' });
}

export async function createUser(username, password) {
  const kv = getKV();
  const { salt, hash, iterations } = await hashPassword(password);
  await kv.put(
    `user_${username}`,
    JSON.stringify({ salt, hash, iterations, createdAt: Date.now() }),
  );
}

export async function hasAnyUser(log = () => {}) {
  const kv = getKV();
  log('KV 绑定已获取', { getMethod: typeof kv.get, putMethod: typeof kv.put, listMethod: typeof kv.list });
  log('KV list 调用', { prefix: 'user_', limit: 1 });
  const res = await kv.list({ prefix: 'user_', limit: 1 });
  const keys = Array.isArray(res) ? res : res?.keys;
  const resultType = res === null ? 'null' : Array.isArray(res) ? 'array' : typeof res;
  const keysType = typeof res?.keys;
  const dataType = typeof res?.data;
  const complete = typeof res?.complete === 'boolean' ? String(res.complete) : typeof res?.complete;
  const cursorType = res?.cursor === null ? 'null' : typeof res?.cursor;
  const cursorEmpty = res?.cursor === '';
  const errorType = typeof res?.error;
  const codeType = typeof res?.code;
  log('KV list 返回', {
    resultType,
    keysType,
    dataType,
    keysIsArray: Array.isArray(keys),
    keysCount: Array.isArray(keys) ? keys.length : null,
    complete,
    cursorType,
    cursorEmpty,
    errorType,
    codeType,
  });
  if (!Array.isArray(keys)) {
    throw new Error(`KV list 返回格式异常（resultType=${resultType}, keysType=${keysType}, complete=${complete}, cursor=${cursorType}, cursorEmpty=${cursorEmpty}, errorType=${errorType}, codeType=${codeType}）`);
  }
  return keys.length > 0;
}

// 校验账号密码，失败抛 HttpError；带简单的失败次数锁定
export async function verifyLogin(username, password) {
  const kv = getKV();
  const failKey = `fail_${username}`;
  const fail = (await kv.get(failKey, { type: 'json' })) || { count: 0, until: 0 };
  if (fail.until > Date.now()) {
    throw new HttpError(429, '尝试次数过多，请稍后再试');
  }

  const record = await getUser(username);
  // 用户不存在时也做一次哈希，降低通过响应时间枚举用户名的可能
  const ok = record
    ? await verifyPassword(password, record)
    : (await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS), false);

  if (!ok) {
    const count = fail.count + 1;
    const locked = count >= LOGIN_MAX_FAILS;
    await kv.put(
      failKey,
      JSON.stringify({ count: locked ? 0 : count, until: locked ? Date.now() + LOGIN_LOCK_SECONDS * 1000 : 0 }),
    );
    throw new HttpError(401, '用户名或密码错误');
  }
  if (fail.count > 0) await kv.delete(failKey);
}

// ---------- 会话 ----------

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function buildCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// 返回需要写入响应头的 Set-Cookie
export async function createSession(request, username) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  // KV 里只存 token 的哈希，即使 KV 数据泄露也无法直接冒用会话
  await getKV().put(
    `sess_${await sha256Hex(token)}`,
    JSON.stringify({ username, exp: Date.now() + SESSION_TTL * 1000 }),
  );
  return buildCookie(request, token, SESSION_TTL);
}

export async function getSessionUser(request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const kv = getKV();
  const key = `sess_${await sha256Hex(token)}`;
  const sess = await kv.get(key, { type: 'json' });
  if (!sess) return null;
  if (sess.exp < Date.now()) {
    await kv.delete(key);
    return null;
  }
  return sess.username;
}

// 返回清除 Cookie 的 Set-Cookie
export async function destroySession(request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await getKV().delete(`sess_${await sha256Hex(token)}`);
  }
  return buildCookie(request, '', 0);
}
