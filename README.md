# Move Home

基于 EdgeOne Makers 的迷你网盘模板：Edge Functions + KV（登录/会话）+ Blob（文件存储）。

## 目录

```
index.html / src/             前端（Vite + React + Ant Design）
edge-functions/api/auth/      register / login / logout / logout-all / me
edge-functions/api/files/     list / mkdir / move / delete / download
                              upload-init / upload-url / upload-complete / upload-abort
lib/                          公共模块（配置、鉴权、路径校验、分片与目录树）
```

## 设计要点

- **KV 仅 Edge Functions 可用**，所以所有接口都放在 `edge-functions/`。
- **登录凭证**：登录/注册返回随机 token，前端存入 `localStorage`，请求带 `Authorization: Bearer`；同时下发 HttpOnly Cookie，供 `<img>`/`<video>`/下载链接使用。KV 只存 token 的 SHA-256（`sess_<hash>`），有效期 180 天，剩余不足一半时自动续期；只有用户手动退出才会清除，另有「退出所有设备」。每个账号最多保留 20 个设备会话。连续失败 5 次锁定 10 分钟。
- **分片存储**：Blob 单个对象上限 25MB（免费版），所以文件按 20MB 切片，每片一个 Blob 对象。浏览器逐片申请预签名 URL 并发直传（3 路并发、失败自动重试），全部完成后调用 `upload-complete` 写入清单，文件才可见。单文件上限见 `lib/config.js` 的 `MAX_FILE_SIZE`（默认 512MB）。
- **目录树与数据分离**：
  - `u/<user>/t/<路径>`：文件 = 清单 JSON（id、大小、分片数、类型、时间）；文件夹 = `<路径>/.folder` 占位对象（Blob 没有空目录）。
  - `u/<user>/d/<id>/<序号>`：文件分片数据。
  - 因此重命名/移动只改清单，不搬运数据；删除时再清理分片。
- **下载/预览**：函数校验登录后，按清单把分片拼成一个流返回，支持 `Range`（视频可拖动进度条）和 `ETag`（未变化返回 304）；仅图片/视频/音频允许 inline，其余强制下载。
- **隔离**：Blob key 由服务端强制加用户前缀，路径禁止 `..` 和保留名 `.folder`。
- KV 最终一致（其他节点最长 60 秒），退出登录后的会话在其他节点可能短暂仍有效。

## 部署步骤

1. `npm install`
2. 控制台开通 KV，创建命名空间，**绑定到项目，变量名填 `netdisk_kv`**（见 `lib/config.js`）。
3. 部署：`edgeone makers deploy`（或推送 Git 仓库触发构建）。
4. 首个注册的账号即管理员，之后注册默认关闭；需开放注册时在项目环境变量设置 `ALLOW_REGISTER=true`。

## 本地开发

```bash
npm install
npm i -g edgeone
edgeone login
edgeone makers link    # 关联项目，使用 KV 并同步环境变量
npm run dev:edge       # 前端 + 接口，http://localhost:8088（等同 edgeone makers dev，会调用 npm run dev）
```

也可单独 `npm run dev`（http://localhost:5173），`/api` 会代理到 8088，需同时运行 `npm run dev:edge`。

## 注册 / 登录报错排查

- 提示「未检测到 KV 绑定」：控制台创建 KV 命名空间并绑定，变量名 `netdisk_kv`；本地需先 `edgeone makers link`。
- 提示「注册已关闭」：首个账号注册后默认关闭注册，直接登录，或设置 `ALLOW_REGISTER=true`。
- 提示「接口不可用 / 接口返回异常」：只启动了 Vite 而没有启动后端，请运行 `npm run dev:edge`。

## 已知限制 / 后续可做

- 存储布局已调整：旧版本直接存放在 `u/<user>/...` 下的文件不会出现在新列表里（需重新上传）。
- 列表需要逐个读取清单来获得大小和时间；单个目录文件特别多时会变慢，可再加目录索引缓存或分页。
- 文件夹重命名/移动/删除会逐个处理对象，一次最多 500 个（`MAX_BATCH_OBJECTS`），超出请分批。
- 上传失败会自动清理已传分片；若浏览器中途被关闭，可能残留孤立分片，占用容量。
- 缩略图直接加载原图（带 ETag 缓存），未做服务端缩图；不支持空文件、断点续传和文件夹整体上传。
- 暂无分享链接、回收站。
