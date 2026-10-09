import { FOLDER_MARK, cleanDir, cleanFileName, getBlobStore, nameTaken, treePrefix } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/files/mkdir  { dir, name }
// Blob 没有空目录，用一个 .folder 占位对象表示文件夹
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const dir = cleanDir(body.dir);
  const name = cleanFileName(body.name);

  const store = getBlobStore();
  if (await nameTaken(store, username, dir, name)) throw new HttpError(409, '已存在同名文件或文件夹');

  const key = `${dir}${name}/`;
  await store.setJSON(treePrefix(username) + key + FOLDER_MARK, { createdAt: Date.now() });
  return json({ key, name });
});
