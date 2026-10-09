import { getStore } from '@edgeone/pages-blob';
import { BLOB_STORE_NAME, CHUNK_SIZE, MAX_BATCH_OBJECTS, MAX_FILE_SIZE } from './config.js';
import { HttpError } from './http.js';

// ---------------------------------------------------------------------------
// 存储布局（每个用户独立前缀）
//
//   u/<user>/t/<路径>          目录树：文件 = 清单(JSON)，文件夹 = <路径>/.folder 占位对象
//   u/<user>/d/<id>/<序号>     文件数据：按 CHUNK_SIZE 分片，每片一个 Blob 对象
//
// 数据与目录树分离：重命名 / 移动只改清单，不需要搬运数据。
// ---------------------------------------------------------------------------

export const FOLDER_MARK = '.folder';
export const ID_RE = /^[a-f0-9]{32}$/;
export const MAX_CHUNKS = Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE);

const userRoot = (username) => `u/${username}/`;
export const treePrefix = (username) => `${userRoot(username)}t/`;
const dataPrefix = (username) => `${userRoot(username)}d/`;
export const chunkKey = (username, id, index) => `${dataPrefix(username)}${id}/${index}`;

const BAD_CHARS = /[\\\u0000-\u001f\u007f]/;

function checkSegments(parts) {
  for (const seg of parts) {
    if (seg === '' || seg === '.' || seg === '..' || seg === FOLDER_MARK) {
      throw new HttpError(400, '路径不合法');
    }
  }
}

// 目录：'' 或 'a/b/'
export function cleanDir(input) {
  if (input == null || input === '') return '';
  if (typeof input !== 'string' || input.length > 400 || BAD_CHARS.test(input)) {
    throw new HttpError(400, '路径不合法');
  }
  const trimmed = input.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return '';
  checkSegments(trimmed.split('/'));
  return `${trimmed}/`;
}

// 文件 key：'a/b/c.jpg'
export function cleanKey(input) {
  if (typeof input !== 'string' || !input || input.length > 500 || BAD_CHARS.test(input)) {
    throw new HttpError(400, '文件路径不合法');
  }
  const trimmed = input.replace(/^\/+/, '');
  checkSegments(trimmed.split('/'));
  return trimmed;
}

// 文件名 / 文件夹名（单段）
export function cleanFileName(input) {
  if (typeof input !== 'string') throw new HttpError(400, '名称不合法');
  const name = input.trim();
  if (
    !name ||
    name.length > 200 ||
    name.includes('/') ||
    BAD_CHARS.test(name) ||
    name === '.' ||
    name === '..' ||
    name === FOLDER_MARK
  ) {
    throw new HttpError(400, '名称不合法');
  }
  return name;
}

export const splitKey = (key) => {
  const i = key.lastIndexOf('/');
  return { dir: key.slice(0, i + 1), name: key.slice(i + 1) };
};

// 'a/b/' -> { dir: 'a/', name: 'b' }
export const splitDir = (dir) => splitKey(dir.replace(/\/$/, ''));

export function getBlobStore() {
  return getStore(BLOB_STORE_NAME);
}

export function newId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 有限并发的 map，避免一次性发起过多子请求
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- 清单 ----------

export async function getManifest(store, username, key) {
  const m = await store.get(treePrefix(username) + key, { type: 'json', consistency: 'strong' });
  return m && typeof m === 'object' && ID_RE.test(m.id ?? '') ? m : null;
}

export async function putManifest(store, username, key, manifest) {
  await store.setJSON(treePrefix(username) + key, manifest);
}

export async function dirExists(store, username, dir) {
  if (!dir) return true;
  const { blobs, directories } = await store.list({
    prefix: treePrefix(username) + dir,
    directories: true,
    limit: 1,
    consistency: 'strong',
  });
  return (blobs?.length ?? 0) > 0 || (directories?.length ?? 0) > 0;
}

// 同一目录下，文件名与文件夹名不能重复
export async function nameTaken(store, username, dir, name) {
  if (await store.get(treePrefix(username) + dir + name, { type: 'text', consistency: 'strong' })) return true;
  return dirExists(store, username, `${dir}${name}/`);
}

// 重名时自动加序号：a.jpg -> a (1).jpg
export async function uniqueName(store, username, dir, name) {
  if (!(await nameTaken(store, username, dir, name))) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i <= 99; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await nameTaken(store, username, dir, candidate))) return candidate;
  }
  throw new HttpError(409, '同名文件过多，请先重命名');
}

// 列出某前缀下所有对象（平铺），超过上限直接拒绝
export async function listAll(store, username, prefix, cap = MAX_BATCH_OBJECTS) {
  const { blobs } = await store.list({
    prefix: treePrefix(username) + prefix,
    limit: cap + 1,
    consistency: 'strong',
  });
  const keys = (blobs || []).map((b) => b.key.slice(treePrefix(username).length));
  if (keys.length > cap) throw new HttpError(413, `一次最多处理 ${cap} 个对象，请分批操作`);
  return keys;
}

export async function deleteChunks(store, username, manifest) {
  const indexes = Array.from({ length: manifest.chunks }, (_, i) => i);
  await mapLimit(indexes, 6, (i) => store.delete(chunkKey(username, manifest.id, i)).catch(() => {}));
}

// ---------- 下载：把多个分片拼成一个流，支持 Range ----------

// 输出清单所描述文件的 [start, end) 字节区间
export function chunkedStream(store, username, manifest, start, end) {
  const { chunkSize, id, chunks } = manifest;
  let index = Math.floor(start / chunkSize);
  let pos = start;
  let skip = 0;
  let reader = null;

  return new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          if (pos >= end) {
            await reader?.cancel().catch(() => {});
            controller.close();
            return;
          }
          if (!reader) {
            if (index >= chunks) throw new Error('文件分片缺失');
            const stream = await store.get(chunkKey(username, id, index), { type: 'stream', consistency: 'strong' });
            if (!stream) throw new Error('文件分片缺失');
            reader = stream.getReader();
            skip = pos - index * chunkSize;
          }
          const { done, value } = await reader.read();
          if (done) {
            reader = null;
            index += 1;
            continue;
          }
          let part = value;
          if (skip > 0) {
            if (skip >= part.length) {
              skip -= part.length;
              continue;
            }
            part = part.subarray(skip);
            skip = 0;
          }
          if (part.length > end - pos) part = part.subarray(0, end - pos);
          pos += part.length;
          controller.enqueue(part);
          return;
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      return reader?.cancel().catch(() => {});
    },
  });
}

// 解析单段 Range；返回 null 表示没有 Range，抛 416 表示不可满足
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) throw new HttpError(416, '范围不合法');
    start = Math.max(0, size - suffix);
    end = size;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size : Math.min(Number(m[2]) + 1, size);
  }
  if (start >= size || start >= end) throw new HttpError(416, '范围不合法');
  return { start, end };
}

// ---------- MIME ----------

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
};

export function guessMime(name) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] || 'application/octet-stream';
}

// 只有图片/视频/音频允许在浏览器内联预览，其余一律强制下载，避免上传 HTML 造成 XSS
export function canInline(mime) {
  return /^(image|video|audio)\//.test(mime);
}
