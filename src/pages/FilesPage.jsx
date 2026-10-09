import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  RightOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SIZE, api, fileUrl, previewType, putFile } from '../api.js';
import Brand from '../components/Brand.jsx';

const ICONS = { img: <PictureOutlined />, video: <PlayCircleOutlined />, audio: <SoundOutlined /> };
const FILE_LABELS = { img: '照片', video: '视频', audio: '音频' };

function FileGlyph({ type }) {
  const kind = type === 'folder' ? 'folder' : previewType(type) || 'file';
  return (
    <span className={`file-glyph file-glyph--${kind}`} aria-hidden="true">
      {kind === 'folder' ? <FolderOpenOutlined /> : ICONS[kind] || <FileOutlined />}
    </span>
  );
}

export default function FilesPage({ username, onLogout }) {
  const { message } = AntApp.useApp();
  const [dir, setDir] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [preview, setPreview] = useState(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const queue = useRef({ chain: Promise.resolve(), pending: 0 });

  const load = useCallback(
    async (target) => {
      setLoading(true);
      try {
        const data = await api(`/api/files/list?dir=${encodeURIComponent(target)}`);
        const folders = data.folders.map((f) => ({
          key: f,
          type: 'folder',
          name: f.slice(target.length).replace(/\/$/, ''),
        }));
        const files = data.files
          .map((f) => ({ key: f.key, type: 'file', name: f.key.slice(target.length) }))
          .filter((f) => f.name);
        setItems([...folders, ...files]);
      } catch (e) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    load(dir);
  }, [dir, load]);

  const remove = async (record) => {
    try {
      await api('/api/files/delete', { method: 'POST', body: { key: record.key } });
      message.success('已删除');
      load(dir);
    } catch (e) {
      message.error(e.message);
    }
  };

  const createFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    if (/[/\\]/.test(name) || name === '.' || name === '..') {
      message.warning('名称不能包含 / 或 \\');
      return;
    }
    // Blob 没有空目录概念：进入新目录后上传文件即自动创建
    setFolderOpen(false);
    setFolderName('');
    setDir(`${dir}${name}/`);
  };

  const patchUpload = (uid, patch) =>
    setUploads((list) => list.map((u) => (u.uid === uid ? { ...u, ...patch } : u)));

  const uploadOne = async (file) => {
    const uid = file.uid;
    setUploads((list) => [...list, { uid, name: file.name, status: 'uploading', percent: 0 }]);
    try {
      if (file.size > MAX_SIZE) throw new Error('超过 25MB');
      const { url, contentType } = await api('/api/files/upload-url', {
        method: 'POST',
        body: { dir, name: file.name, size: file.size },
      });
      await putFile(url, contentType, file, (percent) => patchUpload(uid, { percent }));
      patchUpload(uid, { status: 'done', percent: 100 });
      setTimeout(() => setUploads((list) => list.filter((u) => u.uid !== uid)), 2000);
    } catch (e) {
      patchUpload(uid, { status: 'error', response: e.message });
      message.error(`${file.name}：${e.message}`);
    }
  };

  // 逐个上传，全部结束后刷新一次
  const beforeUpload = (file) => {
    const q = queue.current;
    q.pending += 1;
    q.chain = q.chain.then(async () => {
      await uploadOne(file);
      q.pending -= 1;
      if (q.pending === 0) load(dir);
    });
    return false;
  };

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

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name, r) => {
        if (r.type === 'folder') {
          return (
            <Button type="link" className="link-btn" onClick={() => setDir(r.key)}>
              <span className="name-cell">
                <FileGlyph type="folder" />
                <span className="file-name" title={name}>{name}</span>
              </span>
            </Button>
          );
        }
        const type = previewType(name);
        const label = (
          <span className="name-cell">
            <FileGlyph type={name} />
            <span className="file-name" title={name}>{name}</span>
          </span>
        );
        return type ? (
          <Button type="link" className="link-btn" onClick={() => setPreview({ key: r.key, name, type })}>
            {label}
          </Button>
        ) : (
          label
        );
      },
    },
    {
      title: '操作',
      width: 140,
      align: 'right',
      render: (_, r) =>
        r.type === 'folder' ? null : (
          <Space size={4}>
            <Button
              type="text"
              icon={<DownloadOutlined />}
              title="下载"
              href={fileUrl(r.key, false)}
            />
            <Popconfirm
              title={`确定删除 ${r.name} ？`}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(r)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="删除" />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <>
      <header className="app-header">
        <Brand compact />
        <Space className="app-account" size={8}>
          <Typography.Text className="app-username" type="secondary">{username}</Typography.Text>
          <Button type="text" className="app-logout" icon={<LogoutOutlined />} aria-label="退出登录" onClick={onLogout}>
            <span className="app-logout-text">退出</span>
          </Button>
        </Space>
      </header>

      <main className="app-main">
        <div className="app-heading">
          <p className="app-eyebrow">YOUR JOURNEY, SAFELY KEPT</p>
          <h1>我的旅途素材</h1>
          <p>把路上的好风景，留在这里。</p>
        </div>
        <div className="toolbar">
          <div className="crumbs-scroll"><Breadcrumb items={crumbs} /></div>
          <Button className="new-folder-btn" icon={<FolderAddOutlined />} onClick={() => setFolderOpen(true)}>
            新建文件夹
          </Button>
        </div>

        <div className="upload-zone">
          <Upload.Dragger
            multiple
            showUploadList={false}
            beforeUpload={beforeUpload}
            openFileDialogOnClick
          >
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p className="ant-upload-text"><span className="upload-desktop-text">点击或拖拽文件，收藏这一程的风景</span><span className="upload-mobile-text">点击上传旅途素材</span></p>
            <p className="ant-upload-hint">单文件不超过 25MB · 图片、视频和音频可预览</p>
          </Upload.Dragger>
          {uploads.length > 0 && (
            <Upload
              listType="text"
              fileList={uploads}
              showUploadList={{ showRemoveIcon: false }}
              disabled
            />
          )}
        </div>

        <section className="files-section" aria-label="素材列表">
          <div className="files-section-heading">
            <h2>素材列表</h2>
            <span>{items.length} 项</span>
          </div>
          <div className="panel">
            <div className="desktop-file-list">
              <Table
                rowKey="key"
                size="middle"
                columns={columns}
                dataSource={items}
                loading={loading}
                tableLayout="fixed"
                pagination={false}
                showHeader={false}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这里还没有素材" /> }}
              />
            </div>
            <div className="mobile-file-list">
              <Spin spinning={loading}>
                {items.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这里还没有素材，去上传第一张照片吧" />
                ) : (
                  items.map((r) => {
                    const kind = r.type === 'folder' ? 'folder' : previewType(r.name);
                    return (
                      <div className="mobile-file-row" key={r.key}>
                        {r.type === 'folder' ? (
                          <button type="button" className="mobile-file-main" onClick={() => setDir(r.key)}>
                            <FileGlyph type="folder" />
                            <span className="mobile-file-info"><span className="file-name" title={r.name}>{r.name}</span><small>文件夹</small></span>
                            <RightOutlined className="mobile-folder-arrow" />
                          </button>
                        ) : (
                          <>
                            {kind ? (
                              <button type="button" className="mobile-file-main" onClick={() => setPreview({ key: r.key, name: r.name, type: kind })}>
                                <FileGlyph type={r.name} />
                                <span className="mobile-file-info"><span className="file-name" title={r.name}>{r.name}</span><small>{FILE_LABELS[kind]} · 点击预览</small></span>
                              </button>
                            ) : (
                              <span className="mobile-file-main">
                                <FileGlyph type={r.name} />
                                <span className="mobile-file-info"><span className="file-name" title={r.name}>{r.name}</span><small>文件</small></span>
                              </span>
                            )}
                            <div className="mobile-file-actions">
                              <Button type="text" icon={<DownloadOutlined />} aria-label={`下载 ${r.name}`} href={fileUrl(r.key, false)} />
                              <Popconfirm
                                title={`确定删除 ${r.name} ？`}
                                okText="删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => remove(r)}
                              >
                                <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${r.name}`} />
                              </Popconfirm>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </Spin>
            </div>
          </div>
        </section>
      </main>

      <Modal
        title="新建文件夹"
        open={folderOpen}
        okText="创建"
        cancelText="取消"
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
        title={preview?.name}
        open={!!preview}
        footer={null}
        width={preview?.type === 'audio' ? 480 : 860}
        onCancel={() => setPreview(null)}
        destroyOnHidden
      >
        {preview && (
          <div className="preview-body">
            {preview.type === 'img' && <img src={fileUrl(preview.key, true)} alt={preview.name} />}
            {preview.type === 'video' && <video src={fileUrl(preview.key, true)} controls autoPlay />}
            {preview.type === 'audio' && <audio src={fileUrl(preview.key, true)} controls autoPlay />}
          </div>
        )}
      </Modal>
    </>
  );
}
