export interface SidebarLink {
  id: string;
  title: string;
  url: string; // スラグ (例: 'guide', '/terms') または外部URL (例: 'https://twitter.com')
  isExternal?: boolean;
  children?: SidebarLink[]; // サブ項目（開閉ツリーメニュー用）
  defaultOpen?: boolean; // 初期状態で開いているか（[-]ならtrue、[+]ならfalse。デフォルト: false）
}

export interface SidebarSection {
  id: string;
  title: string; // セクション見出し (例: "全体", "サーバー一覧")
  links: SidebarLink[];
}

export interface SidebarConfig {
  enabled: boolean;
  showToolsSection?: boolean; // MediaWiki風のツールセクション（印刷、固定リンク、ページ情報など）を表示するか
  sections: SidebarSection[];
}

/**
 * 既存のフラットなページ一覧からデフォルトのサイドバー構成を生成する
 */
export function generateDefaultSidebar(pages: Array<{ id: string; slug: string; title: string }>): SidebarSection[] {
  return [
    {
      id: 'sec-main',
      title: '全体',
      links: pages.map((p) => ({
        id: p.id || p.slug,
        title: p.title,
        url: p.slug === 'index' || p.slug === 'home' || p.slug === '' ? '' : p.slug,
        isExternal: false,
      })),
    },
  ];
}

/**
 * MediaWiki & SeesaaWiki風のテキスト形式から SidebarSection[]（ツリー構造含む）にパースする
 *
 * 対応構文:
 * - `* セクション名` (セクション見出し)
 * - `** url|表示名` または `** 表示名` (セクション直下リンク)
 * - `** [+] フォルダ名` (初期状態で閉じた折りたたみグループ)
 * - `** [-] フォルダ名` (初期状態で開いた折りたたみグループ)
 * - `*** サブリンク` (1階層ネスト)
 * - `**** サブサブリンク` (多階層ネスト)
 * - SeesaaWiki記法: `[+] フォルダ名` 〜 `[END]` / `[-] フォルダ名` 〜 `[END]`
 */
