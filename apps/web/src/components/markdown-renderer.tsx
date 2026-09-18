'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Markdownの前処理:
 * 1. 箇条書きリスト内での斜体指定を補正
 *    - "* 斜体*" のように箇条書き記号と同一記号で斜体を指定したケースを "* *斜体*" に補正
 *    - "- * 斜体*" や "- *斜体 *" のようにアスタリスク前後にスペースが入って斜体判定から外れたケースを補正
 */
function preprocessMarkdown(content: string): string {
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

  return result;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const processedContent = React.useMemo(() => preprocessMarkdown(content), [content]);

  return (
    <div className={`markdown-body max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          em({ children, ...props }) {
            return (
              <em className="italic" style={{ fontStyle: 'italic' }} {...props}>
                {children}
              </em>
            );
          },
          code({ className, children, ...props }) {
            const hasLang = /language-(\w+)/.exec(className || '');
            const isBlock = Boolean(hasLang) || String(children).includes('\n');

            if (isBlock && hasLang) {
              const lang = hasLang[1];
              const codeText = String(children).replace(/\n$/, '');
              return (
                <div className="relative group my-4 rounded-xl overflow-hidden border border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-slate-300 text-xs font-mono border-b border-slate-800">
                    <span className="font-semibold text-slate-300">{lang}</span>
                    <CopyButton text={codeText} />
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
            return (
              <figure className="my-6">
                <img
                  src={src}
                  alt={alt || 'image'}
                  className="rounded-xl shadow-md max-w-full h-auto mx-auto border border-border transition-transform hover:scale-[1.01]"
                  loading="lazy"
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
