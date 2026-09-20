import JSZip from 'jszip';

export interface ParsedMarkdownPage {
  fileName: string;
  title: string;
  slug: string;
  content: string;
  status: 'published' | 'draft';
  categories: string[];
}

/**
 * 指定されたカテゴリ一覧を MediaWiki 形式 ([[Category:xxx]]) で Markdown 本文末尾に付加する
 * （既に本文中に存在するカテゴリは重複して付与しない）
 */
export function appendCategoriesToMarkdown(content: string, categories: string[]): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  if (!categories || categories.length === 0) return normalized;

  // 既に本文内に含まれるカテゴリを検出 (大文字小文字無視)
  const existingSet = new Set<string>();
  const catRegex = /\[\[(?:Category|カテゴリ):([^\]|]+)(?:\|[^\]]+)?\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = catRegex.exec(normalized)) !== null) {
    existingSet.add(m[1].trim().toLowerCase());
  }

  const tagsToAdd = categories
    .map((c) => c.trim())
    .filter((c) => c && !existingSet.has(c.toLowerCase()))
    .map((c) => `[[Category:${c}]]`);

  if (tagsToAdd.length === 0) return normalized;

  return `${normalized}\n\n${tagsToAdd.join('\n')}\n`;
}

/**
 * Markdown本文からFrontmatter (YAML形式) および本文内のカテゴリを抽出・解析する
 */
export function parseMarkdownFrontmatter(rawContent: string, fileName: string): ParsedMarkdownPage {
  // CRLF を LF に正規化
  const normalizedRaw = (rawContent ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let title = '';
  let slug = '';
  let content = normalizedRaw;
  const categories: string[] = [];

  // Frontmatter 正規表現: ^---\n([\s\S]*?)\n---\n?
  const frontmatterMatch = normalizedRaw.match(/^---\n([\s\S]*?)\n---\n?/);

  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    content = normalizedRaw.slice(frontmatterMatch[0].length);

    // シンプルなYAMLパーサー
    const lines = yamlBlock.split('\n');
    let currentListKey: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // リスト要素 (- item) のパース
      if (trimmed.startsWith('- ') && currentListKey) {
        let item = trimmed.slice(2).trim();
        item = item.replace(/^["'](.*)["']$/, '$1');
        if (item && !categories.includes(item)) {
          categories.push(item);
        }
        continue;
      }

      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        let value = match[2].trim();
        // 引用符の除去
        value = value.replace(/^["'](.*)["']$/, '$1');

        if (key === 'title' && !title) title = value;
        if (key === 'slug' && !slug) slug = value;

        if (key === 'category' && value) {
          if (!categories.includes(value)) categories.push(value);
          currentListKey = null;
        } else if (key === 'categories' || key === 'tags') {
          if (value.startsWith('[') && value.endsWith(']')) {
            // インライン配列 [foo, bar]
            const items = value
              .slice(1, -1)
              .split(',')
              .map((s) => s.trim().replace(/^["'](.*)["']$/, '$1'))
              .filter(Boolean);
            for (const it of items) {
              if (!categories.includes(it)) categories.push(it);
            }
            currentListKey = null;
          } else if (value) {
            // 単一値
            if (!categories.includes(value)) categories.push(value);
            currentListKey = null;
          } else {
            // 次行以降のインデントリスト
            currentListKey = key;
          }
        } else {
          currentListKey = null;
        }
      } else {
        currentListKey = null;
      }
    }
  }

  // 本文内に既に存在する [[Category:xxx]] や [[カテゴリ:xxx]] も抽出
  const catRegex = /\[\[(?:Category|カテゴリ):([^\]|]+)(?:\|[^\]]+)?\]\]/gi;
  let bodyCatMatch: RegExpExecArray | null;
  while ((bodyCatMatch = catRegex.exec(content)) !== null) {
    const cat = bodyCatMatch[1].trim();
    if (cat && !categories.some((c) => c.toLowerCase() === cat.toLowerCase())) {
      categories.push(cat);
    }
  }

  // タイトルが未定義の場合、本文の最初の # H1 見出しを探す
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].trim();
    }
  }

  // それでもタイトルが無ければファイル名から生成 (例: "my-first-post.md" -> "My First Post")
  const baseName = fileName.replace(/\.(md|markdown|txt)$/i, '');
  if (!title) {
    title = baseName
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || 'Untitled Page';
  }

  // スラグが未定義の場合、ファイル名から正規化生成
  if (!slug) {
    slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug || slug === 'readme') {
      slug = 'index';
    }
  }

  return {
    fileName,
    title,
    slug,
    content: content.trim(),
    status: 'published',
    categories,
  };
}

/**
 * 複数のFileオブジェクト (.md または .zip) を解析して ParsedMarkdownPage[] を生成する
 */
export async function parseUploadedFiles(files: File[]): Promise<ParsedMarkdownPage[]> {
  const result: ParsedMarkdownPage[] = [];

  for (const file of files) {
    const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (isZip) {
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);

      const filePromises: Promise<void>[] = [];

      zipData.forEach((relativePath, zipEntry) => {
        // ディレクトリやMac用隠しファイルはスキップ
        if (zipEntry.dir || relativePath.startsWith('__MACOSX') || relativePath.includes('/.')) {
          return;
        }

        // .md または .markdown のみ対象
        if (/\.(md|markdown)$/i.test(relativePath)) {
          const p = zipEntry.async('string').then((text) => {
            const cleanText = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const simpleName = relativePath.split('/').pop() || relativePath;
            const parsed = parseMarkdownFrontmatter(cleanText, simpleName);
            result.push(parsed);
          });
          filePromises.push(p);
        }
      });

      await Promise.all(filePromises);
    } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
      const rawText = await file.text();
      const cleanText = (rawText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const parsed = parseMarkdownFrontmatter(cleanText, file.name);
      result.push(parsed);
    }
  }

  return result;
}