export function parseMediaWikiSidebarText(text: string): SidebarSection[] {
  const lines = text.split('\n');
  const sections: SidebarSection[] = [];
  let currentSection: SidebarSection | null = null;

  // スタック管理: 各階層の親リンクと深さ
  const stack: Array<{ link: SidebarLink; depth: number }> = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // SeesaaWiki: [END] でスタックを1つポップ
    if (trimmed.toUpperCase() === '[END]') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }

    // * セクション名 (* 見出し だが ** ではない)
    if (trimmed.startsWith('*') && !trimmed.startsWith('**')) {
      const title = trimmed.substring(1).trim();
      currentSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title,
        links: [],
      };
      sections.push(currentSection);
      stack.length = 0; // セクションが変わったら階層スタックをリセット
      continue;
    }

    let depth = 2; // デフォルト深さ (セクション直下)
    let content = trimmed;
    let defaultOpen: boolean | undefined = undefined;
    let isExplicitFolder = false;

    // アスタリスク階層の検出 (** => 2, *** => 3, **** => 4 ...)
    const asteriskMatch = trimmed.match(/^(\*{2,})\s*(.*)$/);
    // ハイフン階層の検出 (- => 2, -- => 3 ...)
    const dashMatch = trimmed.match(/^(-+)\s*(.*)$/);

    if (asteriskMatch) {
      depth = asteriskMatch[1].length;
      content = asteriskMatch[2].trim();
    } else if (dashMatch) {
      depth = dashMatch[1].length + 1;
      content = dashMatch[2].trim();
    } else if (trimmed.startsWith('[+]') || trimmed.startsWith('[-]')) {
      depth = stack.length > 0 ? stack[stack.length - 1].depth + 1 : 2;
    } else {
      depth = stack.length > 0 ? stack[stack.length - 1].depth + 1 : 2;
    }

    // [+] または [-] 開閉プレフィックスの抽出
    if (content.startsWith('[+]') || content.startsWith('[＋]')) {
      defaultOpen = false;
      isExplicitFolder = true;
      content = content.replace(/^\[[+＋]\]\s*/, '').trim();
    } else if (content.startsWith('[-]') || content.startsWith('[ー]') || content.startsWith('[-]')) {
      defaultOpen = true;
      isExplicitFolder = true;
      content = content.replace(/^\[[-ー]\]\s*/, '').trim();
    }

    let url = '';
    let title = content;

    // 1. Markdown リンク: [タイトル](URL)
    const mdMatch = content.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (mdMatch) {
      title = mdMatch[1].trim();
      url = mdMatch[2].trim();
    } else if (content.includes('>')) {
      // 2. SeesaaWiki / PukiWiki スタイル: [[タイトル>URL]] または タイトル>URL
      const cleanContent = content.replace(/^\[\[/, '').replace(/\]\]$/, '');
      const parts = cleanContent.split('>');
      title = parts[0].trim();
      url = parts.slice(1).join('>').trim();
    } else if (content.includes('|')) {
      // 3. MediaWiki スタイル: [[URL|タイトル]] または [[タイトル|URL]]
      const cleanContent = content.replace(/^\[\[/, '').replace(/\]\]$/, '');
      const parts = cleanContent.split('|');
      const p1 = parts[0].trim();
      const p2 = parts.slice(1).join('|').trim();
      if (/^(?:https?:|\/\/|www\.)/i.test(p1)) {
        url = p1;
        title = p2 || p1;
      } else if (/^(?:https?:|\/\/|www\.)/i.test(p2)) {
        title = p1;
        url = p2;
      } else {
        url = p1;
        title = p2 || p1;
      }
    } else {
      const cleanContent = content.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      url = cleanContent;
      title = cleanContent;
    }

    if (url.startsWith('www.')) {
      url = `https://${url}`;
    }

    const isExternal =
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('//') ||
      url.startsWith('mailto:');

    const link: SidebarLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      url,
      isExternal,
      ...(isExplicitFolder ? { children: [], defaultOpen } : {}),
    };

    if (!currentSection) {
      currentSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: '全体',
        links: [],
      };
      sections.push(currentSection);
    }

    // スタックを現在の深さに合わせて巻き戻す (現在の深さ以上の親をポップ)
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length > 0) {
      // 直近の親の子要素として追加
      const parent = stack[stack.length - 1].link;
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(link);
    } else {
      // セクション直下に追加
      currentSection.links.push(link);
    }

    // フォルダであるか、または下位階層を持ち得る場合はスタックに積む
    stack.push({ link, depth });
  }

  // 子要素を持たないリンクで、明示的なフォルダ指定もなかったものは children を整理
  const cleanupChildren = (items: SidebarLink[]) => {
    for (const item of items) {
      if (item.children) {
        if (item.children.length === 0 && item.defaultOpen === undefined) {
          delete item.children;
        } else {
          cleanupChildren(item.children);
        }
      }
    }
  };

  for (const sec of sections) {
    cleanupChildren(sec.links);
  }

  return sections;
}

/**
 * SidebarSection[] を MediaWiki & SeesaaWiki風のテキスト形式に変換する
 */
export function stringifyMediaWikiSidebar(sections: SidebarSection[]): string {
  const renderItem = (item: SidebarLink, depth: number): string => {
    const asterisks = '*'.repeat(depth);
    const prefix = item.children !== undefined
      ? (item.defaultOpen ? '[-] ' : '[+] ')
      : '';
    const linkStr = item.url && item.url !== item.title
      ? `${item.url}|${item.title}`
      : item.title;

    let line = `${asterisks} ${prefix}${linkStr}`;
    if (item.children && item.children.length > 0) {
      const childLines = item.children.map((c) => renderItem(c, depth + 1)).join('\n');
      line += `\n${childLines}`;
    }
    return line;
  };

  return sections
    .map((sec) => {
      const header = `* ${sec.title}`;
      const links = sec.links.map((l) => renderItem(l, 2)).join('\n');
      return links ? `${header}\n${links}` : header;
    })
    .join('\n\n');
}

/**
 * リンクまたはその子孫に指定URL（スラグ）が含まれているかを判定
 */
export function containsUrl(item: SidebarLink, targetUrl: string): boolean {
  const cleanTarget = targetUrl.replace(/^\//, '');
  const cleanItemUrl = item.url.replace(/^\//, '');

  if (cleanTarget === cleanItemUrl) return true;
  if ((cleanTarget === '' || cleanTarget === 'index' || cleanTarget === 'home') &&
      (cleanItemUrl === '' || cleanItemUrl === 'index' || cleanItemUrl === 'home')) {
    return true;
  }

  if (item.children && item.children.length > 0) {
    return item.children.some((c) => containsUrl(c, targetUrl));
  }

  return false;
}
