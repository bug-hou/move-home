import { HttpError } from './http.js';
import { getKV } from './kv.js';
import { ID_RE } from './files.js';

const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const sessionKey = (username, id) => `up_${username}_${id}`;

export async function createUploadSession(username, id, details) {
  await getKV().put(sessionKey(username, id), JSON.stringify({ ...details, createdAt: Date.now(), state: 'uploading' }));
}

export async function getUploadSession(username, id, { allowExpired = false } = {}) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, '任务 ID 不合法');
  const session = await getKV().get(sessionKey(username, id), { type: 'json' });
  if (!session || !Number.isFinite(session.createdAt)) throw new HttpError(404, '上传任务不存在');
  if (!allowExpired && session.state !== 'done' && Date.now() - session.createdAt > SESSION_LIFETIME) {
    throw new HttpError(410, '上传任务已过期，请重新上传');
  }
  return session;
}

export async function finishUploadSession(username, id, session, key) {
  await getKV().put(sessionKey(username, id), JSON.stringify({ ...session, state: 'done', key }));
}

export async function removeUploadSession(username, id) {
  await getKV().delete(sessionKey(username, id));
}
