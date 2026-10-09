export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// ---------- 登录凭证（localStorage，用户手动退出才清除） ----------

const TOKEN_KEY = 'move_home_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 隐私模式等场景下 localStorage 不可用，仍可依赖 Cookie 登录
  }
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('网络异常，请检查网络后重试', 0);
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // 返回的不是 JSON（例如接口未启动时前端返回了 HTML）
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      setToken(null);
      onUnauthorized();
    }
    const fallback =
      res.status === 404
        ? '接口不可用：请使用 edgeone makers dev 启动后端后再试'
        : `请求失败 (${res.status})`;
    const msg = data.error ? (data.detail ? `${data.error}（${data.detail}）` : data.error) : fallback;
    throw new ApiError(msg, res.status);
  }
  if (text && !Object.keys(data).length && !/^\s*[{[]/.test(text)) {
    throw new ApiError('接口返回异常：请使用 edgeone makers dev 启动后端后再试', res.status);
  }
  return data;
}

// <img>/<video>/下载链接无法携带 Authorization，依赖登录时下发的 HttpOnly Cookie
export const fileUrl = (key, inline) =>
  `/api/files/download?key=${encodeURIComponent(key)}${inline ? '&inline=1' : ''}`;

export const MAX_SIZE = 512 * 1024 * 1024;

const IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
const VIDEO = ['mp4', 'webm', 'mov'];
const AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

export function previewType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (IMG.includes(ext)) return 'img';
  if (VIDEO.includes(ext)) return 'video';
  if (AUDIO.includes(ext)) return 'audio';
  return null;
}

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 直传预签名 URL，带进度
function putChunk(url, contentType, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`上传失败 (${xhr.status})`));
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(blob);
  });
}

const CHUNK_CONCURRENCY = 3;
const CHUNK_RETRIES = 3;

async function uploadChunk(id, index, blob, onProgress) {
  let lastError;
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
    onProgress(0);
    try {
      // 每次尝试都重新申请预签名地址，避免大文件上传期间地址过期
      const { url, contentType } = await api('/api/files/upload-url', {
        method: 'POST',
        body: { id, index },
      });
      await putChunk(url, contentType, blob, onProgress);
      return;
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) break;
    }
  }
  throw lastError;
}

// 分片上传：Blob 单个对象有大小上限，文件按服务端给出的分片大小切开，分片并发直传，最后提交清单
export async function uploadFile(file, dir, onProgress) {
  const { id, chunkSize, chunks } = await api('/api/files/upload-init', {
    method: 'POST',
    body: { dir, name: file.name, size: file.size },
  });

  const loaded = new Array(chunks).fill(0);
  const report = () => onProgress?.(Math.min(99, (loaded.reduce((a, b) => a + b, 0) / file.size) * 100));
  let next = 0;
  let error = null;

  const worker = async () => {
    while (!error && next < chunks) {
      const index = next++;
      const blob = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
      try {
        await uploadChunk(id, index, blob, (n) => {
          loaded[index] = n;
          report();
        });
        loaded[index] = blob.size;
        report();
      } catch (e) {
        error ??= e;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks) }, worker));

  try {
    if (error) throw error;
    return await api('/api/files/upload-complete', {
      method: 'POST',
      body: { id, dir, name: file.name, size: file.size },
    });
  } catch (e) {
    api('/api/files/upload-abort', { method: 'POST', body: { id, chunks } }).catch(() => {});
    throw e;
  }
}
