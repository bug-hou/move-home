import { useState } from 'react';
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
} from 'lucide-react';

const FILE_TYPES = {
  jpg: ['image', FileImage], jpeg: ['image', FileImage], png: ['image', FileImage],
  gif: ['image', FileImage], webp: ['image', FileImage], svg: ['image', FileImage],
  bmp: ['image', FileImage], heic: ['image', FileImage], avif: ['image', FileImage],
  mp4: ['video', FileVideo], mov: ['video', FileVideo], webm: ['video', FileVideo],
  mkv: ['video', FileVideo], avi: ['video', FileVideo], m4v: ['video', FileVideo],
  mp3: ['audio', FileAudio], wav: ['audio', FileAudio], flac: ['audio', FileAudio],
  aac: ['audio', FileAudio], ogg: ['audio', FileAudio], m4a: ['audio', FileAudio],
  pdf: ['pdf', FileText],
  doc: ['document', FileText], docx: ['document', FileText], txt: ['document', FileText],
  md: ['document', FileText], rtf: ['document', FileText],
  xls: ['sheet', FileSpreadsheet], xlsx: ['sheet', FileSpreadsheet],
  csv: ['sheet', FileSpreadsheet], numbers: ['sheet', FileSpreadsheet],
  ppt: ['slides', FileType2], pptx: ['slides', FileType2], key: ['slides', FileType2],
  zip: ['archive', FileArchive], rar: ['archive', FileArchive],
  '7z': ['archive', FileArchive], tar: ['archive', FileArchive], gz: ['archive', FileArchive],
  js: ['code', FileCode2], jsx: ['code', FileCode2], ts: ['code', FileCode2],
  tsx: ['code', FileCode2], html: ['code', FileCode2], css: ['code', FileCode2],
  py: ['code', FileCode2], json: ['code', FileJson],
};

export function FileThumbnail({ name, url }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <FileGlyph type={name} large />
  ) : (
    <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

export default function FileGlyph({ type, large = false }) {
  const folder = type === 'folder';
  const extension = folder ? '' : type.split('.').pop()?.toLowerCase();
  const [kind, Icon] = folder ? ['folder', Folder] : (FILE_TYPES[extension] ?? ['other', File]);
  const label = !folder && extension && extension.length <= 5 ? extension.toUpperCase() : '';

  return (
    <span className={`file-glyph file-glyph--${kind}${large ? ' file-glyph--large' : ''}`} aria-hidden="true">
      <Icon className="file-glyph__icon" size={large ? 40 : 23} strokeWidth={1.75} />
      {label && <span className="file-glyph__label">{label}</span>}
    </span>
  );
}
