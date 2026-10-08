import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderFilled,
  LogoutOutlined,
  PictureOutlined,
  PlayCircleOutlined,
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
  Table,
  Typography,
  Upload,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SIZE, api, fileUrl, previewType, putFile } from '../api.js';

const ICONS = { img: <PictureOutlined />, video: <PlayCircleOutlined />, audio: <SoundOutlined /> };

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
    { title: <a onClick={() => setDir('')}>全部文件</a> },
    ...dir
      .split('/')
      .filter(Boolean)
      .map((seg, i, arr) => {
        const target = `${arr.slice(0, i + 1).join('/')}/`;
        return { title: i === arr.length - 1 ? seg : <a onClick={() => setDir(target)}>{seg}</a> };
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
                <FolderFilled style={{ color: '#a1a1aa' }} />
                {name}
              </span>
            </Button>
          );
        }
        const type = previewType(name);
        const label = (
          <span className="name-cell">
            {ICONS[type] || <FileOutlined />}
            {name}
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
        <span className="brand">Move Home</span>
        <Space>
          <Typography.Text type="secondary">{username}</Typography.Text>
          <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}>
            退出
          </Button>
        </Space>
      </header>

      <main className="app-main">
        <div className="toolbar">
          <Breadcrumb items={crumbs} />
          <Button icon={<FolderAddOutlined />} onClick={() => setFolderOpen(true)}>
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
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined style={{ color: '#71717a' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
            <p className="ant-upload-hint">支持图片 / 视频 / 音频，单文件 ≤ 25MB</p>
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

        <div className="panel">
          <Table
            rowKey="key"
            size="middle"
            columns={columns}
            dataSource={items}
            loading={loading}
            pagination={false}
            showHeader={false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这里还没有文件" /> }}
          />
        </div>
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
