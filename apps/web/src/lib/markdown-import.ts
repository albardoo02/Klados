import JSZip from 'jszip';

export interface ParsedMarkdownPage {
  fileName: string;
  title: string;
  slug: string;
  content: string;
  status: 'published' | 'draft';
}

/**
 * Markdown本文からFrontmatter (YAML形式) を抽出・解析する
 */
export function parseMarkdownFrontmatter(rawContent: string, fileName: string): ParsedMarkdownPage {
  let title = '';
  let slug = '';
  let content = rawContent;

  // Frontmatter 正規表現: ^---\r?\n([\s\S]*?)\r?\n---\r?\n?
  const frontmatterMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    content = rawContent.slice(frontmatterMatch[0].length);

    // シンプルなYAMLパーサー
    const lines = yamlBlock.split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        let value = match[2].trim();
        // 引用符の除去
        value = value.replace(/^["'](.*)["']$/, '$1');

        if (key === 'title' && !title) title = value;
        if (key === 'slug' && !slug) slug = value;
      }
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
            // README.md はスキップするか、メインページとして処理
            const simpleName = relativePath.split('/').pop() || relativePath;
            const parsed = parseMarkdownFrontmatter(text, simpleName);
            result.push(parsed);
          });
          filePromises.push(p);
        }
      });

      await Promise.all(filePromises);
    } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
      const text = await file.text();
      const parsed = parseMarkdownFrontmatter(text, file.name);
      result.push(parsed);
    }
  }

  return result;
}
