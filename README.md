# Move Home

基于 EdgeOne Makers 的迷你网盘模板：Edge Functions + KV（登录/会话）+ Blob（文件存储）。

## 目录

```
index.html / src/             前端（Vite + React + Ant Design，简约风格）
edge-functions/api/auth/      register / login / logout / me
edge-functions/api/files/     list / upload-url / download / delete
lib/                          公共模块（配置、鉴权、路径校验）
```

## 设计要点

- **KV 仅 Edge Functions 可用**，所以所有接口都放在 `edge-functions/`。
- **登录**：PBKDF2 哈希密码存 KV（`user_<name>`）；会话 token 随机生成，KV 只存其 SHA-256（`sess_<hash>`），Cookie 为 HttpOnly + SameSite=Lax；连续失败 5 次锁定 10 分钟。
- **上传**：Edge 请求体上限 1MB，因此浏览器通过 `createUploadUrl` 签发的预签名 URL 直传 Blob。
- **下载/预览**：函数校验登录后流式返回 Blob；仅图片/视频/音频允许 inline，其余强制下载。
- **隔离**：Blob key 由服务端强制加前缀 `u/<username>/`，路径禁止 `..`。
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

- 列表只有文件名（Blob list 不返回大小/时间）；如需展示可把元数据另存 KV。
- 下载未实现 Range，视频拖动进度条能力有限。
- 单文件大小仅前端 + 签发时校验（预签名 URL 无法限制实际大小）；免费版 Blob 单值 25MB、总容量 1GB。
- 暂无重命名、移动、分享链接、回收站。
