import { API_BASE } from './api';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type MediaImageAlign = 'left' | 'center' | 'right' | 'none';
export type MediaImageFrame = 'thumb' | 'frame' | 'frameless' | 'border' | 'none';
export type MediaImageValign =
  | 'baseline'
  | 'sub'
  | 'super'
  | 'top'
  | 'text-top'
  | 'middle'
  | 'bottom'
  | 'text-bottom';

export interface MediaImageOptions {
  /** 表示スタイル: thumb (サムネイル枠), frame (枠付き), frameless (枠なし), border (境界線のみ), none (標準) */
  frame: MediaImageFrame;
  /** 水平配置・挿入位置: left (左寄せ・回り込み), center (中央揃え), right (右寄せ・回り込み), none (指定なし) */
  align?: MediaImageAlign;
  /** 垂直配置 */
  valign?: MediaImageValign;
  /** 幅指定 (例: "300px", "50%") */
  width?: string;
  /** 最大高さ指定 (例: "200px") */
  height?: string;
  /** キャプション (画像の下に表示する説明文) */
  caption?: string;
  /** 代替テキスト (alt属性) */
  alt?: string;
  /** リンク先URLまたはページ名 (空文字 "" の場合はクリック無効、未指定時はクリックで全画面拡大) */
  link?: string;
  /** 境界線フラグ */
  border?: boolean;
  /** 追加CSSクラス */
  className?: string;
}

/**
 * 内部メディアID (media:UUID)、ファイル名、または各種画像URLを、
 * 常に表示可能な恒久的URL（APIエンドポイント等）に解決する
 */
