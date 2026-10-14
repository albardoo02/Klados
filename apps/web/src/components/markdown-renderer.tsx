'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MediaImageOptions,
  parseMediaWikiImageOptions,
  resolveMediaUrl,
} from '@/lib/media';
import { getSitePrefix } from '@/lib/site-url';

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

export interface ExtractedCategoryItem {
  name: string;
  sortKey: string;
}

/**
 * Markdown本文から [[Category:カテゴリ名]] および [[カテゴリ:カテゴリ名]] を抽出
 */
export function extractCategoriesFromMarkdown(
  content?: string,
  defaultSortKey: string = ''
): ExtractedCategoryItem[] {
  if (!content) return [];
  const regex = /\[\[(:?)(?:category|カテゴリ)\s*:\s*([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/gi;
  const categories: ExtractedCategoryItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const isInline = match[1] === ':';
    if (isInline) continue;

    const rawName = (match[2] || '').trim();
    if (!rawName) continue;

    const lower = rawName.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    const sortKey =
      (match[3] !== undefined && match[3] !== null ? match[3] : '').trim() ||
      defaultSortKey ||
      rawName;

    categories.push({ name: rawName, sortKey });
  }

  return categories;
}

/**
 * ページの categories 配列 / frontmatter.categories / Markdown本文内の [[Category:...]] を統合して取得
 */
export function getPageCategories(
  page?: {
    title?: string;
    slug?: string;
    content?: string;
    categories?: string[];
    frontmatter?: { categories?: string[]; [key: string]: any };
  } | null
): ExtractedCategoryItem[] {
  if (!page) return [];
  const defaultSortKey = page.title || page.slug || '';
  const result: ExtractedCategoryItem[] = [];
  const seen = new Set<string>();

  const explicitCats = Array.isArray(page.categories)
    ? page.categories
    : Array.isArray(page.frontmatter?.categories)
    ? page.frontmatter!.categories!
    : [];

  for (const raw of explicitCats) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push({ name, sortKey: defaultSortKey || name });
  }

  for (const item of extractCategoriesFromMarkdown(page.content, defaultSortKey)) {
    const lower = item.name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(item);
  }

  return result;
}

export function getPageCategoryNames(
  page?: {
    title?: string;
    slug?: string;
    content?: string;
    categories?: string[];
    frontmatter?: { categories?: string[]; [key: string]: any };
  } | null
): string[] {
  return getPageCategories(page).map((c) => c.name);
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

  // 3.5. 連続する太字デリミタ (**A****B**) の間にゼロ幅スペースを補完して行全体の太字化・構文崩壊を防止
  result = result.replace(/(\*\*[^\*\n]+?\*\*)(?=\*\*)/g, '$1\u200B');

  // 4. Transform ==highlight== to [text](bg:%23fef08a)
  result = result.replace(/==([^=\n]+)==/g, '[$1](bg:%23fef08a)');

  // 4.5. Transform <u>text</u> to [text](underline:true)
  result = result.replace(/<u>([\s\S]*?)<\/u>/gi, '[$1](underline:true)');

  // 5. Transform [text]{color:#hex} or [text]{color:red} or [text]{#hex} or [text]{bg:#hex} or [text]{u} or combined
  result = result.replace(/\[([^\]\n]+)\]\{([^\}\n]+)\}/g, (match, text, attrs) => {
    let color = '';
    let bg = '';
    let isUnderline = false;
    const directHex = /^\s*#([0-9a-fA-F]{3,8})\s*$/.exec(attrs);
    if (directHex) {
      color = '#' + directHex[1];
    } else {
      const colorMatch = /(?:^|[\s;])color\s*:\s*([^;\}]+)/i.exec(attrs);
      if (colorMatch) color = colorMatch[1].trim();

      const bgMatch = /(?:^|[\s;])bg(?:-color)?\s*:\s*([^;\}]+)/i.exec(attrs);
      if (bgMatch) bg = bgMatch[1].trim();

      if (/(?:^|[\s;])(?:u|underline)(?:[\s;\}]|$)/i.test(attrs)) {
        isUnderline = true;
      }

      const singleColor = /^\s*([a-zA-Z]+)\s*$/.exec(attrs);
      if (!color && !bg && singleColor && !isUnderline) {
        const c = singleColor[1].toLowerCase();
        const known = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'gray', 'black', 'white', 'cyan'];
        if (known.includes(c)) color = c;
      }
    }

    const params: string[] = [];
    if (color) params.push('color:' + encodeURIComponent(color));
    if (bg) params.push('bg:' + encodeURIComponent(bg));
    if (isUnderline) params.push('underline:true');

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

  const sitePrefix = getSitePrefix(siteSlug);

  // 6.5. MediaWiki カテゴリ記法
  // 6.5.1. インラインリンク: [[:Category:カテゴリ名]] または [[:Category:カテゴリ名|表示名]]
  result = result.replace(
    /\[\[:(?:category|カテゴリ)\s*:\s*([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/gi,
    (_, rawCat, rawLabel) => {
      const catName = (rawCat || '').trim();
      if (!catName) return '';
      const label = (rawLabel ? rawLabel.trim() : `Category:${catName}`) || `Category:${catName}`;
      return `[${label}](${sitePrefix}/Category:${encodeURIComponent(catName)})`;
    }
  );

  // 6.5.2. ページカテゴリ付与: [[Category:カテゴリ名]] または [[Category:カテゴリ名|ソートキー]] (本文からは除去)
  result = result.replace(/\[\[(?:category|カテゴリ)\s*:\s*([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\n?/gi, '');

  // 6.6. MediaWiki インラインファイルリンク: [[:File:ファイル名|表示名]] / [[:Image:...]] / [[:ファイル:...]] / [[:画像:...]]
  result = result.replace(
    /\[\[:(?:file|image|ファイル|画像)\s*:\s*([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/gi,
    (_, rawFile, rawLabel) => {
      const fileTarget = (rawFile || '').trim();
      if (!fileTarget) return '';
      const resolved = resolveMediaUrl(fileTarget);
      const label = (rawLabel ? rawLabel.trim() : fileTarget) || fileTarget;
      return `[${label}](${(resolved || fileTarget).replace(/\s+/g, '%20')})`;
    }
  );

  // 7. Wikiリンク [[target]] または [[target|label]] または [[label>target]]
  // (MediaWiki の File:/Image:/Category: は除外し、内側の [[WikiLink]] から先に解決できるようにする)
  result = result.replace(
    /\[\[(?!:?(?:file|image|ファイル|画像|category|カテゴリ)\s*:)([^\[\]\n]+)\]\]/gi,
    (fullMatch, inner) => {
      if (/^:?(?:category|カテゴリ|file|image|ファイル|画像)\s*:/i.test(inner.trim())) {
        return fullMatch;
      }

      let target = '';
      let label = '';

      if (inner.includes('>')) {
        // SeesaaWiki / PukiWiki スタイル: [[表示名>URL/ページ]]
        const parts = inner.split('>');
        label = parts[0].trim();
        target = parts.slice(1).join('>').trim();
      } else if (inner.includes('|')) {
        const parts = inner.split('|');
        const p1 = parts[0].trim();
        const p2 = parts.slice(1).join('|').trim();
        // URLがどちらにあるかを自動判定
        if (/^https?:\/\//i.test(p1) || /^www\./i.test(p1)) {
          target = p1;
          label = p2 || p1;
        } else if (/^https?:\/\//i.test(p2) || /^www\./i.test(p2)) {
          label = p1;
          target = p2;
        } else {
          // MediaWiki標準: [[target|label]]
          target = p1;
          label = p2 || p1;
        }
      } else {
        target = inner.trim();
        label = target;
      }

      if (!target) return '';

      // 外部リンク判定 (http://, https://, www., //)
      const isExt = /^https?:\/\//i.test(target) || /^www\./i.test(target) || target.startsWith('//');
      if (isExt) {
        const finalUrl = /^www\./i.test(target) ? `https://${target}` : target;
        return `[${label}](${finalUrl})`;
      }

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
        const pSlug = pageSlug.trim().replace(/^\.?\//, '').replace(/\.(?:md|markdown)$/i, '');
        const isHome = pSlug.toLowerCase() === 'readme' || pSlug.toLowerCase() === 'index' || pSlug.toLowerCase() === 'home' || pSlug === '';
        const targetPath = isHome ? (sitePrefix || '') : (sitePrefix ? `${sitePrefix}/${pSlug}` : `/${pSlug}`);
        return `[${label}](${targetPath}#${slug})`;
      }

      // サイト内別ページ: [[page-slug]]
      const pSlug = target.trim().replace(/^\.?\//, '').replace(/\.(?:md|markdown)$/i, '');
      const isHome = pSlug.toLowerCase() === 'readme' || pSlug.toLowerCase() === 'index' || pSlug.toLowerCase() === 'home' || pSlug === '';
      const targetPath = isHome ? (sitePrefix || '/') : (sitePrefix ? `${sitePrefix}/${pSlug}` : `/${pSlug}`);
      return `[${label}](${targetPath})`;
    }
  );

  // 7.5. MediaWiki 画像埋め込み記法: [[File:target|thumb|right|300px|キャプション]] / [[Image:...]] / [[ファイル:...]] / [[画像:...]]
  result = result.replace(
    /\[\[(?:file|image|ファイル|画像)\s*:\s*([^\n]+?)\]\]/gi,
    (_, inner) => {
      const parts = String(inner || '').split('|');
      const rawTarget = (parts[0] || '').trim();
      if (!rawTarget) return '';
      const options = parseMediaWikiImageOptions(parts.slice(1));
      const resolved = resolveMediaUrl(rawTarget);
      const safeUrl = (resolved || rawTarget).replace(/\s+/g, '%20');
      const metaPayload = encodeURIComponent(
        JSON.stringify({
          rawTarget,
          options,
        })
      );
      return `![MW_IMG_DATA:${metaPayload}](${safeUrl})`;
    }
  );

  return result;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node.replace(/<br\s*\/?>/gi, ' ');
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node) && (node.props as any)?.children) {
    return extractText((node.props as any).children);
  }
  return '';
}

/**
 * 文字列ノード内の <br>, <br/>, <br /> タグを実際の <br /> React要素に変換し、
 * Markdownテーブル内やテキスト内の改行を安全かつ正確に反映する
 */
function renderWithBr(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    if (!/<br\s*\/?>/i.test(node)) return node;
    const parts = node.split(/(<br\s*\/?>)/i);
    return parts.map((part, i) => {
      if (/<br\s*\/?>/i.test(part)) {
        return <br key={`br-${i}`} />;
      }
      return part;
    });
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => {
      const res = renderWithBr(child);
      if (React.isValidElement(res) && !res.key) {
        return React.cloneElement(res, { key: `item-${i}` });
      }
      return res;
    });
  }
  if (React.isValidElement(node)) {
    if (node.type === 'code' || node.type === 'pre') {
      return node;
    }
    const children = (node.props as any)?.children;
    if (children) {
      return React.cloneElement(node, undefined, renderWithBr(children));
    }
  }
  return node;
}

/**
 * キャプション内の簡易インライン装飾（リンク [text](url)、**太字**、*斜体*、`コード`）をReactノードに変換
 */
function renderInlineCaption(text?: string): React.ReactNode {
  if (!text) return null;
  const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const href = match[3];
      const isExt = /^https?:\/\//i.test(href);
      nodes.push(
        <a
          key={`cap-link-${keyIdx++}`}
          href={href}
          target={isExt ? '_blank' : undefined}
          rel={isExt ? 'noopener noreferrer' : undefined}
          onClick={(e) => e.stopPropagation()}
          className="text-blue-500 hover:text-blue-600 underline underline-offset-2 font-medium"
        >
          {label}
        </a>
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={`cap-bold-${keyIdx++}`} className="font-semibold text-foreground">
          {match[4]}
        </strong>
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <em key={`cap-em-${keyIdx++}`} className="italic">
          {match[5]}
        </em>
      );
    } else if (match[6] !== undefined) {
      nodes.push(
        <code
          key={`cap-code-${keyIdx++}`}
          className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px] not-italic"
        >
          {match[6]}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

/**
 * HTMLの属性文字列 (例: id="m2" name="m2" class="foo") をパースして HAST properties オブジェクトを生成
 */
function parseHtmlAttributes(attrString: string): Record<string, any> {
  const properties: Record<string, any> = {};
  if (!attrString) return properties;

  const attrRegex = /([a-zA-Z0-9_\-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? true;

    if (key === 'class') {
      properties.className = String(val).trim();
    } else if (key === 'id') {
      properties.id = String(val).trim();
    } else if (key === 'name') {
      properties.name = String(val).trim();
      // id が未設定の場合は name を id としても扱う（ページ内アンカー互換性）
      if (!properties.id) {
        properties.id = String(val).trim();
      }
    } else if (key === 'href') {
      const trimmed = String(val).trim();
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith('javascript:') ||
        lower.startsWith('vbscript:') ||
        lower.startsWith('data:text/html')
      ) {
        properties.href = '#';
      } else {
        properties.href = trimmed;
      }
    } else if (key === 'target') {
      properties.target = String(val).trim();
    } else if (key === 'rel') {
      properties.rel = String(val).trim();
    } else if (key === 'title') {
      properties.title = String(val).trim();
    } else if (key === 'style') {
      properties.style = String(val).trim();
    } else if (key === 'align') {
      properties.align = String(val).trim();
    }
  }

  return properties;
}

/**
 * raw / html ノードの文字列を解析し、HAST の element / text ノード配列に変換
 */
function parseRawHtmlToHast(val: string): any[] {
  if (!val) return [];

  // HTMLタグやコメントが含まれていない場合はプレーンテキストとして返す
  if (!/<[a-zA-Z!/]/.test(val)) {
    return [{ type: 'text', value: val }];
  }

  const nodes: any[] = [];
  let remaining = val;

  // タグまたはコメントにマッチ
  const tagTokenRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9]+)((?:\s+[^>]*)?)(\/?)>/;

  while (remaining.length > 0) {
    const match = tagTokenRegex.exec(remaining);
    if (!match) {
      if (remaining.length > 0) {
        nodes.push({ type: 'text', value: remaining });
      }
      break;
    }

    // タグの直前にあるテキスト
    if (match.index > 0) {
      const textBefore = remaining.slice(0, match.index);
      if (textBefore.length > 0) {
        nodes.push({ type: 'text', value: textBefore });
      }
    }

    const fullMatch = match[0];
    remaining = remaining.slice(match.index + fullMatch.length);

    // HTMLコメントはレンダリングせず除外
    if (fullMatch.startsWith('<!--')) {
      continue;
    }

    const isClose = match[1] === '/';
    const rawTagName = (match[2] || '').toLowerCase();
    const attrString = match[3] || '';

    // セキュリティ上の危険なタグは除外
    if (['script', 'iframe', 'object', 'embed', 'style'].includes(rawTagName)) {
      continue;
    }

    const isSelfClosing =
      match[4] === '/' ||
      rawTagName === 'br' ||
      rawTagName === 'hr' ||
      rawTagName === 'img' ||
      rawTagName === 'wbr';

    if (isClose) {
      // 孤立した閉じタグは無視
      continue;
    }

    const properties = parseHtmlAttributes(attrString);

    // 単独アンカータグ（例: <a id="m2"></a> や <a id="m2" />、または閉じタグのない <a id="m2">）
    if (rawTagName === 'a' && (properties.id || properties.name) && !properties.href) {
      const closeAMatch = /^[\s\n]*<\/a>/i.exec(remaining);
      if (closeAMatch) {
        remaining = remaining.slice(closeAMatch[0].length);
      }
      nodes.push({
        type: 'element',
        tagName: 'a',
        properties,
        children: [],
      });
      continue;
    }

    // 直後に対応する閉じタグがあるか確認
    let innerText: string | null = null;
    if (!isSelfClosing) {
      const closePattern = new RegExp(`^([\\s\\S]*?)<\\/${rawTagName}>`, 'i');
      const closeMatch = closePattern.exec(remaining);
      if (closeMatch) {
        innerText = closeMatch[1];
        remaining = remaining.slice(closeMatch[0].length);
      }
    }

    const children = innerText !== null ? parseRawHtmlToHast(innerText) : [];

    if (rawTagName === 'center') {
      nodes.push({
        type: 'element',
        tagName: 'div',
        properties: { ...properties, className: `${properties.className || ''} text-center`.trim() },
        children,
      });
    } else {
      nodes.push({
        type: 'element',
        tagName: rawTagName,
        properties,
        children,
      });
    }
  }

  return nodes;
}

/**
 * rehype plugin to transform <details>, <summary>, and raw HTML nodes (<a id="...">, <span ...>, <br>, etc.) into real HAST elements
 */
function rehypeDetails() {
  return function transformer(tree: any) {
    function transformNodes(nodes: any[]): any[] {
      const result: any[] = [];
      const stack: any[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (node.type === 'raw' || node.type === 'html') {
          const val = String(node.value || '');

          if (/<details(\s+[^>]*)?>/i.test(val)) {
            const isOpen = /<details\s+[^>]*open/i.test(val);
            const detailsNode: any = {
              type: 'element',
              tagName: 'details',
              properties: isOpen ? { open: true } : {},
              children: [],
            };

            const summaryMatch = /<summary(?:\s+[^>]*)?>([\s\S]*?)<\/summary>/i.exec(val);
            if (summaryMatch) {
              detailsNode.children.push({
                type: 'element',
                tagName: 'summary',
                properties: {},
                children: [{ type: 'text', value: summaryMatch[1].trim() }],
              });
            }

            stack.push(detailsNode);
            continue;
          }

          if (stack.length > 0 && /<summary(?:\s+[^>]*)?>([\s\S]*?)<\/summary>/i.test(val)) {
            const current = stack[stack.length - 1];
            const hasSummary = current.children.some((c: any) => c.tagName === 'summary');
            if (!hasSummary) {
              const summaryMatch = /<summary(?:\s+[^>]*)?>([\s\S]*?)<\/summary>/i.exec(val);
              current.children.push({
                type: 'element',
                tagName: 'summary',
                properties: {},
                children: [{ type: 'text', value: summaryMatch ? summaryMatch[1].trim() : '詳細' }],
              });
              continue;
            }
          }

          if (/<\/details>/i.test(val)) {
            if (stack.length > 0) {
              const finished = stack.pop();
              const hasSummary = finished.children.some((c: any) => c.tagName === 'summary');
              if (!hasSummary) {
                finished.children.unshift({
                  type: 'element',
                  tagName: 'summary',
                  properties: {},
                  children: [{ type: 'text', value: '詳細' }],
                });
              }

              if (stack.length > 0) {
                stack[stack.length - 1].children.push(finished);
              } else {
                result.push(finished);
              }
            }
            continue;
          }

          // その他の raw HTML ノード（<a id="...">, <span ...>, <br>, コメント等）の変換
          const parsedNodes = parseRawHtmlToHast(val);
          for (const pNode of parsedNodes) {
            if (stack.length > 0) {
              stack[stack.length - 1].children.push(pNode);
            } else {
              result.push(pNode);
            }
          }
          continue;
        }

        if (stack.length > 0) {
          if (node.children) {
            node.children = transformNodes(node.children);
          }
          stack[stack.length - 1].children.push(node);
        } else {
          if (node.children) {
            node.children = transformNodes(node.children);
          }
          result.push(node);
        }
      }

      while (stack.length > 0) {
        const unclosed = stack.pop();
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(unclosed);
        } else {
          result.push(unclosed);
        }
      }

      return result;
    }

    if (tree && Array.isArray(tree.children)) {
      tree.children = transformNodes(tree.children);
    }
  };
}

/**
 * MediaWiki MultimediaViewer 風 全画面画像拡大モーダル (Lightbox)
 */
function ImageLightboxModal({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [fitScreen, setFitScreen] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => {
          const next = Math.max(0.25, +(z - 0.25).toFixed(2));
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setFitScreen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom((z) => {
      const next = Math.min(5, Math.max(0.25, +(z + delta).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };
    const onUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // 画面いっぱいにフィットさせるための表示サイズ計算
  let computedWidth: number | undefined;
  let computedHeight: number | undefined;

  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
    if (fitScreen) {
      const availW = viewportSize.width * 0.9;
      const availH = viewportSize.height * 0.78;
      const scale = Math.min(availW / naturalSize.width, availH / naturalSize.height);
      computedWidth = Math.max(120, Math.round(naturalSize.width * scale));
      computedHeight = Math.max(120, Math.round(naturalSize.height * scale));
    } else {
      computedWidth = naturalSize.width;
      computedHeight = naturalSize.height;
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150"
      onClick={onClose}
      onWheel={handleWheel}
      role="dialog"
      aria-modal="true"
      aria-label={caption || alt || '画像の拡大表示'}
    >
      {/* 上部コントロールバー */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/80 to-transparent text-white z-10 shrink-0 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-white/10 text-blue-400 shrink-0">
            <ImageIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md md:max-w-xl">
              {caption || alt || '画像プレビュー'}
            </div>
            {naturalSize && (
              <div className="text-[11px] text-white/60 font-mono">
                {naturalSize.width} × {naturalSize.height} px
                {fitScreen ? ' (画面最大化フィット)' : ' (原寸 1:1 基準)'}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* ズームアウト */}
          <button
            type="button"
            onClick={() =>
              setZoom((z) => {
                const next = Math.max(0.25, +(z - 0.25).toFixed(2));
                if (next <= 1) setPan({ x: 0, y: 0 });
                return next;
              })
            }
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="縮小 (-)"
          >
            <ZoomOut className="size-4" />
          </button>

          {/* ズーム倍率表示 & リセット */}
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setRotation(0);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-semibold transition-colors cursor-pointer min-w-[54px] text-center"
            title="クリックして倍率と位置をリセット (0)"
          >
            {Math.round(zoom * 100)}%
          </button>

          {/* ズームイン */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="拡大 (+)"
          >
            <ZoomIn className="size-4" />
          </button>

          {/* 画面フィット / 原寸1:1 切替 */}
          <button
            type="button"
            onClick={() => {
              setFitScreen((prev) => !prev);
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              fitScreen
                ? 'bg-blue-600/80 hover:bg-blue-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white/90'
            }`}
            title={fitScreen ? '原寸サイズ (1:1) で表示' : '画面いっぱいにフィット拡大'}
          >
            {fitScreen ? (
              <>
                <Maximize2 className="size-3.5" />
                <span>画面フィット</span>
              </>
            ) : (
              <>
                <Minimize2 className="size-3.5" />
                <span>原寸 1:1</span>
              </>
            )}
          </button>

          {/* 90度回転 */}
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="90°回転"
          >
            <RotateCw className="size-4" />
          </button>

          {/* 別タブで原寸画像を開く */}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="新しいタブで元画像を開く"
          >
            <ExternalLink className="size-4" />
          </a>

          {/* ダウンロード */}
          <a
            href={src}
            download={alt || 'image'}
            className="hidden sm:inline-flex p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="画像をダウンロード"
          >
            <Download className="size-4" />
          </a>

          <div className="h-5 w-px bg-white/20 mx-1" />

          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/15 hover:bg-rose-500 text-white transition-colors cursor-pointer"
            title="閉じる (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* メイン画像ステージ (クリックで背景閉じ、画像はドラッグ移動＆ダブルクリック拡大) */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 sm:p-8">
        <img
          src={src}
          alt={alt || caption || 'image'}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (zoom > 1) {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            } else {
              setZoom(2);
            }
          }}
          onMouseDown={handleMouseDown}
          draggable={false}
          style={{
            width: computedWidth ? `${computedWidth}px` : undefined,
            height: computedHeight ? `${computedHeight}px` : undefined,
            maxWidth: computedWidth ? 'none' : '90vw',
            maxHeight: computedHeight ? 'none' : '78vh',
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
          }}
          className={`object-contain rounded-lg shadow-2xl ring-1 ring-white/15 ${
            isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in'
          }`}
        />
      </div>

      {/* 下部キャプション・操作ヒントバー (MediaWiki MediaViewer 風) */}
      <div
        className="px-6 py-3.5 bg-gradient-to-t from-black/85 via-black/60 to-transparent text-white z-10 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs sm:text-sm text-white/95 font-medium text-center sm:text-left max-w-3xl leading-relaxed">
          {caption ? (
            <span>{renderInlineCaption(caption)}</span>
          ) : alt ? (
            <span className="text-white/80">{alt}</span>
          ) : (
            <span className="text-white/50 text-xs">キャプションなし</span>
          )}
        </div>
        <div className="text-[11px] text-white/50 shrink-0 hidden md:flex items-center gap-3">
          <span>ホイール: 拡大/縮小</span>
          <span>ドラッグ: 移動</span>
          <span>ダブルクリック: 2倍ズーム</span>
          <span>背景クリック / Esc: 閉じる</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * 画像コンポーネント (MediaWikiオプション・サイズ・配置・サムネイル枠・全画面Lightbox対応)
 */
function MarkdownImage({
  src,
  rawSrc,
  alt,
  title,
  ...props
}: {
  src: string;
  rawSrc: string;
  alt?: string;
  title?: string;
  [key: string]: any;
}) {
  const [error, setError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // alt / title / rawSrc から MediaWiki 画像オプションを解析
  const parsed = React.useMemo(() => {
    let resolvedRawTarget = rawSrc;
    let opts: MediaImageOptions = { frame: 'none' };
    let isMediaWikiSyntax = false;

    const rawAlt = typeof alt === 'string' ? alt : '';

    const isEncodedPayload =
      rawAlt.startsWith('MW_IMG_DATA:') ||
      rawAlt.startsWith('__mw_img__') ||
      rawAlt.startsWith('mw_img') ||
      rawAlt.includes('%22rawTarget%22') ||
      rawAlt.includes('"rawTarget"');

    if (isEncodedPayload) {
      isMediaWikiSyntax = true;
      try {
        let payloadStr = rawAlt;
        if (rawAlt.startsWith('MW_IMG_DATA:')) {
          payloadStr = rawAlt.slice('MW_IMG_DATA:'.length);
        } else if (rawAlt.startsWith('__mw_img__')) {
          payloadStr = rawAlt.slice('__mw_img__'.length);
        } else if (rawAlt.startsWith('mw_img')) {
          payloadStr = rawAlt.slice('mw_img'.length);
        } else if (rawAlt.includes('%7B')) {
          payloadStr = rawAlt.slice(rawAlt.indexOf('%7B'));
        }
        const jsonStr = decodeURIComponent(payloadStr);
        const decoded = JSON.parse(jsonStr);
        if (decoded && typeof decoded === 'object') {
          if (decoded.rawTarget) resolvedRawTarget = decoded.rawTarget;
          if (decoded.options) opts = decoded.options;
        }
      } catch {
        // ignore JSON parse error
      }
    } else if (rawAlt.includes('|')) {
      opts = parseMediaWikiImageOptions(rawAlt.split('|'), title);
    } else {
      // 単一キーワード (例: ![300px](url) や ![thumb](url)) の判定
      const singleParsed = parseMediaWikiImageOptions(rawAlt ? [rawAlt] : [], title);
      const consumedAsOption =
        singleParsed.frame !== 'none' ||
        singleParsed.align !== undefined ||
        singleParsed.width !== undefined ||
        singleParsed.height !== undefined;

      if (consumedAsOption) {
        opts = singleParsed;
      } else {
        opts = {
          frame: 'none',
          alt: rawAlt || undefined,
          caption: title !== undefined ? title : rawAlt || undefined,
        };
      }
    }

    // URLハッシュによる追加パラメータ指定 (#width=300px&align=right&frame=thumb 等) のサポート
    const hashIdx = resolvedRawTarget.indexOf('#');
    if (hashIdx !== -1) {
      const hashStr = resolvedRawTarget.slice(hashIdx + 1);
      if (hashStr.includes('=')) {
        const hashSegs = hashStr.split('&').map((s) => {
          const [k, v] = s.split('=');
          return `${decodeURIComponent(k || '')}=${decodeURIComponent(v || '')}`;
        });
        const hashOpts = parseMediaWikiImageOptions(hashSegs);
        if (hashOpts.frame !== 'none') opts.frame = hashOpts.frame;
        if (hashOpts.align) opts.align = hashOpts.align;
        if (hashOpts.width) opts.width = hashOpts.width;
        if (hashOpts.height) opts.height = hashOpts.height;
        if (hashOpts.caption) opts.caption = hashOpts.caption;
        if (hashOpts.alt) opts.alt = hashOpts.alt;
      }
    }

    return { opts, resolvedRawTarget, isMediaWikiSyntax };
  }, [alt, title, rawSrc]);

  const { opts, resolvedRawTarget } = parsed;
  const activeSrc = triedFallback ? rawSrc : src;

  const handleError = () => {
    if (rawSrc && src !== rawSrc && !triedFallback) {
      setTriedFallback(true);
    } else {
      setError(true);
    }
  };

  if (error) {
    const errorLabel = (() => {
      const cleanVal = (v?: string) => {
        if (!v) return '';
        if (v.includes('rawTarget') || v.startsWith('mw_img') || v.startsWith('MW_IMG_DATA:')) {
          return '';
        }
        return v.trim();
      };
      return (
        cleanVal(opts.caption) ||
        cleanVal(opts.alt) ||
        cleanVal(resolvedRawTarget?.replace(/^media:/, '')) ||
        '画像'
      );
    })();

    return (
      <div className="my-6 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-center gap-2.5 text-xs text-slate-400 select-none clear-both">
        <ImageIcon className="size-4 text-slate-400 shrink-0" />
        <span className="font-mono text-[11px] truncate max-w-xs">
          {errorLabel}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 font-medium">
          読み込み失敗 (404)
        </span>
      </div>
    );
  }

  const isThumbOrFrame = opts.frame === 'thumb' || opts.frame === 'frame';
  const isFrameless = opts.frame === 'frameless';
  const hasBorder = opts.frame === 'border' || Boolean(opts.border);

  // 配置クラス (MediaWiki の right / left フロート回り込み、center 中央揃え、none 左揃え)
  let alignClass = 'my-6 mx-auto clear-both';
  if (opts.align === 'right') {
    alignClass = ' my-2 sm:float-right sm:ml-6 sm:mr-0 mb-4 clear-right mx-auto';
  } else if (opts.align === 'left') {
    alignClass = ' my-2 sm:float-left sm:mr-6 sm:ml-0 mb-4 clear-left mx-auto';
  } else if (opts.align === 'center') {
    alignClass = 'my-6 mx-auto clear-both';
  } else if (opts.align === 'none') {
    alignClass = 'my-6 mr-auto ml-0 clear-both';
  }

  // 画像クリック時の挙動 (link=空文字はクリック無効、link=URLはリンク遷移、未指定時は全画面Lightbox拡大)
  const isClickDisabled = opts.link === '';
  const hasCustomLink = typeof opts.link === 'string' && opts.link.length > 0;

  const handleImageClick = (e: React.MouseEvent) => {
    if (isClickDisabled) return;
    if (hasCustomLink) {
      e.stopPropagation();
      const linkTarget = opts.link!;
      if (/^https?:\/\//i.test(linkTarget) || linkTarget.startsWith('//')) {
        window.open(linkTarget, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = linkTarget;
      }
      return;
    }
    e.stopPropagation();
    setLightboxOpen(true);
  };

  // サイズスタイル計算
  // MediaWiki で thumb 指定かつ幅未指定の場合は 260px を標準サムネイル幅とする
  const effectiveWidth = opts.width || (opts.frame === 'thumb' ? '260px' : undefined);
  const effectiveHeight = opts.height;

  const figureStyle: React.CSSProperties = {
    maxWidth: '100%',
  };
  const imgStyle: React.CSSProperties = {
    maxWidth: '100%',
    verticalAlign: opts.valign,
  };

  if (isThumbOrFrame) {
    if (effectiveWidth) {
      figureStyle.width = effectiveWidth;
    }
    if (effectiveHeight) {
      imgStyle.maxHeight = effectiveHeight;
      imgStyle.width = 'auto';
    } else {
      imgStyle.width = '100%';
    }
  } else {
    if (effectiveWidth) {
      if (effectiveWidth.endsWith('%')) {
        figureStyle.width = effectiveWidth;
        imgStyle.width = '100%';
      } else {
        imgStyle.width = effectiveWidth;
      }
    }
    if (effectiveHeight) {
      imgStyle.maxHeight = effectiveHeight;
      if (!effectiveWidth) imgStyle.width = 'auto';
    }
  }

  const displayCaption = isFrameless ? undefined : opts.caption;

  return (
    <>
      {isThumbOrFrame ? (
        /* MediaWiki サムネイル (thumb / frame) ボックス表示 */
        <figure
          style={figureStyle}
          className={`${alignClass} w-fit bg-muted/35 dark:bg-slate-900/60 border border-border rounded-xl p-2.5 shadow-xs transition-shadow hover:shadow-md ${
            opts.className || ''
          }`}
        >
          <div className="relative group/mwimg overflow-hidden rounded-lg bg-background/60 border border-border/60 flex items-center justify-center">
            <img
              src={activeSrc}
              alt={opts.alt || opts.caption || 'image'}
              style={imgStyle}
              className={`h-auto object-contain transition-transform duration-200 group-hover/mwimg:scale-[1.01] ${
                isClickDisabled
                  ? 'cursor-default'
                  : hasCustomLink
                  ? 'cursor-pointer'
                  : 'cursor-zoom-in'
              }`}
              loading="lazy"
              onError={handleError}
              onClick={handleImageClick}
              {...props}
            />
            {!isClickDisabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(true);
                }}
                className="opacity-0 group-hover/mwimg:opacity-100 transition-opacity absolute top-2 right-2 p-1.5 rounded-lg bg-black/65 hover:bg-black/85 text-white shadow-md cursor-pointer backdrop-blur-xs"
                title="クリックして画面いっぱいに拡大表示"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>

          <figcaption className="mt-2 px-1 text-xs text-muted-foreground leading-relaxed flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 break-words">
              {displayCaption ? (
                renderInlineCaption(displayCaption)
              ) : (
                <span className="text-[11px] text-muted-foreground/60 select-none">
                  クリックして拡大
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="画面いっぱいに拡大表示"
              aria-label="画像を拡大表示"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </figcaption>
        </figure>
      ) : (
        /* 標準 / frameless / border 表示 */
        <figure
          style={figureStyle}
          className={`${alignClass} w-fit ${opts.className || ''}`}
        >
          <div className="relative group/mwimg inline-block max-w-full">
            <img
              src={activeSrc}
              alt={opts.alt || opts.caption || 'image'}
              style={imgStyle}
              className={`rounded-xl h-auto mx-auto transition-transform duration-200 hover:scale-[1.01] ${
                hasBorder
                  ? 'border-2 border-foreground/30 shadow-xs'
                  : isFrameless
                  ? ''
                  : 'shadow-md border border-border'
              } ${
                isClickDisabled
                  ? 'cursor-default'
                  : hasCustomLink
                  ? 'cursor-pointer'
                  : 'cursor-zoom-in'
              }`}
              loading="lazy"
              onError={handleError}
              onClick={handleImageClick}
              {...props}
            />
            {!isClickDisabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(true);
                }}
                className="opacity-0 group-hover/mwimg:opacity-100 transition-opacity absolute bottom-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/65 hover:bg-black/85 text-white text-[11px] font-medium shadow-md flex items-center gap-1 cursor-pointer backdrop-blur-xs"
                title="クリックして画面いっぱいに拡大表示"
              >
                <Maximize2 className="size-3" />
                <span>拡大</span>
              </button>
            )}
          </div>
          {displayCaption && (
            <figcaption className="text-center text-xs text-muted-foreground mt-2 italic">
              {renderInlineCaption(displayCaption)}
            </figcaption>
          )}
        </figure>
      )}

      {lightboxOpen && (
        <ImageLightboxModal
          src={activeSrc}
          alt={opts.alt}
          caption={opts.caption}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
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
          {renderWithBr(children)}
        </Tag>
      );
    };
  };

  return (
    <div className={`markdown-body flow-root max-w-none ${className}`}>
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
        rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeDetails]}
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
          th({ node, children, ...props }: any) {
            return (
              <th {...props}>
                {renderWithBr(children)}
              </th>
            );
          },
          td({ node, children, ...props }: any) {
            return (
              <td {...props}>
                {renderWithBr(children)}
              </td>
            );
          },
          details({ node, children, ...props }: any) {
            return (
              <details
                className="my-3 rounded-xl border border-border bg-card/40 overflow-hidden shadow-2xs group transition-all [&>*:not(summary)]:px-4 [&>*:not(summary):first-of-type]:pt-3 [&>*:not(summary):last-child]:pb-3"
                {...props}
              >
                {children}
              </details>
            );
          },
          summary({ node, children, ...props }: any) {
            const rawText = extractText(children);
            const formatted = renderInlineCaption(rawText) || children;
            return (
              <summary
                className="px-4 py-2.5 font-semibold text-sm cursor-pointer select-none bg-muted/40 hover:bg-muted/70 transition-colors flex items-center gap-2 border-b border-border/40 group-not-open:border-transparent list-none marker:content-none [&::-webkit-details-marker]:hidden"
                {...props}
              >
                <ChevronRight className="size-4 text-muted-foreground group-open:rotate-90 transition-transform duration-150 shrink-0" />
                <span className="flex-1">{renderWithBr(formatted)}</span>
              </summary>
            );
          },
          a({ href, id, children, ...props }: any) {
            const anchorId = id || (props as any).name;

            // アンカーターゲット (例: <a id="m2"></a> または <a name="m2"></a>)
            // hrefがなく、idまたはnameが指定されている場合
            if (!href && anchorId) {
              const isEmpty =
                !children ||
                (Array.isArray(children) && children.length === 0) ||
                (typeof children === 'string' && children.trim() === '');

              if (isEmpty) {
                return (
                  <span
                    id={anchorId}
                    data-anchor="true"
                    className="scroll-mt-24 pointer-events-none inline-block h-0 w-0 -translate-y-2 opacity-0 select-none"
                    aria-hidden="true"
                  />
                );
              }

              return (
                <span id={anchorId} className="scroll-mt-24" {...props}>
                  {children}
                </span>
              );
            }

            // 文字色・背景色（ハイライト）・下線リンク記号の検知
            if (
              href &&
              (href.startsWith('color:') ||
                href.startsWith('bg:') ||
                href.startsWith('underline:') ||
                href.includes('underline:true'))
            ) {
              let color: string | undefined;
              let bg: string | undefined;
              let isUnderline = false;

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
                } else if (
                  part === 'underline:true' ||
                  part === 'u:true' ||
                  part.startsWith('underline:')
                ) {
                  isUnderline = true;
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
                    textDecoration: isUnderline ? 'underline' : undefined,
                    textUnderlineOffset: isUnderline ? '3px' : undefined,
                    padding: safeBg ? '0.15em 0.4em' : undefined,
                    borderRadius: safeBg ? '0.25rem' : undefined,
                  }}
                  className={`${
                    safeBg
                      ? safeColor
                        ? 'inline font-medium'
                        : 'inline font-medium text-slate-900 dark:text-slate-100'
                      : 'inline font-medium'
                  } ${isUnderline ? 'underline underline-offset-4 decoration-current' : ''}`}
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
                  id={anchorId}
                  href={href}
                  onClick={handleClick}
                  className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors font-medium cursor-pointer"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            const isExternal =
              Boolean(href) &&
              (/^(?:https?:|\/\/|mailto:|tel:|sms:|javascript:)/i.test(href!) ||
                href!.startsWith('www.'));

            if (isExternal) {
              const formattedHref = href?.startsWith('www.') ? `https://${href}` : href;
              return (
                <a
                  id={anchorId}
                  href={formattedHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors font-medium inline-flex items-center gap-0.5 group/ext"
                  {...props}
                >
                  <span>{children}</span>
                  <ExternalLink className="inline-block size-3 text-slate-400 dark:text-slate-500 group-hover/ext:text-blue-500 shrink-0 ml-0.5 align-baseline" />
                </a>
              );
            }

            // 内部リンク（./README.md, ./02-development-environment.md, page-slug など）の正規化
            let targetPath = href || '';
            let hash = '';
            let search = '';

            const hashIdx = targetPath.indexOf('#');
            if (hashIdx !== -1) {
              hash = targetPath.slice(hashIdx);
              targetPath = targetPath.slice(0, hashIdx);
            }

            const searchIdx = targetPath.indexOf('?');
            if (searchIdx !== -1) {
              search = targetPath.slice(searchIdx);
              targetPath = targetPath.slice(0, searchIdx);
            }

            // 先頭の相対パス記号 './' の除去
            let cleanSlug = targetPath.replace(/^\.\//, '');

            // .md / .markdown 拡張子の除去
            cleanSlug = cleanSlug.replace(/\.(?:md|markdown)$/i, '');

            const lowerClean = cleanSlug.toLowerCase();
            const isHomeLike =
              cleanSlug === '' ||
              lowerClean === 'readme' ||
              lowerClean === 'index' ||
              lowerClean === 'home';

            let internalHref = href || '';

            if (targetPath.startsWith('/')) {
              // 絶対パスで始まっている場合 (例: /sites/developer/page や /dashboard)
              const cleanAbsPath = targetPath.replace(/\.(?:md|markdown)$/i, '');
              internalHref = cleanAbsPath + search + hash;
            } else if (siteSlug) {
              const sitePrefix = getSitePrefix(siteSlug);
              if (isHomeLike) {
                internalHref = (sitePrefix || '/') + search + hash;
              } else {
                internalHref = (sitePrefix ? `${sitePrefix}/${cleanSlug}` : `/${cleanSlug}`) + search + hash;
              }
            } else {
              if (isHomeLike) {
                internalHref = './' + search + hash;
              } else {
                internalHref = cleanSlug + search + hash;
              }
            }

            return (
              <Link
                id={anchorId}
                href={internalHref}
                className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors font-medium"
                {...props}
              >
                {children}
              </Link>
            );
          },
          span({ id, children, className = '', ...props }: any) {
            if (id) {
              const isEmpty =
                !children ||
                (Array.isArray(children) && children.length === 0) ||
                (typeof children === 'string' && children.trim() === '');
              if (isEmpty) {
                return (
                  <span
                    id={id}
                    data-anchor="true"
                    className="scroll-mt-24 pointer-events-none inline-block h-0 w-0 -translate-y-2 opacity-0 select-none"
                    aria-hidden="true"
                  />
                );
              }
              return (
                <span id={id} className={`scroll-mt-24 ${className}`} {...props}>
                  {children}
                </span>
              );
            }
            return (
              <span className={className} {...props}>
                {children}
              </span>
            );
          },
          u({ children, ...props }: any) {
            return (
              <u className="underline underline-offset-4 decoration-current" {...props}>
                {children}
              </u>
            );
          },
          s({ children, ...props }: any) {
            return (
              <s className="line-through opacity-80" {...props}>
                {children}
              </s>
            );
          },
          p({ children, ...props }) {
            // HTML仕様: <p> の直下に <figure> などのブロック要素を配置することはできないため、
            // 子要素に画像やブロックが含まれる場合は <div> またはフラグメントとしてレンダリングし Hydration エラーを防ぐ
            const childArray = React.Children.toArray(children);
            const nonEmptyChildren = childArray.filter(
              (c) => !(typeof c === 'string' && c.trim() === '')
            );

            const isImageElement = (child: React.ReactNode) => {
              if (!React.isValidElement(child)) return false;
              const childProps = child.props as any;
              return (
                childProps?.node?.tagName === 'img' ||
                childProps?.src !== undefined ||
                child.type === 'img' ||
                child.type === 'figure'
              );
            };

            // 段落の中身が画像のみの場合は余分なラッパー div を挟まず直接展開し、
            // float-right / float-left 指定時の後続テキスト回り込みを自然に行う
            if (nonEmptyChildren.length > 0 && nonEmptyChildren.every(isImageElement)) {
              return <>{children}</>;
            }

            const hasBlockOrImage = childArray.some(
              (child) =>
                isImageElement(child) ||
                (React.isValidElement(child) && child.type === 'div')
            );

            if (hasBlockOrImage) {
              return (
                <div className="my-4 leading-relaxed" {...props}>
                  {renderWithBr(children)}
                </div>
              );
            }
            return (
              <p className="my-4 leading-relaxed" {...props}>
                {renderWithBr(children)}
              </p>
            );
          },
          li({ node, children, ...props }: any) {
            return (
              <li {...props}>
                {renderWithBr(children)}
              </li>
            );
          },
          blockquote({ node, children, ...props }: any) {
            return (
              <blockquote {...props}>
                {renderWithBr(children)}
              </blockquote>
            );
          },
          img({ src, alt, title, ...props }) {
            const rawSrc = typeof src === 'string' ? src : '';
            const resolvedSrc = resolveMediaUrl(rawSrc);
            return (
              <MarkdownImage
                src={resolvedSrc}
                rawSrc={rawSrc}
                alt={alt}
                title={typeof title === 'string' ? title : undefined}
                {...props}
              />
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
