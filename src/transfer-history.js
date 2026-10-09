const storageKey = (username) => `move_home_transfers_${username}`;
const MAX_HISTORY = 60;

export function readTransfers(username) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(username)) || '[]');
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_HISTORY).filter((item) =>
      item && typeof item.uid === 'string' && typeof item.name === 'string' &&
      (item.direction === 'upload' || item.direction === 'download') &&
      typeof item.status === 'string'
    ).map((item) => ({
      ...item,
      status: ['waiting', 'uploading', 'downloading'].includes(item.status) ? 'paused' : item.status,
    }));
  } catch {
    return [];
  }
}

export function saveTransfers(username, list) {
  try {
    // 仅保存小型任务元数据，不把文件字节或登录凭证放进 localStorage
    const data = list.slice(0, MAX_HISTORY).map(({ uid, direction, name, size, dir, key, taskId, modified, status, percent, error, createdAt }) =>
      ({ uid, direction, name, size, dir, key, taskId, modified, status, percent: Math.floor(percent || 0), error, createdAt })
    );
    localStorage.setItem(storageKey(username), JSON.stringify(data));
  } catch {
    // 本地存储禁用或超出配额时，当前会话仍可正常传输
  }
}
