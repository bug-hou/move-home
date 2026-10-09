import { FolderFilled, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Empty, Modal, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 选择目标文件夹：逐级浏览，自身（被移动的文件夹）不可进入
export default function MoveModal({ open, items, currentDir, onCancel, onConfirm }) {
  const { message } = AntApp.useApp();
  const [dir, setDir] = useState('');
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const blocked = items.filter((i) => i.type === 'folder').map((i) => i.key);

  useEffect(() => {
    if (open) setDir(currentDir);
  }, [open, currentDir]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    api(`/api/files/list?dir=${encodeURIComponent(dir)}`)
      .then((data) => alive && setFolders(data.folders))
      .catch((e) => alive && message.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, dir, message]);

  const parent = dir.replace(/[^/]+\/$/, '');
  const unchanged = dir === currentDir;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(dir);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`移动 ${items.length} 项到`}
      open={open}
      okText="移动到此处"
      cancelText="取消"
      onOk={confirm}
      onCancel={onCancel}
      okButtonProps={{ disabled: unchanged, loading: busy }}
      destroyOnHidden
    >
      <div className="move-path">
        <Button type="text" size="small" icon={<LeftOutlined />} disabled={!dir} onClick={() => setDir(parent)}>
          上一级
        </Button>
        <span className="move-path-text" title={dir || '全部素材'}>/ {dir || '全部素材'}</span>
      </div>
      <Spin spinning={loading}>
        <div className="move-list">
          {folders.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这里没有子文件夹" />
          ) : (
            folders.map((f) => {
              const disabled = blocked.includes(f.key);
              return (
                <button
                  type="button"
                  className="move-row"
                  key={f.key}
                  disabled={disabled}
                  onClick={() => setDir(f.key)}
                >
                  <FolderFilled className="move-row-icon" />
                  <span className="file-name">{f.name}</span>
                  {!disabled && <RightOutlined className="move-row-arrow" />}
                </button>
              );
            })
          )}
        </div>
      </Spin>
    </Modal>
  );
}
