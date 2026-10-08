// Blob 命名空间名称（首次 getStore 时平台会自动创建）
export const BLOB_STORE_NAME = 'netdisk';

// KV 在控制台绑定命名空间时填写的「变量名」，必须与此一致
export const KV_BINDING_NAME = 'netdisk_kv';

// 登录会话有效期（秒）
export const SESSION_TTL = 7 * 24 * 3600;

// PBKDF2 迭代次数（Edge Functions 单次 CPU 时间有限，过高可能超时）
export const PBKDF2_ITERATIONS = 100000;

// 登录失败锁定：连续失败次数 / 锁定秒数
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_SECONDS = 600;

// 预签名上传 URL 有效期（秒）与单文件大小上限（Blob 免费版单值 25MB）
export const UPLOAD_URL_TTL = 900;
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export const COOKIE_NAME = 'sid';
