import {
  FOLDER_MARK,
  addUsage,
  cleanDir,
  cleanKey,
  deleteChunks,
  getBlobStore,
  getManifest,
  listAll,
  mapLimit,
  treePrefix,
} from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

const MAX_ITEMS = 100;

// 返回释放的字节数
async function deleteFile(store, username, rawKey) {
  const key = cleanKey(rawKey);
  const manifest = await getManifest(store, username, key);
  // 先删清单（文件立刻从列表消失），再清理分片
  await store.delete(treePrefix(username) + key);
  if (!manifest) return 0;
  await deleteChunks(store, username, manifest);
  return manifest.size ?? 0;
}

async function deleteFolder(store, username, rawDir) {
  const dir = cleanDir(rawDir);
  if (!dir) throw new HttpError(400, '路径不合法');
  const keys = await listAll(store, username, dir);
  const base = treePrefix(username);

  const manifests = await mapLimit(keys, 8, (key) =>
    key.split('/').pop() === FOLDER_MARK ? null : getManifest(store, username, key),
  );
  await mapLimit(keys, 8, (key) => store.delete(base + key));
  let freed = 0;
  for (const m of manifests) {
    if (!m) continue;
    await deleteChunks(store, username, m);
    freed += m.size ?? 0;
  }
  return freed;
}

// POST /api/files/delete  { items: [{ type: 'file'|'folder', key }] }
// 文件夹会递归删除其中所有内容
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0 || items.length > MAX_ITEMS) throw new HttpError(400, `一次最多删除 ${MAX_ITEMS} 项`);

  const store = getBlobStore();
  const failed = [];
  let ok = 0;
  let freed = 0;
  for (const item of items) {
    try {
      if (item?.type === 'folder') freed += await deleteFolder(store, username, item.key);
      else if (item?.type === 'file') freed += await deleteFile(store, username, item.key);
      else throw new HttpError(400, '类型不合法');
      ok += 1;
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      failed.push({ key: item?.key, error: err instanceof HttpError ? err.message : '删除失败' });
    }
  }
  await addUsage(username, -freed);
  return json({ ok, failed });
});
