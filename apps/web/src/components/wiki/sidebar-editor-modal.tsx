'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Globe,
  FileText,
  Settings2,
  Save,
  RotateCcw,
  Check,
  Edit2,
  ExternalLink,
  Code,
  ListOrdered,
} from 'lucide-react';
import {
  SidebarSection,
  SidebarLink,
  parseMediaWikiSidebarText,
  stringifyMediaWikiSidebar,
  generateDefaultSidebar,
} from '@/types/sidebar';
import { sitesApi } from '@/lib/api';

interface SidebarEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId?: string;
  siteSlug: string;
  currentSections?: SidebarSection[];
  showToolsSection?: boolean;
  availablePages: Array<{ id: string; slug: string; title: string }>;
  onSaved: (sections: SidebarSection[], showTools: boolean) => void;
}

export function SidebarEditorModal({
  isOpen,
  onClose,
  siteId,
  siteSlug,
  currentSections,
  showToolsSection = true,
  availablePages,
  onSaved,
}: SidebarEditorModalProps) {
  const [mode, setMode] = useState<'gui' | 'wikitext'>('gui');
  const [sections, setSections] = useState<SidebarSection[]>([]);
  const [showTools, setShowTools] = useState(showToolsSection);
  const [wikitext, setWikitext] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 初期値セット
  useEffect(() => {
    if (isOpen) {
      const initial =
        currentSections && currentSections.length > 0
          ? JSON.parse(JSON.stringify(currentSections))
          : generateDefaultSidebar(availablePages);
      setSections(initial);
      setShowTools(showToolsSection ?? true);
      setWikitext(stringifyMediaWikiSidebar(initial));
    }
  }, [isOpen, currentSections, showToolsSection, availablePages]);

  if (!isOpen) return null;

  // モード切替
  const handleSwitchToWikitext = () => {
    setWikitext(stringifyMediaWikiSidebar(sections));
    setMode('wikitext');
  };

  const handleSwitchToGui = () => {
    try {
      const parsed = parseMediaWikiSidebarText(wikitext);
      setSections(parsed);
    } catch {
      // ignore
    }
    setMode('gui');
  };

  // セクション操作
  const handleAddSection = () => {
    const newSection: SidebarSection = {
      id: `sec-${Date.now()}`,
      title: '新しいセクション',
      links: [],
    };
    setSections([...sections, newSection]);
  };

  const handleDeleteSection = (index: number) => {
    const next = [...sections];
    next.splice(index, 1);
    setSections(next);
  };

  const handleSectionTitleChange = (index: number, title: string) => {
    const next = [...sections];
    next[index].title = title;
    setSections(next);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === sections.length - 1)
    )
      return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const next = [...sections];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSections(next);
  };

  // リンク操作
  const handleAddLink = (secIndex: number) => {
    const next = [...sections];
    const newLink: SidebarLink = {
      id: `link-${Date.now()}`,
      title: '新規リンク',
      url: '',
      isExternal: false,
    };
    next[secIndex].links.push(newLink);
    setSections(next);
  };

  const handleDeleteLink = (secIndex: number, linkIndex: number) => {
    const next = [...sections];
    next[secIndex].links.splice(linkIndex, 1);
    setSections(next);
  };

  const handleLinkChange = (
    secIndex: number,
    linkIndex: number,
    field: 'title' | 'url',
    val: string
  ) => {
    const next = [...sections];
    next[secIndex].links[linkIndex][field] = val;
    if (field === 'url') {
      next[secIndex].links[linkIndex].isExternal =
        val.startsWith('http://') || val.startsWith('https://');
    }
    setSections(next);
  };

  // 既存ページから選択して追加
  const handleSelectExistingPage = (secIndex: number, pageSlug: string) => {
    const page = availablePages.find((p) => p.slug === pageSlug);
    if (!page) return;
    const next = [...sections];
    next[secIndex].links.push({
      id: `link-${Date.now()}`,
      title: page.title,
      url: page.slug === 'index' || page.slug === 'home' || page.slug === '' ? '' : page.slug,
      isExternal: false,
    });
    setSections(next);
  };

  // デフォルトにリセット
  const handleReset = () => {
    if (confirm('サイドバー構成をデフォルトのページ一覧に戻しますか？')) {
      const def = generateDefaultSidebar(availablePages);
      setSections(def);
      setWikitext(stringifyMediaWikiSidebar(def));
    }
  };

  // 保存
  const handleSave = async () => {
    setIsSaving(true);
    let finalSections = sections;
    if (mode === 'wikitext') {
      finalSections = parseMediaWikiSidebarText(wikitext);
      setSections(finalSections);
    }

    try {
      if (siteId) {
        // サイト設定をAPIで保存
        const res = await sitesApi.get(siteId);
        const currentSite = res.data?.data;
        if (currentSite) {
          await sitesApi.update(siteId, {
            settings: {
              ...(currentSite.settings || {}),
              sidebar_sections: finalSections,
              sidebar_show_tools: showTools,
            },
          });
        }
      }

      // LocalStorageにもキャッシュ保存（フォールバック用）
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `klados_sidebar_${siteSlug}`,
          JSON.stringify({ sections: finalSections, showTools })
        );
      }

      onSaved(finalSections, showTools);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      // LocalStorageだけでも保存
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `klados_sidebar_${siteSlug}`,
          JSON.stringify({ sections: finalSections, showTools })
        );
      }
      onSaved(finalSections, showTools);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Settings2 className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                サイドバー編集 (MediaWiki:Sidebar)
              </h2>
              <p className="text-xs text-slate-400">
                サイドバーの見出しやリンク、外部リンクを自由にカスタマイズできます
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* モード切替タブ */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-medium mr-2">
              <button
                type="button"
                onClick={handleSwitchToGui}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  mode === 'gui'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListOrdered className="size-3.5" />
                <span>ビジュアル編集</span>
              </button>
              <button
                type="button"
                onClick={handleSwitchToWikitext}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  mode === 'wikitext'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Code className="size-3.5" />
                <span>Wikiテキスト</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* メインエリア */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {mode === 'gui' ? (
            <>
              {/* オプション: MediaWikiツールセクション */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 block">
                    MediaWiki標準「ツール」セクションを表示する
                  </span>
                  <span className="text-[11px] text-slate-400">
                    サイドバー最下部に「印刷用バージョン」「固定リンク」「ページ情報」などの便利ツール群を自動配置します
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTools}
                    onChange={(e) => setShowTools(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* セクション一覧 */}
              <div className="space-y-4">
                {sections.map((sec, secIdx) => (
                  <div
                    key={sec.id || secIdx}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 shadow-2xs space-y-3"
                  >
                    {/* セクションヘッダー */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{secIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => handleSectionTitleChange(secIdx, e.target.value)}
                          placeholder="セクション見出し (例: 規約, 情報, リンク)"
                          className="font-bold text-sm bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 w-64 focus:outline-blue-500 text-slate-900 dark:text-white"
                        />
                        <span className="text-xs text-slate-400">
                          ({sec.links.length} 件のリンク)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSection(secIdx, 'up')}
                          disabled={secIdx === 0}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          title="上へ移動"
                        >
                          <MoveUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSection(secIdx, 'down')}
                          disabled={secIdx === sections.length - 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          title="下へ移動"
                        >
                          <MoveDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(secIdx)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer ml-1"
                          title="セクションを削除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* リンク一覧 */}
                    <div className="space-y-2 pl-2">
                      {sec.links.map((link, linkIdx) => (
                        <div
                          key={link.id || linkIdx}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <input
                            type="text"
                            value={link.title}
                            onChange={(e) =>
                              handleLinkChange(secIdx, linkIdx, 'title', e.target.value)
                            }
                            placeholder="リンク名 (例: 利用規約)"
                            className="w-48 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                          />
                          <input
                            type="text"
                            value={link.url}
                            onChange={(e) =>
                              handleLinkChange(secIdx, linkIdx, 'url', e.target.value)
                            }
                            placeholder="URL または スラグ (例: terms, https://...)"
                            className="flex-1 font-mono text-[11px] bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                          />
                          {link.isExternal && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium shrink-0 flex items-center gap-1">
                              <Globe className="size-2.5" /> 外部
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteLink(secIdx, linkIdx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="リンクを削除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}

                      {sec.links.length === 0 && (
                        <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                          リンクがまだありません
                        </div>
                      )}
                    </div>

                    {/* リンク追加バー */}
                    <div className="pt-2 flex items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleSelectExistingPage(secIdx, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-2.5 py-1 text-xs border border-transparent hover:border-slate-300 cursor-pointer"
                        >
                          <option value="" disabled>
                            + 既存のページから追加...
                          </option>
                          {availablePages.map((p) => (
                            <option key={p.id || p.slug} value={p.slug}>
                              {p.title} ({p.slug || 'index'})
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddLink(secIdx)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        <span>カスタムリンクを追加</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* セクション追加ボタン */}
              <button
                type="button"
                onClick={handleAddSection}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-4" />
                <span>新しいセクションを追加</span>
              </button>
            </>
          ) : (
            /* Wikiテキスト直接編集 */
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  MediaWiki:Sidebar 記法仕様:
                </p>
                <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] leading-relaxed">
{`* セクション見出し
** ページスラッグまたはURL | 表示名
** https://twitter.com/... | 公式Twitter`}
                </pre>
              </div>
              <textarea
                value={wikitext}
                onChange={(e) => setWikitext(e.target.value)}
                rows={18}
                className="w-full p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed border border-slate-700 focus:outline-blue-500 resize-none selection:bg-blue-600"
                placeholder={`* 規約\n** /terms | 利用規約\n** /discord | Discordルール\n\n* リンク\n** https://klados.app | Klados公式サイト`}
              />
            </div>
          )}
        </div>

        {/* モーダルフッター */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>デフォルトに戻す</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check className="size-4" />
                  <span>保存完了</span>
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  <span>{isSaving ? '保存中...' : 'サイドバーを保存'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
