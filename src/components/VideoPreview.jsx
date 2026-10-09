import { I18nProvider } from '@videojs/react/i18n';
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video';
import { useState } from 'react';
import '@videojs/react/video/skin.css';

export default function VideoPreview({ src, name }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="preview-video">
      <I18nProvider locale="zh-CN">
        <VideoPlayer>
          <VideoSkin className="preview-video-skin">
            <Video
              src={src}
              aria-label={name}
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          </VideoSkin>
        </VideoPlayer>
      </I18nProvider>
      {failed && <p className="preview-video-error" role="alert">无法播放此视频，请确认文件未损坏，且浏览器支持该视频的格式与编码；你仍可以下载文件。</p>}
    </div>
  );
}
