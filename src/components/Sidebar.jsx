import {
  CloudOutlined,
  CloudUploadOutlined,
  SwapOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderFilled,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Progress } from 'antd';
import { formatSize } from '../api.js';
import Brand from './Brand.jsx';

const FOLDER_MENU = [
  { key: 'rename', label: '重命名', icon: <EditOutlined /> },
  { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
];

// 侧边栏：固定「上传 / 全部文件」+ 动态的根目录文件夹 + 底部存储空间
export default function Sidebar({
  folders,
  dir,
  section,
  activeTransfers,
  usage,
  onUpload,
  onNavigate,
  onTransfers,
  onCreateFolder,
  onFolderAction,
  onRecalcUsage,
}) {
  const first = dir.split('/')[0];
  const activeRoot = first ? `${first}/` : '';
  const percent = usage?.quota ? Math.min(100, (usage.used / usage.quota) * 100) : 0;

  return (
    <div className="sidebar-inner">
      <div className="sidebar-brand">
        <Brand compact />
      </div>

      <Button type="primary" size="large" block icon={<CloudUploadOutlined />} className="sidebar-upload" onClick={onUpload}>
        上传文件
      </Button>

      <nav className="sidebar-nav" aria-label="主导航">
        <button
          type="button"
          className={`nav-item${section === 'files' && dir === '' ? ' is-active' : ''}`}
          aria-current={section === 'files' && dir === '' ? 'page' : undefined}
          onClick={() => onNavigate('')}
        >
          <CloudOutlined className="nav-icon" />
          <span className="file-name">全部文件</span>
        </button>
        <button
          type="button"
          className={`nav-item${section === 'transfers' ? ' is-active' : ''}`}
          aria-current={section === 'transfers' ? 'page' : undefined}
          onClick={onTransfers}
        >
          <SwapOutlined className="nav-icon" />
          <span className="file-name">传输列表</span>
          {activeTransfers > 0 && <span className="nav-badge">{activeTransfers}</span>}
        </button>

        <div className="nav-section">
          <span>我的文件夹</span>
          <Button type="text" size="small" className="create-folder-trigger" icon={<PlusOutlined />} aria-label="新建文件夹" title="新建文件夹" onClick={onCreateFolder} />
        </div>

        {folders.length === 0 && <p className="nav-empty">点击右上角 + 创建第一个文件夹，它会出现在这里。</p>}

        {folders.map((f) => {
          const active = section === 'files' && f.key === activeRoot;
          return (
            <div className="nav-row" key={f.key}>
              <button
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(f.key)}
              >
                <FolderFilled className="nav-icon nav-icon--folder" />
                <span className="file-name" title={f.name}>{f.name}</span>
              </button>
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{ items: FOLDER_MENU, onClick: ({ key }) => onFolderAction(f, key) }}
              >
                <Button type="text" size="small" className="nav-more" icon={<MoreOutlined />} aria-label={`${f.name} 的更多操作`} />
              </Dropdown>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-usage">
        <div className="usage-head">
          <span>存储空间</span>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label="重新计算存储空间"
            title="重新计算"
            onClick={onRecalcUsage}
          />
        </div>
        <Progress percent={percent} showInfo={false} size="small" status={percent >= 90 ? 'exception' : 'normal'} />
        <p className="usage-text">
          {usage ? `已用 ${formatSize(usage.used)} / ${formatSize(usage.quota)}` : '计算中…'}
        </p>
        <p className="usage-hint" title="产品层逻辑额度；实际可用量以 EdgeOne Blob 套餐为准，免费版为 1 GB">
          逻辑额度 · 实际容量取决于 Blob 套餐
        </p>
      </div>
    </div>
  );
}
