import { CheckCircleFilled, CloseCircleFilled, CloseOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Progress } from 'antd';
import { useEffect, useState } from 'react';

const STATUS_TEXT = { waiting: '等待中', uploading: '上传中', done: '已完成', error: '失败' };

// 右下角浮动上传面板：不占用内容区，可收起
export default function UploadPanel({ uploads, onRemove, onClear }) {
  const [collapsed, setCollapsed] = useState(false);

  const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'waiting').length;
  const failed = uploads.filter((u) => u.status === 'error').length;

  // 全部成功后稍等片刻自动收起
  useEffect(() => {
    if (uploads.length > 0 && active === 0 && failed === 0) {
      const timer = setTimeout(onClear, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [uploads.length, active, failed, onClear]);

  if (uploads.length === 0) return null;

  const title = active
    ? `正在上传 ${active} 个文件`
    : failed
      ? `${failed} 个文件上传失败`
      : '全部上传完成';

  return (
    <section className="upload-panel" aria-label="上传进度" aria-live="polite">
      <header className="upload-panel-head">
        <strong>{title}</strong>
        <span>
          <Button
            type="text"
            size="small"
            icon={collapsed ? <UpOutlined /> : <DownOutlined />}
            aria-label={collapsed ? '展开' : '收起'}
            onClick={() => setCollapsed((v) => !v)}
          />
          {active === 0 && (
            <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭" onClick={onClear} />
          )}
        </span>
      </header>
      {!collapsed && (
        <ul className="upload-panel-list">
          {uploads.map((u) => (
            <li className="upload-row" key={u.uid}>
              <div className="upload-row-head">
                <span className="file-name" title={u.name}>{u.name}</span>
                {u.status === 'done' && <CheckCircleFilled className="upload-ok" />}
                {u.status === 'error' && (
                  <>
                    <CloseCircleFilled className="upload-fail" />
                    <Button type="text" size="small" icon={<CloseOutlined />} aria-label="移除" onClick={() => onRemove(u.uid)} />
                  </>
                )}
              </div>
              {u.status === 'uploading' || u.status === 'waiting' ? (
                <Progress percent={Math.round(u.percent)} size="small" showInfo={u.status === 'uploading'} />
              ) : null}
              <small className={u.status === 'error' ? 'upload-error' : 'upload-state'}>
                {u.status === 'error' ? u.error : STATUS_TEXT[u.status]}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
