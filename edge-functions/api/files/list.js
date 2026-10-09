import { FOLDER_MARK, cleanDir, getBlobStore, getManifest, mapLimit, treePrefix } from '../../../lib/files.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// GET /api/files/list?dir=photos/2024/
export const onRequestGet = route(async ({ request }, username) => {
  const dir = cleanDir(new URL(request.url).searchParams.get('dir'));
  const base = treePrefix(username);

  const store = getBlobStore();
  const { blobs, directories } = await store.list({
    prefix: base + dir,
    directories: true,
    consistency: 'strong',
  });

  const folders = (directories || []).map((d) => {
    const key = d.slice(base.length);
    return { key, name: key.slice(dir.length).replace(/\/$/, '') };
  });

  const fileKeys = (blobs || [])
    .map((b) => b.key.slice(base.length))
    .filter((key) => key.slice(dir.length) && key.slice(dir.length) !== FOLDER_MARK);

  const manifests = await mapLimit(fileKeys, 8, (key) => getManifest(store, username, key));
  const files = [];
  fileKeys.forEach((key, i) => {
    const m = manifests[i];
    if (!m) return;
    files.push({
      key,
      name: key.slice(dir.length),
      size: m.size,
      mtime: m.mtime,
      mime: m.mime,
    });
  });

  return json({ dir, folders, files });
});
