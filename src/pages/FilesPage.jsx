import {
  AppstoreOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  FolderAddOutlined,
  FolderFilled,
  LeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoreOutlined,
  PictureOutlined,
  RightOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Breadcrumb,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SIZE, api, fileUrl, formatSize, formatTime, previewType, uploadFile } from '../api.js';
import FileGlyph, { FileThumbnail } from '../components/FileGlyph.jsx';
import MoveModal from '../components/MoveModal.jsx';
import Sidebar from '../components/Sidebar.jsx';
import UploadPanel from '../components/UploadPanel.jsx';

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

// 'a/b/' -> 'a/'，'a/b.jpg' -> 'a/'
const parentOf = (key) => key.replace(/[^/]+\/?$/, '');

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

let uidSeed = 0;

export default function FilesPage({ username, onLogout }) {
  const { message, modal } = AntApp.useApp();
  const [dir, setDir] = useState('');
  const [items, setItems] = useState([]);
  const [rootFolders, setRootFolders] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [previewKey, setPreviewKey] = useState(null);
  const [view, setView] = useState(readView);
  const [sort, setSort] = useState('name_asc');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [folderParent, setFolderParent] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moving, setMoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const queue = useRef({ chain: Promise.resolve(), pending: 0 });
  const fileInput = useRef(null);
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

  const loadRoot = useCallback(async () => {
    try {
      const data = await api('/api/files/list?dir=&folders=1');
      setRootFolders([...data.folders].sort((a, b) => collator.compare(a.name, b.name)));
    } catch {
      // 侧边栏加载失败不打扰用户，主列表会给出错误提示
    }
  }, []);

  const loadUsage = useCallback(async (recalc = false) => {
    try {
      setUsage(await api(`/api/files/usage${recalc ? '?recalc=1' : ''}`));
    } catch (e) {
      if (recalc) message.error(e.message);
    }
  }, [message]);

  useEffect(() => {
    dirRef.current = dir;
    setSearch('');
    load(dir);
  }, [dir, load]);

  useEffect(() => {
    loadRoot();
    loadUsage();
  }, [loadRoot, loadUsage]);

  // 变更之后统一刷新：当前目录 + 侧边栏 + 存储空间；当前目录被删除/改名时回到根目录
  const refresh = useCallback(
    (gone = []) => {
      loadRoot();
      loadUsage();
      if (gone.some((k) => dirRef.current.startsWith(k))) setDir('');
      else load(dirRef.current);
    },
    [load, loadRoot, loadUsage],
  );

  const navigate = (target) => {
    setDir(target);
    setDrawerOpen(false);
  };

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
        let gone = [];
        try {
          const res = await api('/api/files/delete', {
            method: 'POST',
            body: { items: targets.map((t) => ({ type: t.type, key: t.key })) },
          });
          const failedKeys = new Set(res.failed.map((f) => f.key));
          gone = targets.filter((t) => t.type === 'folder' && !failedKeys.has(t.key)).map((t) => t.key);
          reportBatch(res, '已删除');
        } catch (e) {
          message.error(e.message);
        }
        refresh(gone);
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
      await api('/api/files/mkdir', { method: 'POST', body: { dir: folderParent, name } });
      setFolderParent(null);
      setFolderName('');
      message.success('文件夹已创建');
      refresh();
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openCreateFolder = (parent) => {
    setFolderName('');
    setFolderParent(parent);
    setDrawerOpen(false);
  };

  const openRename = (item) => {
    setRenaming(item);
    setRenameValue(item.name);
    setDrawerOpen(false);
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
    const to = `${parentOf(renaming.key)}${name}${isFolder ? '/' : ''}`;
    setBusy(true);
    try {
      const res = await api('/api/files/move', {
        method: 'POST',
        body: { moves: [{ type: renaming.type, from: renaming.key, to }] },
      });
      if (res.failed.length) throw new Error(res.failed[0].error);
      // 正在浏览被改名的文件夹（或其子目录）时，跟随新路径
      if (isFolder && dirRef.current.startsWith(renaming.key)) {
        setDir(to + dirRef.current.slice(renaming.key.length));
        loadRoot();
        loadUsage();
      } else {
        refresh();
      }
      setRenaming(null);
      message.success('已重命名');
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
      refresh();
    } catch (e) {
      message.error(e.message);
    }
  };

  const onFolderAction = (folder, action) => {
    const item = { type: 'folder', key: folder.key, name: folder.name };
    if (action === 'rename') openRename(item);
    else if (action === 'delete') remove([item]);
  };

  const recalcUsage = async () => {
    await loadUsage(true);
    message.success('已重新计算');
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

  const patchUpload = useCallback(
    (uid, patch) => setUploads((list) => list.map((u) => (u.uid === uid ? { ...u, ...patch } : u))),
    [],
  );

  const uploadOne = async (entry, file, targetDir) => {
    patchUpload(entry.uid, { status: 'uploading' });
    try {
      if (file.size <= 0) throw new Error('不支持空文件或文件夹');
      if (file.size > MAX_SIZE) throw new Error(`超过 ${MAX_SIZE / 1024 / 1024}MB`);
      await uploadFile(file, targetDir, (percent) => patchUpload(entry.uid, { percent }));
      patchUpload(entry.uid, { status: 'done', percent: 100 });
    } catch (e) {
      patchUpload(entry.uid, { status: 'error', error: e.message });
    }
  };

  // 逐个文件上传（单个文件内部分片并发），全部结束后刷新一次
  const enqueueFiles = (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const targetDir = dirRef.current;
    const q = queue.current;
    for (const file of files) {
      const entry = { uid: `${Date.now()}-${uidSeed++}`, name: file.name, status: 'waiting', percent: 0 };
      setUploads((list) => [...list, entry]);
      q.pending += 1;
      q.chain = q.chain.then(async () => {
        await uploadOne(entry, file, targetDir);
        q.pending -= 1;
        if (q.pending === 0) {
          loadUsage();
          loadRoot();
          if (dirRef.current === targetDir) load(targetDir);
        }
      });
    }
  };

  const pickFiles = () => {
    setDrawerOpen(false);
    fileInput.current?.click();
  };

  // 拖拽文件到页面任意位置即可上传
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      enqueueFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
    // enqueueFiles 只依赖 ref 与稳定的 setState，无需随渲染重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 渲染 ----------

  const crumbs = [
    { title: dir ? <button type="button" className="crumb-link" onClick={() => setDir('')}>全部文件</button> : '全部文件' },
    ...dir
      .split('/')
      .filter(Boolean)
      .map((seg, i, arr) => {
        const target = `${arr.slice(0, i + 1).join('/')}/`;
        return { title: i === arr.length - 1 ? seg : <button type="button" className="crumb-link" onClick={() => setDir(target)}>{seg}</button> };
      }),
  ];

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
      width: 112,
      align: 'right',
      render: (size, r) => <span className="cell-muted cell-size">{r.type === 'folder' ? '—' : formatSize(size)}</span>,
    },
    {
      title: '上传时间',
      dataIndex: 'mtime',
      width: 180,
      responsive: ['lg'],
      align: 'center',
      render: (t, r) => <span className="cell-muted">{r.type === 'folder' ? '—' : formatTime(t)}</span>,
    },
    {
      title: '操作',
      width: 112,
      align: 'center',
      render: (_, r) => (
        <div className="row-actions">
          {r.type === 'file' && (
            <Button type="text" icon={<DownloadOutlined />} aria-label={`下载 ${r.name}`} onClick={() => triggerDownload(r.key)} />
          )}
          {moreButton(r)}
        </div>
      ),
    },
  ];

  const emptyNode = (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={search ? '没有匹配的内容' : dir ? '这个文件夹还是空的' : '还没有任何文件'}
    >
      {!search && (
        <Space>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={pickFiles}>上传文件</Button>
          <Button icon={<FolderAddOutlined />} onClick={() => openCreateFolder(dir)}>新建文件夹</Button>
        </Space>
      )}
    </Empty>
  );

  const sidebar = (
    <Sidebar
      folders={rootFolders}
      dir={dir}
      usage={usage}
      onUpload={pickFiles}
      onNavigate={navigate}
      onCreateFolder={() => openCreateFolder('')}
      onFolderAction={onFolderAction}
      onRecalcUsage={recalcUsage}
    />
  );

  const title = dir ? dir.split('/').filter(Boolean).pop() : '全部文件';

  return (
    <div className="app-shell">
      <aside className="app-sidebar">{sidebar}</aside>
      <Drawer
        placement="left"
        width={288}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        closable={false}
        styles={{ body: { padding: 0 } }}
        className="sidebar-drawer"
      >
        {sidebar}
      </Drawer>

      <div className="app-content">
        <header className="topbar">
          <Button
            className="topbar-menu"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开菜单"
            onClick={() => setDrawerOpen(true)}
          />
          <Input
            allowClear
            className="topbar-search"
            prefix={<SearchOutlined />}
            placeholder={dir ? `在「${title}」中搜索` : '搜索当前文件夹'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            <Button type="text" className="topbar-account" aria-label={`账号菜单：${username}`}>
              <Avatar size={34} className="topbar-avatar">{username.slice(0, 1).toUpperCase()}</Avatar>
              <span className="topbar-account-details">
                <span className="topbar-username">{username}</span>
                <span className="topbar-account-label">个人空间</span>
              </span>
              <DownOutlined className="topbar-caret" />
            </Button>
          </Dropdown>
        </header>

        <main className="app-main">
          <div className="page-head">
            <div className="page-path">
              {dir && (
                <Button type="text" icon={<LeftOutlined />} aria-label="返回上一级" onClick={() => setDir(parentOf(dir))} />
              )}
              <div className="crumbs-scroll"><Breadcrumb items={crumbs} /></div>
            </div>
            <div className="page-tools">
              <Select
                className="tool-sort"
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
              <Button icon={<FolderAddOutlined />} onClick={() => openCreateFolder(dir)}>
                <span className="tool-label">新建文件夹</span>
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

          <section aria-label="文件列表">
            <div className="files-section-heading">
              <h1>{title}</h1>
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
                  <div className="panel panel-empty">{emptyNode}</div>
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
                              <FileThumbnail name={r.name} url={fileUrl(r.key, true)} />
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
                    rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 44 }}
                    locale={{ emptyText: emptyNode }}
                  />
                </div>
                <div className="mobile-file-list">
                  <Spin spinning={loading}>
                    {visible.length === 0 ? (
                      emptyNode
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
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          enqueueFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-box">
            <CloudUploadOutlined />
            <strong>松开即可上传到「{title}」</strong>
          </div>
        </div>
      )}

      <UploadPanel
        uploads={uploads}
        onRemove={(uid) => setUploads((list) => list.filter((u) => u.uid !== uid))}
        onClear={() => setUploads((list) => list.filter((u) => u.status === 'uploading' || u.status === 'waiting'))}
      />

      <Modal
        title="新建文件夹"
        open={folderParent !== null}
        okText="创建"
        cancelText="取消"
        confirmLoading={busy}
        onOk={createFolder}
        onCancel={() => setFolderParent(null)}
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
        <p className="modal-hint">
          {folderParent ? `将创建在「${folderParent.replace(/\/$/, '')}」下。` : '将创建在根目录，并出现在左侧菜单中。'}
        </p>
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
    </div>
  );
}
