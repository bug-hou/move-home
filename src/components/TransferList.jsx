import { CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Progress, Segmented } from 'antd';
import { useState } from 'react';
import { formatSize } from '../api.js';
import FileGlyph from './FileGlyph.jsx';

const LABELS = {
  waiting: '排队中', uploading: '上传中', downloading: '下载中',
  paused: '等待重新选择文件', error: '传输失败', done: '已完成', browser: '已交给浏览器下载',
};

export default function TransferList({ transfers, onResume, onRemove, onClear }) {
  const [direction, setDirection] = useState('upload');
  const entries = transfers.filter((item) => item.direction === direction);
  const finished = entries.filter((item) => ['done', 'browser'].includes(item.status));

  return (
    <section className="transfers" aria-label="传输列表">
      <div className="transfer-heading">
        <div>
          <h1>传输列表</h1>
          <p>查看上传与下载进度；重新打开页面后，可重选原文件续传已上传的分片。</p>
        </div>
        {finished.length > 0 && (
          <Button icon={<DeleteOutlined />} onClick={() => onClear(direction)}>清理已结束任务</Button>
        )}
      </div>
      <Segmented
        className="transfer-tabs"
        value={direction}
        onChange={setDirection}
        options={[
          { label: '上传任务', value: 'upload', icon: <CloudUploadOutlined /> },
          { label: '下载任务', value: 'download', icon: <CloudDownloadOutlined /> },
        ]}
      />
      {entries.length === 0 ? (
        <Empty className="transfer-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={`还没有${direction === 'upload' ? '上传' : '下载'}记录`} />
      ) : (
        <div className="transfer-items">
          {entries.map((item) => {
            const active = ['waiting', 'uploading', 'downloading'].includes(item.status);
            const resumable = item.direction === 'upload' && ['paused', 'error'].includes(item.status);
            return (
              <div className="transfer-item" key={item.uid}>
                <FileGlyph type={item.name} />
                <div className="transfer-item-main">
                  <div className="transfer-item-top">
                    <span className="file-name" title={item.name}>{item.name}</span>
                    <span className="transfer-item-size">{formatSize(item.size)}</span>
                  </div>
                  {active && item.status !== 'waiting' && (
                    <Progress percent={Math.round(item.percent || 0)} size="small" showInfo={false} />
                  )}
                  <div className={`transfer-state${item.status === 'error' ? ' is-error' : ''}`}>
                    {item.error || LABELS[item.status] || item.status}
                    {active && item.status !== 'waiting' && <span>{Math.round(item.percent || 0)}%</span>}
                  </div>
                </div>
                <div className="transfer-actions">
                  {resumable && (
                    <Button icon={<ReloadOutlined />} onClick={() => onResume(item)}>重选原文件</Button>
                  )}
                  {!active && (
                    <Button type="text" icon={<DeleteOutlined />} aria-label={`移除 ${item.name}`} onClick={() => onRemove(item)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="transfer-note">关闭页面会停止网页执行的上传和流式下载；重新打开后可重选原文件续传已落盘分片。浏览器接管的下载进度请在浏览器下载管理中查看。</p>
    </section>
  );
}
