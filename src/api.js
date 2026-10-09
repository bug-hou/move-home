export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
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
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
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

export const fileUrl = (key, inline) =>
  `/api/files/download?key=${encodeURIComponent(key)}${inline ? '&inline=1' : ''}`;

export const MAX_SIZE = 25 * 1024 * 1024;

export function previewType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) return 'img';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
  return null;
}

// 直传预签名 URL，带进度
export function putFile(url, contentType, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`上传失败 (${xhr.status})`));
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(file);
  });
}
