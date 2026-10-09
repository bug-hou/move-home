import {
  AppstoreOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderFilled,
  LeftOutlined,
  LogoutOutlined,
  MoreOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  RightOutlined,
  SearchOutlined,
  SoundOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SIZE, api, fileUrl, formatSize, formatTime, previewType, uploadFile } from '../api.js';
import Brand from '../components/Brand.jsx';
import MoveModal from '../components/MoveModal.jsx';

const ICONS = { img: <PictureOutlined />, video: <PlayCircleOutlined />, audio: <SoundOutlined /> };
const FILE_LABELS = { img: '照片', video: '视频', audio: '音频' };

const SORTS = [
  { value: 'name_asc', label: '名称 A→Z', field: 'name', mul: 1 },
  { value: 'name_desc', label: '名称 Z→A', field: 'name', mul: -1 },
  { value: 'mtime_desc', label: '最新上传', field: 'mtime', mul: -1 },
  { value: 'mtime_asc', label: '最早上传', field: 'mtime', mul: 1 },
  { value: 'size_desc', label: '文件最大', field: 'size', mul: -1 },
  { value: 'size_asc', label: '文件最小', field: 'size', mul: 1 },
];

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function sortItems(items, sortValue) {
  const { field, mul } = SORTS.find((s) => s.value === sortValue) ?? SORTS[0];
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const primary = a.type === 'file' && field !== 'name' ? (a[field] - b[field]) * mul : 0;
    return primary || collator.compare(a.name, b.name) * (field === 'name' ? mul : 1);
  });
}

const VIEW_KEY = 'move_home_view';
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

function FileGlyph({ type, large }) {
  const kind = type === 'folder' ? 'folder' : previewType(type) || 'file';
  return (
    <span className={`file-glyph file-glyph--${kind}${large ? ' file-glyph--large' : ''}`} aria-hidden="true">
      {kind === 'folder' ? <FolderFilled /> : ICONS[kind] || <FileOutlined />}
    </span>
  );
}

