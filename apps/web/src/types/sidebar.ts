export interface SidebarLink {
  id: string;
  title: string;
  url: string; // スラグ (例: 'guide', '/terms') または外部URL (例: 'https://twitter.com')
  isExternal?: boolean;
}

export interface SidebarSection {
  id: string;
  title: string; // セクション見出し (例: "メイン", "規約", "情報", "公開サーバー", "ツール")
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
      title: 'ナビゲーション',
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
 * MediaWiki風のテキスト形式 (* セクション名 \n ** url|表示名) から SidebarSection[] にパースする
 */
export function parseMediaWikiSidebarText(text: string): SidebarSection[] {
  const lines = text.split('\n');
  const sections: SidebarSection[] = [];
  let currentSection: SidebarSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // * セクション名
    if (line.startsWith('*') && !line.startsWith('**')) {
      const title = line.substring(1).trim();
      currentSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title,
        links: [],
      };
      sections.push(currentSection);
      continue;
    }

    // ** url|ラベル または ** ラベル
    if (line.startsWith('**')) {
      const content = line.substring(2).trim();
      let url = content;
      let title = content;

      if (content.includes('|')) {
        const parts = content.split('|');
        url = parts[0].trim();
        title = parts[1].trim() || parts[0].trim();
      }

      const isExternal = url.startsWith('http://') || url.startsWith('https://');

      const link: SidebarLink = {
        id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title,
        url,
        isExternal,
      };

      if (!currentSection) {
        currentSection = {
          id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: 'メイン',
          links: [],
        };
        sections.push(currentSection);
      }

      currentSection.links.push(link);
    }
  }

  return sections;
}

/**
 * SidebarSection[] を MediaWiki風のテキスト形式に変換する
 */
export function stringifyMediaWikiSidebar(sections: SidebarSection[]): string {
  return sections
    .map((sec) => {
      const header = `* ${sec.title}`;
      const links = sec.links.map((l) => `** ${l.url}|${l.title}`).join('\n');
      return links ? `${header}\n${links}` : header;
    })
    .join('\n\n');
}
