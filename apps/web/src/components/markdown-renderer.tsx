'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Check, Copy } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/media';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  siteSlug?: string;
}

/**
 * 見出しテキストから日本語・英数字対応のIDスラッグを生成
 */
export function slugifyHeading(text: string): string {
  if (!text) return 'heading';
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[\s\t\r\n]+/g, '-')
      .replace(/[^\p{L}\p{N}\-_]/gu, '')
      .replace(/^-+|-+$/g, '') || 'heading'
  );
}

/**
 * Markdownの前処理:
 * 1. 箇条書きリスト内での斜体指定を補正
 *    - "* 斜体*" のように箇条書き記号と同一記号で斜体を指定したケースを "* *斜体*" に補正
 *    - "- * 斜体*" や "- *斜体 *" のようにアスタリスク前後にスペースが入って斜体判定から外れたケースを補正
 */
function preprocessMarkdown(content: string, siteSlug?: string): string {
  if (!content) return '';
  let result = content;

  // 1. "* 斜体*" -> "* *斜体*"
  result = result.replace(/^([ \t]*[*])([ \t]+)(?!\*)([^\n*]+)\*[ \t]*$/gm, '$1$2*$3*');
  // 2. "- * 斜体*" -> "- *斜体*"
  result = result.replace(/^([ \t]*[-*+])([ \t]+)\*[ \t]+([^\n*]+)\*[ \t]*$/gm, '$1$2*$3*');
  // 3. "- *斜体 *" -> "- *斜体*"
  result = result.replace(/^([ \t]*[-*+])([ \t]+)\*([^\n*]+)[ \t]+\*[ \t]*$/gm, '$1$2*$3*');

  // 4. Transform ==highlight== to [text](bg:%23fef08a)
  result = result.replace(/==([^=\n]+)==/g, '[$1](bg:%23fef08a)');

  // 5. Transform [text]{color:#hex} or [text]{color:red} or [text]{#hex} or [text]{bg:#hex} or combined
  result = result.replace(/\[([^\]\n]+)\]\{([^\}\n]+)\}/g, (match, text, attrs) => {
    let color = '';
    let bg = '';
    const directHex = /^\s*#([0-9a-fA-F]{3,8})\s*$/.exec(attrs);
    if (directHex) {
      color = '#' + directHex[1];
    } else {
      const colorMatch = /(?:^|[\s;])color\s*:\s*([^;\}]+)/i.exec(attrs);
      if (colorMatch) color = colorMatch[1].trim();

      const bgMatch = /(?:^|[\s;])bg(?:-color)?\s*:\s*([^;\}]+)/i.exec(attrs);
      if (bgMatch) bg = bgMatch[1].trim();

      const singleColor = /^\s*([a-zA-Z]+)\s*$/.exec(attrs);
      if (!color && !bg && singleColor) {
        const c = singleColor[1].toLowerCase();
        const known = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'gray', 'black', 'white', 'cyan'];
        if (known.includes(c)) color = c;
      }
    }

    const params: string[] = [];
    if (color) params.push('color:' + encodeURIComponent(color));
    if (bg) params.push('bg:' + encodeURIComponent(bg));

    if (params.length > 0) {
      return `[${text}](${params.join('&')})`;
    }
    return match;
  });

  // 6. Transform <span style="...color: ..."> and <font color="...">
  result = result.replace(/<span\s+style="([^"]*)"\s*>([\s\S]*?)<\/span>/gi, (match, style, text) => {
    const colorMatch = /color\s*:\s*([^;"]+)/i.exec(style);
    const bgMatch = /background(?:-color)?\s*:\s*([^;"]+)/i.exec(style);
    const params: string[] = [];
    if (colorMatch) params.push('color:' + encodeURIComponent(colorMatch[1].trim()));
    if (bgMatch) params.push('bg:' + encodeURIComponent(bgMatch[1].trim()));
    if (params.length > 0) {
      return `[${text}](${params.join('&')})`;
    }
    return match;
  });

  result = result.replace(/<font\s+color="([^"]+)"\s*>([\s\S]*?)<\/font>/gi, (match, color, text) => {
    return `[${text}](color:${encodeURIComponent(color.trim())})`;
  });

  // 7. Wikiリンク [[target]] または [[target|label]]
  result = result.replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g, (_, rawTarget, rawLabel) => {
    const target = (rawTarget || '').trim();
    if (!target) return '';
    const label = (rawLabel ? rawLabel.trim() : target) || target;

    // ページ内アンカー: [[#見出し]]
    if (target.startsWith('#')) {
      const heading = target.slice(1).trim();
      const slug = slugifyHeading(heading);
      return `[${label}](#${slug})`;
    }

    // 別ページのアンカー: [[page-slug#見出し]]
    if (target.includes('#')) {
      const [pageSlug, heading] = target.split('#');
      const slug = slugifyHeading(heading.trim());
      const pSlug = pageSlug.trim().replace(/^\//, '');
      if (siteSlug) {
        return `[${label}](/sites/${siteSlug}/${pSlug}#${slug})`;
      }
      return `[${label}](/${pSlug}#${slug})`;
    }

    // サイト内別ページ: [[page-slug]]
    const pSlug = target.replace(/^\//, '');
    if (siteSlug) {
      return `[${label}](/sites/${siteSlug}/${pSlug})`;
    }
    return `[${label}](/${pSlug})`;
  });

  return result;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node) && (node.props as any)?.children) {
    return extractText((node.props as any).children);
  }
  return '';
}

