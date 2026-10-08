import { getStore } from '@edgeone/pages-blob';
import { BLOB_STORE_NAME } from './config.js';
import { HttpError } from './http.js';

// 每个用户只能访问自己的前缀，服务端强制拼接
export const userPrefix = (username) => `u/${username}/`;

const BAD_CHARS = /[\\\u0000-\u001f\u007f]/;

function checkSegments(parts) {
  for (const seg of parts) {
    if (seg === '' || seg === '.' || seg === '..') throw new HttpError(400, '路径不合法');
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

export function cleanFileName(input) {
  if (typeof input !== 'string') throw new HttpError(400, '文件名不合法');
  const name = input.trim();
  if (!name || name.length > 200 || name.includes('/') || BAD_CHARS.test(name) || name === '.' || name === '..') {
    throw new HttpError(400, '文件名不合法');
  }
  return name;
}

export function getBlobStore() {
  return getStore(BLOB_STORE_NAME);
}

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