function triggerDownload(key) {
  const a = document.createElement('a');
  a.href = fileUrl(key, false);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const itemMeta = (r) =>
  r.type === 'folder' ? '文件夹' : [formatSize(r.size), formatTime(r.mtime)].filter(Boolean).join(' · ');

export default function FilesPage({ username, onLogout }) {
  const { message, modal } = AntApp.useApp();
  const [dir, setDir] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [previewKey, setPreviewKey] = useState(null);
  const [view, setView] = useState(readView);
  const [sort, setSort] = useState('name_asc');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moving, setMoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef({ chain: Promise.resolve(), pending: 0 });
  const dirRef = useRef(dir);
  const loadSeq = useRef(0);

  const load = useCallback(
    async (target) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      try {
        const data = await api(`/api/files/list?dir=${encodeURIComponent(target)}`);
        if (seq !== loadSeq.current) return;
        setItems([
          ...data.folders.map((f) => ({ ...f, type: 'folder' })),
          ...data.files.map((f) => ({ ...f, type: 'file' })),
        ]);
        setSelected([]);
      } catch (e) {
        if (seq === loadSeq.current) message.error(e.message);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    dirRef.current = dir;
    setSearch('');
    load(dir);
  }, [dir, load]);

  const changeView = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 忽略
    }
  };

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const filtered = kw ? items.filter((i) => i.name.toLowerCase().includes(kw)) : items;
    return sortItems(filtered, sort);
  }, [items, search, sort]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const selectedItems = selected.map((k) => byKey.get(k)).filter(Boolean);
  const previewables = useMemo(
    () => visible.filter((i) => i.type === 'file' && previewType(i.name)),
    [visible],
  );
  const previewIndex = previewables.findIndex((i) => i.key === previewKey);
  const previewItem = previewIndex >= 0 ? previewables[previewIndex] : null;

  // ---------- 操作 ----------

  const reportBatch = (res, doneText) => {
    if (res.failed.length) {
      message.warning(`${doneText} ${res.ok} 项，${res.failed.length} 项失败：${res.failed[0].error}`);
    } else {
      message.success(`${doneText} ${res.ok} 项`);
    }
  };

  const remove = (targets) => {
    if (!targets.length) return;
    const hasFolder = targets.some((t) => t.type === 'folder');
    modal.confirm({
      title: targets.length === 1 ? `确定删除「${targets[0].name}」？` : `确定删除选中的 ${targets.length} 项？`,
      content: hasFolder ? '文件夹内的所有内容也会被一并删除，且无法恢复。' : '删除后无法恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await api('/api/files/delete', {
            method: 'POST',
            body: { items: targets.map((t) => ({ type: t.type, key: t.key })) },
          });
          reportBatch(res, '已删除');
        } catch (e) {
          message.error(e.message);
        }
        load(dirRef.current);
      },
    });
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    if (/[/\\]/.test(name) || name === '.' || name === '..') {
      message.warning('名称不能包含 / 或 \\');
      return;
    }
    setBusy(true);
    try {
      await api('/api/files/mkdir', { method: 'POST', body: { dir, name } });
      setFolderOpen(false);
      setFolderName('');
      message.success('文件夹已创建');
      load(dir);
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openRename = (item) => {
    setRenaming(item);
    setRenameValue(item.name);
  };

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name || !renaming) return;
    if (/[/\\]/.test(name) || name === '.' || name === '..') {
      message.warning('名称不能包含 / 或 \\');
      return;
    }
    if (name === renaming.name) {
      setRenaming(null);
      return;
    }
    const isFolder = renaming.type === 'folder';
    setBusy(true);
    try {
      const res = await api('/api/files/move', {
        method: 'POST',
        body: {
          moves: [{ type: renaming.type, from: renaming.key, to: `${dir}${name}${isFolder ? '/' : ''}` }],
        },
      });
      if (res.failed.length) throw new Error(res.failed[0].error);
      setRenaming(null);
      message.success('已重命名');
      load(dir);
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitMove = async (toDir) => {
    const targets = moving;
    try {
      const res = await api('/api/files/move', {
        method: 'POST',
        body: {
          moves: targets.map((t) => ({
            type: t.type,
            from: t.key,
            to: `${toDir}${t.name}${t.type === 'folder' ? '/' : ''}`,
          })),
        },
      });
      reportBatch(res, '已移动');
      setMoving(null);
      load(dirRef.current);
    } catch (e) {
      message.error(e.message);
    }
  };

  const openItem = (item) => {
    if (item.type === 'folder') setDir(item.key);
    else if (previewType(item.name)) setPreviewKey(item.key);
    else triggerDownload(item.key);
  };

  const rowMenu = (item) => ({
    items: [
      ...(item.type === 'file'
        ? [
            ...(previewType(item.name) ? [{ key: 'open', label: '预览', icon: <PictureOutlined /> }] : []),
            { key: 'download', label: '下载', icon: <DownloadOutlined /> },
          ]
        : [{ key: 'open', label: '打开', icon: <FolderFilled /> }]),
      { key: 'rename', label: '重命名', icon: <EditOutlined /> },
      { key: 'move', label: '移动到…', icon: <ExportOutlined /> },
      { type: 'divider' },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'open') openItem(item);
      else if (key === 'download') triggerDownload(item.key);
      else if (key === 'rename') openRename(item);
      else if (key === 'move') setMoving([item]);
      else if (key === 'delete') remove([item]);
    },
  });

  const toggleSelect = (key, checked) =>
    setSelected((list) => (checked ? [...new Set([...list, key])] : list.filter((k) => k !== key)));

  const allChecked = visible.length > 0 && visible.every((i) => selected.includes(i.key));
  const toggleAll = (checked) => setSelected(checked ? visible.map((i) => i.key) : []);

  // ---------- 上传 ----------

  const patchUpload = (uid, patch) =>
    setUploads((list) => list.map((u) => (u.uid === uid ? { ...u, ...patch } : u)));

  const uploadOne = async (file, targetDir) => {
    const uid = file.uid;
    setUploads((list) => [...list, { uid, name: file.name, status: 'uploading', percent: 0 }]);
    try {
      if (file.size > MAX_SIZE) throw new Error(`超过 ${MAX_SIZE / 1024 / 1024}MB`);
      await uploadFile(file, targetDir, (percent) => patchUpload(uid, { percent }));
      patchUpload(uid, { status: 'done', percent: 100 });
      setTimeout(() => setUploads((list) => list.filter((u) => u.uid !== uid)), 2000);
    } catch (e) {
      patchUpload(uid, { status: 'error', error: e.message });
    }
  };

  // 逐个文件上传（单个文件内部分片并发），全部结束后刷新一次
  const beforeUpload = (file) => {
    const targetDir = dirRef.current;
    const q = queue.current;
    q.pending += 1;
    q.chain = q.chain.then(async () => {
      await uploadOne(file, targetDir);
      q.pending -= 1;
      if (q.pending === 0 && dirRef.current === targetDir) load(targetDir);
    });
    return false;
  };

  // ---------- 渲染 ----------

  const crumbs = [
    { title: dir ? <button type="button" className="crumb-link" onClick={() => setDir('')}>全部素材</button> : '全部素材' },
    ...dir
      .split('/')
      .filter(Boolean)
      .map((seg, i, arr) => {
        const target = `${arr.slice(0, i + 1).join('/')}/`;
        return { title: i === arr.length - 1 ? seg : <button type="button" className="crumb-link" onClick={() => setDir(target)}>{seg}</button> };
      }),
  ];
  const parentDir = dir.replace(/[^/]+\/$/, '');

  const moreButton = (item) => (
    <Dropdown menu={rowMenu(item)} trigger={['click']} placement="bottomRight">
      <Button type="text" icon={<MoreOutlined />} aria-label={`更多操作 ${item.name}`} />
    </Dropdown>
  );

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name, r) => (
        <Button type="link" className="link-btn" onClick={() => openItem(r)}>
          <span className="name-cell">
            <FileGlyph type={r.type === 'folder' ? 'folder' : name} />
            <span className="file-name" title={name}>{name}</span>
          </span>
        </Button>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 110,
      render: (size, r) => <span className="cell-muted">{r.type === 'folder' ? '—' : formatSize(size)}</span>,
    },
    {
      title: '上传时间',
      dataIndex: 'mtime',
      width: 160,
      responsive: ['lg'],
      render: (t, r) => <span className="cell-muted">{r.type === 'folder' ? '—' : formatTime(t)}</span>,
    },
    {
      title: '操作',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Space size={0}>
          {r.type === 'file' && (
            <Button type="text" icon={<DownloadOutlined />} title="下载" onClick={() => triggerDownload(r.key)} />
          )}
          {moreButton(r)}
        </Space>
      ),
    },
  ];

  const emptyText = search ? '没有匹配的内容' : '这里还没有素材';

  return (
    <>
      <header className="app-header">
        <Brand compact />
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'out', label: '退出登录', icon: <LogoutOutlined /> },
              { key: 'all', label: '退出所有设备', icon: <LogoutOutlined />, danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'out') onLogout(false);
              else {
                modal.confirm({
                  title: '退出所有设备？',
                  content: '该账号在所有设备上的登录都会失效，需要重新登录。',
                  okText: '退出所有设备',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => onLogout(true),
                });
              }
            },
          }}
        >
          <Button type="text" className="app-logout" aria-label="账号菜单">
            <Typography.Text className="app-username">{username}</Typography.Text>
            <DownOutlined className="app-user-caret" />
            <LogoutOutlined className="app-logout-icon" />
          </Button>
        </Dropdown>
      </header>

      <main className="app-main">
        <div className="app-heading">
          <p className="app-eyebrow">YOUR JOURNEY, SAFELY KEPT</p>
          <h1>我的旅途素材</h1>
          <p>把路上的好风景，留在这里。</p>
        </div>

        <div className="upload-zone">
          <Upload.Dragger multiple showUploadList={false} beforeUpload={beforeUpload} openFileDialogOnClick>
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p className="ant-upload-text"><span className="upload-desktop-text">点击或拖拽文件，收藏这一程的风景</span><span className="upload-mobile-text">点击上传旅途素材</span></p>
            <p className="ant-upload-hint">单文件不超过 {MAX_SIZE / 1024 / 1024}MB，大文件自动分片上传 · 图片、视频和音频可预览</p>
          </Upload.Dragger>
          {uploads.length > 0 && (
            <div className="upload-list">
              {uploads.map((u) => (
                <div className="upload-item" key={u.uid}>
                  <div className="upload-item-head">
                    <span className="file-name" title={u.name}>{u.name}</span>
                    {u.status === 'error' && (
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        aria-label="移除"
                        onClick={() => setUploads((list) => list.filter((x) => x.uid !== u.uid))}
                      />
                    )}
                  </div>
                  <Progress
                    percent={Math.round(u.percent)}
                    size="small"
                    status={u.status === 'error' ? 'exception' : u.status === 'done' ? 'success' : 'active'}
                  />
                  {u.status === 'error' && <small className="upload-error">{u.error}</small>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar">
          <div className="toolbar-path">
            {dir && (
              <Button type="text" icon={<LeftOutlined />} aria-label="返回上一级" onClick={() => setDir(parentDir)} />
            )}
            <div className="crumbs-scroll"><Breadcrumb items={crumbs} /></div>
          </div>
          <div className="toolbar-actions">
            <Input
              allowClear
              className="toolbar-search"
              prefix={<SearchOutlined />}
              placeholder="搜索当前文件夹"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              className="toolbar-sort"
              value={sort}
              onChange={setSort}
              options={SORTS.map(({ value, label }) => ({ value, label }))}
              aria-label="排序方式"
            />
            <Segmented
              value={view}
              onChange={changeView}
              options={[
                { value: 'list', icon: <UnorderedListOutlined />, label: <span className="sr-only">列表视图</span> },
                { value: 'grid', icon: <AppstoreOutlined />, label: <span className="sr-only">网格视图</span> },
              ]}
            />
            <Button className="new-folder-btn" icon={<FolderAddOutlined />} onClick={() => setFolderOpen(true)}>
              新建文件夹
            </Button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="selection-bar" role="toolbar" aria-label="批量操作">
            <Checkbox checked={allChecked} onChange={(e) => toggleAll(e.target.checked)}>
              已选 {selected.length} 项
            </Checkbox>
            <Space size={4}>
              <Button icon={<ExportOutlined />} onClick={() => setMoving(selectedItems)}>移动到</Button>
              <Button danger icon={<DeleteOutlined />} onClick={() => remove(selectedItems)}>删除</Button>
              <Button type="text" onClick={() => setSelected([])}>取消选择</Button>
            </Space>
          </div>
        )}

        <section className="files-section" aria-label="素材列表">
          <div className="files-section-heading">
            <h2>素材列表</h2>
            <span>{visible.length} 项</span>
            {view === 'grid' && visible.length > 0 && selected.length === 0 && (
              <Checkbox className="grid-select-all" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)}>
                全选
              </Checkbox>
            )}
          </div>

          {view === 'grid' ? (
            <Spin spinning={loading}>
              {visible.length === 0 ? (
                <div className="panel"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /></div>
              ) : (
                <div className="file-grid">
                  {visible.map((r) => {
                    const kind = r.type === 'folder' ? 'folder' : previewType(r.name);
                    const checked = selected.includes(r.key);
                    return (
                      <div className={`grid-card${checked ? ' is-selected' : ''}`} key={r.key}>
                        <Checkbox
                          className="grid-check"
                          checked={checked}
                          aria-label={`选择 ${r.name}`}
                          onChange={(e) => toggleSelect(r.key, e.target.checked)}
                        />
                        <div className="grid-more">{moreButton(r)}</div>
                        <button type="button" className="grid-thumb" onClick={() => openItem(r)} aria-label={r.name}>
                          {kind === 'img' ? (
                            <img src={fileUrl(r.key, true)} alt="" loading="lazy" />
                          ) : (
                            <FileGlyph type={r.type === 'folder' ? 'folder' : r.name} large />
                          )}
                        </button>
                        <div className="grid-meta">
                          <span className="file-name" title={r.name}>{r.name}</span>
                          <small>{itemMeta(r)}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Spin>
          ) : (
            <div className="panel">
              <div className="desktop-file-list">
                <Table
                  rowKey="key"
                  size="middle"
                  columns={columns}
                  dataSource={visible}
                  loading={loading}
                  tableLayout="fixed"
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selected,
                    onChange: setSelected,
                    columnWidth: 44,
                  }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }}
                />
              </div>
              <div className="mobile-file-list">
                <Spin spinning={loading}>
                  {visible.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
                  ) : (
                    visible.map((r) => {
                      const kind = r.type === 'folder' ? 'folder' : previewType(r.name);
                      return (
                        <div className="mobile-file-row" key={r.key}>
                          <Checkbox
                            className="mobile-check"
                            checked={selected.includes(r.key)}
                            aria-label={`选择 ${r.name}`}
                            onChange={(e) => toggleSelect(r.key, e.target.checked)}
                          />
                          <button type="button" className="mobile-file-main" onClick={() => openItem(r)}>
                            <FileGlyph type={r.type === 'folder' ? 'folder' : r.name} />
                            <span className="mobile-file-info">
                              <span className="file-name" title={r.name}>{r.name}</span>
                              <small>{r.type === 'folder' ? '文件夹' : `${FILE_LABELS[kind] ?? '文件'} · ${itemMeta(r)}`}</small>
                            </span>
                            {r.type === 'folder' && <RightOutlined className="mobile-folder-arrow" />}
                          </button>
                          <div className="mobile-file-actions">{moreButton(r)}</div>
                        </div>
                      );
                    })
                  )}
                </Spin>
              </div>
            </div>
          )}
        </section>
      </main>

      <Modal
        title="新建文件夹"
        open={folderOpen}
        okText="创建"
        cancelText="取消"
        confirmLoading={busy}
        onOk={createFolder}
        onCancel={() => setFolderOpen(false)}
        destroyOnHidden
      >
        <Input
          autoFocus
          placeholder="文件夹名称"
          value={folderName}
          maxLength={100}
          onChange={(e) => setFolderName(e.target.value)}
          onPressEnter={createFolder}
        />
      </Modal>

      <Modal
        title={renaming?.type === 'folder' ? '重命名文件夹' : '重命名文件'}
        open={!!renaming}
        okText="确定"
        cancelText="取消"
        confirmLoading={busy}
        onOk={submitRename}
        onCancel={() => setRenaming(null)}
        destroyOnHidden
      >
        <Input
          autoFocus
          value={renameValue}
          maxLength={200}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          onFocus={(e) => {
            // 文件重命名时默认只选中不含扩展名的部分
            const dot = renameValue.lastIndexOf('.');
            if (renaming?.type === 'file' && dot > 0) e.target.setSelectionRange(0, dot);
          }}
        />
      </Modal>

      <MoveModal
        open={!!moving}
        items={moving ?? []}
        currentDir={dir}
        onCancel={() => setMoving(null)}
        onConfirm={submitMove}
      />

      <Modal
        title={previewItem?.name}
        open={!!previewItem}
        width={previewItem && previewType(previewItem.name) === 'audio' ? 480 : 860}
        onCancel={() => setPreviewKey(null)}
        destroyOnHidden
        footer={
          <div className="preview-footer">
            <span>{previewIndex + 1} / {previewables.length}</span>
            <Space>
              <Button
                icon={<LeftOutlined />}
                disabled={previewIndex <= 0}
                onClick={() => setPreviewKey(previewables[previewIndex - 1].key)}
              >
                上一个
              </Button>
              <Button
                disabled={previewIndex >= previewables.length - 1}
                onClick={() => setPreviewKey(previewables[previewIndex + 1].key)}
              >
                下一个 <RightOutlined />
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => previewItem && triggerDownload(previewItem.key)}>
                下载
              </Button>
            </Space>
          </div>
        }
      >
        {previewItem && (
          <div className="preview-body">
            {previewType(previewItem.name) === 'img' && <img src={fileUrl(previewItem.key, true)} alt={previewItem.name} />}
            {previewType(previewItem.name) === 'video' && <video key={previewItem.key} src={fileUrl(previewItem.key, true)} controls autoPlay />}
            {previewType(previewItem.name) === 'audio' && <audio key={previewItem.key} src={fileUrl(previewItem.key, true)} controls autoPlay />}
          </div>
        )}
      </Modal>
    </>
  );
}