export function MarkdownRenderer({ content, className = '', siteSlug }: MarkdownRendererProps) {
  const processedContent = React.useMemo(() => preprocessMarkdown(content, siteSlug), [content, siteSlug]);
  const headingTracker = React.useRef(new Map<string, number>());
  headingTracker.current = new Map<string, number>();

  // ページ読み込み時・コンテンツ更新時のアンカーハッシュスクロール
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const decoded = decodeURIComponent(hash);
      const timer = setTimeout(() => {
        const el =
          document.getElementById(decoded) ||
          document.getElementById(slugifyHeading(decoded)) ||
          document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [processedContent]);

  const renderHeading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
    return function HeadingComponent({ children, ...props }: any) {
      const rawText = extractText(children);
      const baseSlug = slugifyHeading(rawText);
      const count = headingTracker.current.get(baseSlug) || 0;
      headingTracker.current.set(baseSlug, count + 1);
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      const handleAnchorClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.pushState(null, '', `#${id}`);
        }
      };

      return (
        <Tag id={id} className="group relative scroll-mt-24" {...props}>
          <a
            href={`#${id}`}
            onClick={handleAnchorClick}
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-5 top-0 bottom-0 flex items-center text-muted-foreground/60 hover:text-primary pr-1 no-underline font-normal text-sm select-none"
            aria-label={`${rawText} へのリンク`}
            title="この見出しへのリンク"
          >
            #
          </a>
          {children}
        </Tag>
      );
    };
  };

  return (
    <div className={`markdown-body max-w-none ${className}`}>
      <ReactMarkdown
        urlTransform={(url) => {
          const trimmed = (url || '').trim().toLowerCase();
          if (
            trimmed.startsWith('javascript:') ||
            trimmed.startsWith('vbscript:') ||
            trimmed.startsWith('data:text/html')
          ) {
            return '';
          }
          return url;
        }}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          h1: renderHeading('h1'),
          h2: renderHeading('h2'),
          h3: renderHeading('h3'),
          h4: renderHeading('h4'),
          h5: renderHeading('h5'),
          h6: renderHeading('h6'),
          pre({ children }) {
            // 不要な二重外枠 pre タグの生成を防ぎフラグメントとして子要素を直接展開
            return <>{children}</>;
          },
          em({ children, ...props }) {
            return (
              <em className="italic" style={{ fontStyle: 'italic' }} {...props}>
                {children}
              </em>
            );
          },
          code({ className, children, ...props }) {
            const hasLang = /language-(\w+)/.exec(className || '');
            const codeText = extractText(children);
            const isBlock = Boolean(hasLang) || codeText.includes('\n');

            if (isBlock) {
              const lang = hasLang ? hasLang[1] : '';
              return (
                <div className="relative group my-4 rounded-xl overflow-hidden border border-slate-700/80 shadow-md bg-slate-950">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-slate-300 text-xs font-mono border-b border-slate-800">
                    <span className="font-semibold text-slate-300">{lang || 'code'}</span>
                    <CopyButton text={codeText.replace(/\n$/, '')} />
                  </div>
                  <pre className="!m-0 !rounded-none !p-4 bg-slate-950 text-slate-100 overflow-x-auto text-sm font-mono leading-relaxed">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="my-4 overflow-x-auto">
                <table className="border-collapse border border-border text-left text-sm my-2" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          a({ href, children, ...props }) {
            // 文字色・背景色（ハイライト）リンク記号の検知
            if (href && (href.startsWith('color:') || href.startsWith('bg:'))) {
              let color: string | undefined;
              let bg: string | undefined;

              const parts = href.split('&');
              for (const part of parts) {
                if (part.startsWith('color:')) {
                  try {
                    color = decodeURIComponent(part.replace(/^color:/, ''));
                  } catch {
                    color = part.replace(/^color:/, '');
                  }
                } else if (part.startsWith('bg:')) {
                  try {
                    bg = decodeURIComponent(part.replace(/^bg:/, ''));
                  } catch {
                    bg = part.replace(/^bg:/, '');
                  }
                }
              }

              // 安全なカラー書式チェック
              const isValidColor = (val?: string) => {
                if (!val) return false;
                return (
                  /^#([0-9a-fA-F]{3,8})$/.test(val) ||
                  /^[a-zA-Z]+$/.test(val) ||
                  /^rgba?\([0-9,\s.%]+\)$/.test(val) ||
                  /^hsla?\([0-9,\s.%]+\)$/.test(val)
                );
              };

              const safeColor = isValidColor(color) ? color : undefined;
              const safeBg = isValidColor(bg) ? bg : undefined;

              return (
                <span
                  style={{
                    color: safeColor,
                    backgroundColor: safeBg,
                    padding: safeBg ? '0.15em 0.4em' : undefined,
                    borderRadius: safeBg ? '0.25rem' : undefined,
                  }}
                  className={safeBg ? (safeColor ? 'inline font-medium' : 'inline font-medium text-slate-900 dark:text-slate-100') : 'inline font-medium'}
                >
                  {children}
                </span>
              );
            }

            // ページ内アンカーリンク (#...)
            if (href?.startsWith('#')) {
              const hash = href.slice(1);
              const handleClick = (e: React.MouseEvent) => {
                e.preventDefault();
                if (!hash) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  history.pushState(null, '', window.location.pathname + window.location.search);
                  return;
                }
                const decoded = decodeURIComponent(hash);
                const target =
                  document.getElementById(decoded) ||
                  document.getElementById(slugifyHeading(decoded)) ||
                  document.getElementById(hash);
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  history.pushState(null, '', href);
                }
              };

              return (
                <a
                  href={href}
                  onClick={handleClick}
                  className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors font-medium cursor-pointer"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors font-medium"
                {...props}
              >
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            const rawSrc = typeof src === 'string' ? src : '';
            const resolvedSrc = resolveMediaUrl(rawSrc);
            return (
              <figure className="my-6">
                <img
                  src={resolvedSrc}
                  alt={alt || 'image'}
                  className="rounded-xl shadow-md max-w-full h-auto mx-auto border border-border transition-transform hover:scale-[1.01]"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (rawSrc && target.src !== rawSrc && !target.dataset.triedFallback) {
                      target.dataset.triedFallback = 'true';
                      target.src = rawSrc;
                    }
                  }}
                  {...props}
                />
                {alt && (
                  <figcaption className="text-center text-xs text-muted-foreground mt-2 italic">
                    {alt}
                  </figcaption>
                )}
              </figure>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
      title="コードをコピー"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-400" />
          <span className="text-[11px] text-emerald-400 font-medium">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span className="text-[11px]">Copy</span>
        </>
      )}
    </button>
  );
}