export function resolveMediaUrl(src?: string, fallbackId?: string): string {
  if (!src && !fallbackId) return '';
  let trimmed = (src || '').trim();

  // MediaWiki プレフィックス (File:, Image:, ファイル:, 画像:) が残っている場合は除去
  trimmed = trimmed.replace(/^:?(?:file|image|ファイル|画像)\s*:\s*/i, '').trim();

  // 1. media:UUID または klados-media:UUID (または media:filename.png)
  if (trimmed.startsWith('media:') || trimmed.startsWith('klados-media:')) {
    const rawId = trimmed.replace(/^(media:|klados-media:)/, '').trim();
    const withoutExt = rawId.replace(/\.[^/.]+$/, '');
    if (UUID_REGEX.test(withoutExt)) {
      return `/v1/public/media/${withoutExt}`;
    }
    return `/v1/public/media/${encodeURIComponent(rawId)}`;
  }

  // 2. 単体UUID指定 (または UUID.ext)
  const trimmedWithoutExt = trimmed.replace(/\.[^/.]+$/, '');
  if (UUID_REGEX.test(trimmed)) {
    return `/v1/public/media/${trimmed}`;
  }
  if (UUID_REGEX.test(trimmedWithoutExt) && !trimmed.includes('/')) {
    return `/v1/public/media/${trimmedWithoutExt}`;
  }

  // 3. /v1/public/media/:id または /public/media/:id
  if (trimmed.startsWith('/v1/public/media/') || trimmed.startsWith('/public/media/')) {
    return trimmed.startsWith('/v1') ? trimmed : `/v1${trimmed}`;
  }

  // 4. 既存の MinIO 直URL (http://klados-minio:9000/klados-media/... 等) の救済
  if (trimmed.includes('/klados-media/') || trimmed.includes('minio:9000') || trimmed.includes('klados-minio')) {
    if (fallbackId && UUID_REGEX.test(fallbackId)) {
      return `/v1/public/media/${fallbackId}`;
    }
    // sites/.../media/ 形式の storageKey を抽出
    const matchKey = trimmed.match(/\/klados-media\/(sites\/[^\s"')]+)/);
    if (matchKey && matchKey[1]) {
      const storageKey = matchKey[1];
      // さらに media/{uuid}.ext の UUID を抽出できるか試す
      const uuidMatch = storageKey.match(/\/media\/([0-9a-fA-F-]{36})(?:\.[a-zA-Z0-9]+)?/);
      if (uuidMatch && uuidMatch[1]) {
        return `/v1/public/media/${uuidMatch[1]}`;
      }
      return `/v1/public/media/file/${storageKey}`;
    }
    if (fallbackId) {
      return `/v1/public/media/${fallbackId}`;
    }
  }

  // 5. fallbackId が指定されており、src が空または無効な場合
  if (fallbackId && !trimmed) {
    return `/v1/public/media/${fallbackId}`;
  }

  // 6. 単なるファイル名指定 (例: "diagram.png" でスキームやスラッシュを含まない場合)
  if (
    trimmed &&
    !trimmed.includes('/') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:') &&
    /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(trimmed)
  ) {
    return `/v1/public/media/${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

/**
 * メディアIDまたはファイル情報から Markdown 画像タグの src 文字列を生成
 */
export function formatMediaRef(id?: string, fallbackUrl?: string): string {
  if (id && UUID_REGEX.test(id)) {
    return `media:${id}`;
  }
  return fallbackUrl || (id ? `media:${id}` : '');
}

const VALIGN_KEYWORDS = new Set<MediaImageValign>([
  'baseline',
  'sub',
  'super',
  'top',
  'text-top',
  'middle',
  'bottom',
  'text-bottom',
]);

/**
 * MediaWiki形式のパイプ区切り画像オプション配列を解析する
 * 例: ["thumb", "right", "300px", "alt=代替文", "キャプションテキスト"]
 */
export function parseMediaWikiImageOptions(
  rawSegments: string[],
  explicitCaption?: string
): MediaImageOptions {
  const opts: MediaImageOptions = {
    frame: 'none',
  };

  const captionCandidates: string[] = [];

  for (const rawSeg of rawSegments) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const lower = seg.toLowerCase();

    // 1. 表示枠タイプ (frame / thumb / frameless / border)
    if (lower === 'thumb' || lower === 'thumbnail' || seg === 'サムネイル') {
      opts.frame = 'thumb';
      continue;
    }
    if (lower === 'frame' || lower === 'framed' || lower === 'enframed' || seg === 'フレーム' || seg === '枠') {
      opts.frame = 'frame';
      continue;
    }
    if (lower === 'frameless' || seg === 'フレームなし' || seg === '枠なし') {
      opts.frame = 'frameless';
      continue;
    }
    if (lower === 'border' || seg === '境界線' || seg === 'ボーダー') {
      opts.border = true;
      if (opts.frame === 'none') {
        opts.frame = 'border';
      }
      continue;
    }

    // 2. 水平位置・配置 (right / left / center / none)
    if (lower === 'right' || seg === '右' || seg === '右寄せ') {
      opts.align = 'right';
      continue;
    }
    if (lower === 'left' || seg === '左' || seg === '左寄せ') {
      opts.align = 'left';
      continue;
    }
    if (lower === 'center' || lower === 'centre' || seg === '中央' || seg === '中央揃え') {
      opts.align = 'center';
      continue;
    }
    if (lower === 'none' || seg === 'なし' || seg === '配置なし') {
      opts.align = 'none';
      continue;
    }

    // 3. 垂直配置
    if (VALIGN_KEYWORDS.has(lower as MediaImageValign)) {
      opts.valign = lower as MediaImageValign;
      continue;
    }

    // 4. サイズ指定 (300px, x200px, 300x200px, 50%, upright, small/medium/large/full)
    const whMatch = /^(\d+)\s*x\s*(\d+)\s*(?:px)?$/i.exec(seg);
    if (whMatch) {
      opts.width = `${whMatch[1]}px`;
      opts.height = `${whMatch[2]}px`;
      continue;
    }

    const hOnlyMatch = /^x\s*(\d+)\s*px$/i.exec(seg);
    if (hOnlyMatch) {
      opts.height = `${hOnlyMatch[1]}px`;
      continue;
    }

    const wOnlyMatch = /^(\d+)\s*px$/i.exec(seg);
    if (wOnlyMatch) {
      opts.width = `${wOnlyMatch[1]}px`;
      continue;
    }

    const pctMatch = /^(\d+(?:\.\d+)?)\s*%$/.exec(seg);
    if (pctMatch) {
      opts.width = `${pctMatch[1]}%`;
      continue;
    }

    const uprightMatch = /^upright(?:\s*=?\s*([0-9.]+))?$/i.exec(seg);
    if (uprightMatch) {
      const factor = uprightMatch[1] ? parseFloat(uprightMatch[1]) : 0.75;
      const calcWidth = Math.round(220 * (isNaN(factor) || factor <= 0 ? 0.75 : factor));
      opts.width = `${calcWidth}px`;
      if (opts.frame === 'none') opts.frame = 'thumb';
      continue;
    }

    if (lower === 'small' || seg === '小') {
      opts.width = '200px';
      continue;
    }
    if (lower === 'medium' || seg === '中') {
      opts.width = '350px';
      continue;
    }
    if (lower === 'large' || seg === '大') {
      opts.width = '550px';
      continue;
    }
    if (lower === 'full' || seg === '最大') {
      opts.width = '100%';
      continue;
    }

    // 5. Key=Value 属性指定 (alt=..., link=..., caption=..., width=..., height=..., align=..., class=...)
    const kvMatch = /^([a-zA-Z_]+)\s*=\s*(.*)$/.exec(seg);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
      const val = kvMatch[2].trim();
      if (key === 'alt') {
        opts.alt = val;
        continue;
      }
      if (key === 'caption') {
        opts.caption = val;
        continue;
      }
      if (key === 'link') {
        opts.link = val;
        continue;
      }
      if (key === 'width' || key === 'w') {
        opts.width = /^\d+$/.test(val) ? `${val}px` : val;
        continue;
      }
      if (key === 'height' || key === 'h') {
        opts.height = /^\d+$/.test(val) ? `${val}px` : val;
        continue;
      }
      if (key === 'align' || key === 'position' || key === 'pos') {
        if (val === 'left' || val === 'right' || val === 'center' || val === 'none') {
          opts.align = val;
        } else if (val === 'centre') {
          opts.align = 'center';
        }
        continue;
      }
      if (key === 'frame' || key === 'type' || key === 'style') {
        if (val === 'thumb' || val === 'thumbnail') opts.frame = 'thumb';
        else if (val === 'frame' || val === 'framed') opts.frame = 'frame';
        else if (val === 'frameless') opts.frame = 'frameless';
        else if (val === 'border') {
          opts.frame = 'border';
          opts.border = true;
        }
        continue;
      }
      if (key === 'class') {
        opts.className = val;
        continue;
      }
    }

    // 6. いずれの予約語にも一致しないセグメントはキャプション候補
    captionCandidates.push(seg);
  }

  // MediaWiki仕様: 複数の非予約語セグメントがある場合は最後のものをキャプションとする
  if (opts.caption === undefined) {
    if (explicitCaption !== undefined && explicitCaption !== '') {
      opts.caption = explicitCaption;
    } else if (captionCandidates.length > 0) {
      opts.caption = captionCandidates[captionCandidates.length - 1];
    }
  }

  // altが明示指定されていない場合はキャプションまたは最初の候補テキストを設定
  if (opts.alt === undefined) {
    if (captionCandidates.length > 0) {
      opts.alt = captionCandidates[0];
    } else if (opts.caption) {
      opts.alt = opts.caption;
    }
  }

  // MediaWiki標準挙動: thumb または frame で配置が未指定の場合は右寄せ (right) をデフォルトにする
  if ((opts.frame === 'thumb' || opts.frame === 'frame') && !opts.align) {
    opts.align = 'right';
  }

  return opts;
}

/**
 * 設定オプションから MediaWiki 記法 (`[[File:...]]`) または Markdown 拡張記法 (`![...](...)`) を生成する
 */
export function buildMediaMarkdown(
  mediaRef: string,
  options: Partial<MediaImageOptions> & { syntaxMode?: 'mediawiki' | 'markdown' }
): string {
  const mode = options.syntaxMode || 'mediawiki';
  const cleanRef = mediaRef.replace(/^:?(?:file|image|ファイル|画像)\s*:\s*/i, '').trim();

  const parts: string[] = [];

  if (options.frame && options.frame !== 'none') {
    parts.push(options.frame);
  } else if (options.border) {
    parts.push('border');
  }

  if (options.align) {
    // thumb/frame で none が選ばれた場合も明示的に出力し、標準で none の場合は省略可能
    if (
      options.align !== 'none' ||
      options.frame === 'thumb' ||
      options.frame === 'frame'
    ) {
      parts.push(options.align);
    }
  }

  const w = (options.width || '').trim();
  const h = (options.height || '').trim();
  if (w && h) {
    const cleanW = w.replace(/px$/i, '');
    const cleanH = h.replace(/px$/i, '');
    if (/^\d+$/.test(cleanW) && /^\d+$/.test(cleanH)) {
      parts.push(`${cleanW}x${cleanH}px`);
    } else {
      parts.push(/^\d+$/.test(w) ? `${w}px` : w);
      parts.push(`x${cleanH}px`);
    }
  } else if (w) {
    parts.push(/^\d+$/.test(w) ? `${w}px` : w);
  } else if (h) {
    const cleanH = h.replace(/px$/i, '');
    parts.push(`x${cleanH}px`);
  }

  const caption = (options.caption || '').trim();
  const alt = (options.alt || '').trim();

  if (alt && alt !== caption) {
    parts.push(`alt=${alt}`);
  }

  if (options.link !== undefined && options.link !== null) {
    parts.push(`link=${options.link.trim()}`);
  }

  if (caption) {
    parts.push(caption);
  }

  if (mode === 'mediawiki') {
    if (parts.length === 0) {
      return `[[File:${cleanRef}]]`;
    }
    return `[[File:${cleanRef}|${parts.join('|')}]]`;
  } else {
    // Markdown 拡張記法
    if (parts.length === 0) {
      return `![${alt || 'image'}](${cleanRef})`;
    }
    return `![${parts.join('|')}](${cleanRef})`;
  }
}

/**
 * 既存の1行テキストから `[[File:...]]` または `![...](...)` を解析して設定オブジェクトを復元する
 */
export function parseExistingImageMarkdown(lineText: string): {
  syntaxMode: 'mediawiki' | 'markdown';
  mediaRef: string;
  options: MediaImageOptions;
  matchFromOffset: number;
  matchToOffset: number;
} | null {
  // 1. MediaWiki [[File:...]] / [[Image:...]] / [[ファイル:...]] / [[画像:...]]
  const mwRegex = /\[\[(?:file|image|ファイル|画像)\s*:\s*([^\n\]]+)\]\]/i;
  const mwMatch = mwRegex.exec(lineText);
  if (mwMatch) {
    const inner = mwMatch[1];
    const parts = inner.split('|');
    const mediaRef = (parts[0] || '').trim();
    const options = parseMediaWikiImageOptions(parts.slice(1));
    return {
      syntaxMode: 'mediawiki',
      mediaRef,
      options,
      matchFromOffset: mwMatch.index,
      matchToOffset: mwMatch.index + mwMatch[0].length,
    };
  }

  // 2. Markdown ![alt|...](src "title")
  const mdRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/;
  const mdMatch = mdRegex.exec(lineText);
  if (mdMatch) {
    const rawAlt = mdMatch[1] || '';
    const mediaRef = (mdMatch[2] || '').trim();
    const rawTitle = mdMatch[3];
    const segments = rawAlt.includes('|') ? rawAlt.split('|') : rawAlt ? [rawAlt] : [];
    const options = parseMediaWikiImageOptions(segments, rawTitle);
    return {
      syntaxMode: 'markdown',
      mediaRef,
      options,
      matchFromOffset: mdMatch.index,
      matchToOffset: mdMatch.index + mdMatch[0].length,
    };
  }

  return null;
}

