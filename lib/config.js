// Blob 命名空间名称（首次 getStore 时平台会自动创建）
export const BLOB_STORE_NAME = 'netdisk';

// KV 在控制台绑定命名空间时填写的「变量名」，必须与此一致
export const KV_BINDING_NAME = 'netdisk_kv';

// 登录凭证有效期（秒）：用户不主动退出时长期有效，剩余不足一半时自动续期
export const SESSION_TTL = 180 * 24 * 3600;
// 单个账号最多同时保留的登录设备数，超出后淘汰最早的
export const SESSION_MAX_PER_USER = 20;

// PBKDF2 迭代次数（Edge Functions 单次 CPU 时间有限，过高可能超时）
export const PBKDF2_ITERATIONS = 100000;

// 登录失败锁定：连续失败次数 / 锁定秒数
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_SECONDS = 600;

// 预签名上传 URL 有效期（秒）
export const UPLOAD_URL_TTL = 900;

// 分片上传：Blob 免费版单个对象上限 25MB，所以大文件拆成 20MB 一片分别存储
export const CHUNK_SIZE = 20 * 1024 * 1024;
// 单文件大小上限（免费版 Blob 总容量 1GB，请按自己的配额调整）
export const MAX_FILE_SIZE = 512 * 1024 * 1024;

// 批量/文件夹操作一次最多处理的 Blob 对象数（避免超出 Edge Functions 的子请求与时长限制）
export const MAX_BATCH_OBJECTS = 500;

export const COOKIE_NAME = 'sid';
