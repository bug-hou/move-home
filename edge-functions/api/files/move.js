import {
  cleanDir,
  cleanFileName,
  cleanKey,
  getBlobStore,
  getManifest,
  listAll,
  mapLimit,
  nameTaken,
  putManifest,
  splitDir,
  splitKey,
  treePrefix,
} from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

const MAX_MOVES = 100;

async function moveFile(store, username, rawFrom, rawTo) {
  const from = cleanKey(rawFrom);
  const to = cleanKey(rawTo);
  if (from === to) return;
  const target = splitKey(to);
  cleanFileName(target.name);

  const manifest = await getManifest(store, username, from);
  if (!manifest) throw new HttpError(404, '文件不存在');
  if (await nameTaken(store, username, target.dir, target.name)) throw new HttpError(409, '目标位置已存在同名项目');

  // 数据分片不动，只改清单所在的路径
  await putManifest(store, username, to, manifest);
  await store.delete(treePrefix(username) + from);
}

async function moveFolder(store, username, rawFrom, rawTo) {
  const from = cleanDir(rawFrom);
  const to = cleanDir(rawTo);
  if (!from || !to) throw new HttpError(400, '路径不合法');
  if (from === to) return;
  if (to.startsWith(from)) throw new HttpError(400, '不能把文件夹移动到它自己里面');
  const target = splitDir(to);
  cleanFileName(target.name);

  const keys = await listAll(store, username, from);
  if (keys.length === 0) throw new HttpError(404, '文件夹不存在');
  if (await nameTaken(store, username, target.dir, target.name)) throw new HttpError(409, '目标位置已存在同名项目');

  const base = treePrefix(username);
  await mapLimit(keys, 8, async (key) => {
    const text = await store.get(base + key, { type: 'text', consistency: 'strong' });
    if (text !== null) await store.set(base + to + key.slice(from.length), text);
  });
  await mapLimit(keys, 8, (key) => store.delete(base + key));
}

// POST /api/files/move  { moves: [{ type: 'file'|'folder', from, to }] }
// 重命名 = 在同一目录内移动；文件夹用以 / 结尾的目录路径
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const moves = Array.isArray(body.moves) ? body.moves : [];
  if (moves.length === 0 || moves.length > MAX_MOVES) throw new HttpError(400, `一次最多移动 ${MAX_MOVES} 项`);

  const store = getBlobStore();
  const failed = [];
  let ok = 0;
  // 逐项顺序执行：同一批里可能有互相影响的路径，也避免瞬时并发过高
  for (const m of moves) {
    try {
      if (m?.type === 'folder') await moveFolder(store, username, m.from, m.to);
      else if (m?.type === 'file') await moveFile(store, username, m.from, m.to);
      else throw new HttpError(400, '类型不合法');
      ok += 1;
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      failed.push({ from: m?.from, error: err instanceof HttpError ? err.message : '移动失败' });
    }
  }
  return json({ ok, failed });
});
