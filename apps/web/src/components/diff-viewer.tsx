'use client';

import React, { useMemo, useState } from 'react';
import { Columns, AlignJustify, Plus, Minus, Check } from 'lucide-react';

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldTitle?: string;
  newTitle?: string;
  initialMode?: 'side-by-side' | 'inline';
}

type DiffType = 'equal' | 'insert' | 'delete';

interface DiffLine {
  type: DiffType;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface SideBySideRow {
  left?: {
    lineNumber: number;
    text: string;
    type: 'equal' | 'delete';
  };
  right?: {
    lineNumber: number;
    text: string;
    type: 'equal' | 'insert';
  };
}

// LCS-based line diff algorithm
function computeLineDiff(oldText: string, newText: string) {
  const oldLines = oldText === '' ? [] : oldText.split(/\r?\n/);
  const newLines = newText === '' ? [] : newText.split(/\r?\n/);

  const m = oldLines.length;
  const n = newLines.length;

  // Optimize for very large files: cap DP table if too huge
  if (m * n > 4000000) {
    // Fallback simple comparison for extremely large files
    const result: DiffLine[] = [];
    const max = Math.max(m, n);
    for (let i = 0; i < max; i++) {
      if (i < m && i < n) {
        if (oldLines[i] === newLines[i]) {
          result.push({ type: 'equal', text: oldLines[i], oldLineNumber: i + 1, newLineNumber: i + 1 });
        } else {
          result.push({ type: 'delete', text: oldLines[i], oldLineNumber: i + 1 });
          result.push({ type: 'insert', text: newLines[i], newLineNumber: i + 1 });
        }
      } else if (i < m) {
        result.push({ type: 'delete', text: oldLines[i], oldLineNumber: i + 1 });
      } else {
        result.push({ type: 'insert', text: newLines[i], newLineNumber: i + 1 });
      }
    }
    return result;
  }

  // DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to find diff
  const rawDiff: Array<{ type: DiffType; text: string; oldIdx?: number; newIdx?: number }> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.push({ type: 'equal', text: oldLines[i - 1], oldIdx: i, newIdx: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.push({ type: 'insert', text: newLines[j - 1], newIdx: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.push({ type: 'delete', text: oldLines[i - 1], oldIdx: i });
      i--;
    }
  }

  rawDiff.reverse();

  return rawDiff.map((item) => ({
    type: item.type,
    text: item.text,
    oldLineNumber: item.oldIdx,
    newLineNumber: item.newIdx,
  }));
}

export function DiffViewer({
  oldText,
  newText,
  oldTitle = '選択したバージョン',
  newTitle = '現在のドキュメント',
  initialMode = 'side-by-side',
}: DiffViewerProps) {
  const [mode, setMode] = useState<'side-by-side' | 'inline'>(initialMode);

  const diffLines = useMemo(() => computeLineDiff(oldText, newText), [oldText, newText]);

  const { additions, deletions, unchanged } = useMemo(() => {
    let add = 0;
    let del = 0;
    let eq = 0;
    for (const line of diffLines) {
      if (line.type === 'insert') add++;
      else if (line.type === 'delete') del++;
      else eq++;
    }
    return { additions: add, deletions: del, unchanged: eq };
  }, [diffLines]);

  const sideBySideRows = useMemo(() => {
    const rows: SideBySideRow[] = [];
    let i = 0;
    while (i < diffLines.length) {
      const line = diffLines[i];
      if (line.type === 'equal') {
        rows.push({
          left: { lineNumber: line.oldLineNumber!, text: line.text, type: 'equal' },
          right: { lineNumber: line.newLineNumber!, text: line.text, type: 'equal' },
        });
        i++;
      } else if (line.type === 'delete') {
        // Look ahead to see if there's a corresponding insert
        if (i + 1 < diffLines.length && diffLines[i + 1].type === 'insert') {
          rows.push({
            left: { lineNumber: line.oldLineNumber!, text: line.text, type: 'delete' },
            right: { lineNumber: diffLines[i + 1].newLineNumber!, text: diffLines[i + 1].text, type: 'insert' },
          });
          i += 2;
        } else {
          rows.push({
            left: { lineNumber: line.oldLineNumber!, text: line.text, type: 'delete' },
          });
          i++;
        }
      } else if (line.type === 'insert') {
        rows.push({
          right: { lineNumber: line.newLineNumber!, text: line.text, type: 'insert' },
        });
        i++;
      }
    }
    return rows;
  }, [diffLines]);

  const hasDiff = additions > 0 || deletions > 0;

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-xl overflow-hidden shadow-xs">
      {/* ツールバー & 統計 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <span>差分状況:</span>
            {hasDiff ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Plus className="size-3" />
                  {additions} 行追加
                </span>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold">
                  <Minus className="size-3" />
                  {deletions} 行削除
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" />
                変更なし (同一コンテンツ)
              </span>
            )}
          </div>
        </div>

        {/* 表示モード切り替え */}
        <div className="flex border border-border rounded-lg overflow-hidden bg-background p-0.5">
          <button
            type="button"
            onClick={() => setMode('side-by-side')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'side-by-side'
                ? 'bg-secondary text-secondary-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="左右並列表示 (Side-by-side)"
          >
            <Columns className="size-3.5" />
            <span>並列表示</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('inline')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'inline'
                ? 'bg-secondary text-secondary-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="インライン統合表示 (Unified diff)"
          >
            <AlignJustify className="size-3.5" />
            <span>インライン</span>
          </button>
        </div>
      </div>

      {/* 並列表示モード (Side-by-side) */}
      {mode === 'side-by-side' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 列ヘッダー */}
          <div className="grid grid-cols-2 bg-muted/20 border-b border-border text-xs font-semibold text-muted-foreground">
            <div className="px-4 py-2 border-r border-border truncate flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-400" />
              <span className="truncate">{oldTitle}</span>
            </div>
            <div className="px-4 py-2 truncate flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400" />
              <span className="truncate">{newTitle}</span>
            </div>
          </div>

          {/* コンテンツ行リスト */}
          <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed divide-y divide-border/40">
            {sideBySideRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">ファイルが空です</div>
            ) : (
              sideBySideRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-2 hover:bg-muted/10">
                  {/* 左列 (旧バージョン) */}
                  <div
                    className={`flex items-start border-r border-border min-w-0 ${
                      row.left?.type === 'delete'
                        ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                        : row.left
                        ? 'text-foreground'
                        : 'bg-muted/30'
                    }`}
                  >
                    <span className="w-10 shrink-0 px-2 py-0.5 text-right text-muted-foreground/60 select-none border-r border-border/30 bg-muted/10">
                      {row.left?.lineNumber ?? ''}
                    </span>
                    <span className="w-4 shrink-0 text-center py-0.5 select-none font-bold text-rose-500">
                      {row.left?.type === 'delete' ? '-' : ''}
                    </span>
                    <pre className="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all overflow-hidden">
                      {row.left?.text ?? ' '}
                    </pre>
                  </div>

                  {/* 右列 (新/現在) */}
                  <div
                    className={`flex items-start min-w-0 ${
                      row.right?.type === 'insert'
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                        : row.right
                        ? 'text-foreground'
                        : 'bg-muted/30'
                    }`}
                  >
                    <span className="w-10 shrink-0 px-2 py-0.5 text-right text-muted-foreground/60 select-none border-r border-border/30 bg-muted/10">
                      {row.right?.lineNumber ?? ''}
                    </span>
                    <span className="w-4 shrink-0 text-center py-0.5 select-none font-bold text-emerald-500">
                      {row.right?.type === 'insert' ? '+' : ''}
                    </span>
                    <pre className="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all overflow-hidden">
                      {row.right?.text ?? ' '}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* インライン表示モード (Unified) */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2 bg-muted/20 border-b border-border text-xs font-semibold text-muted-foreground">
            統合差分ビュー: 削除（赤色）/ 追加（緑色）
          </div>
          <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed divide-y divide-border/30">
            {diffLines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">ファイルが空です</div>
            ) : (
              diffLines.map((line, idx) => {
                const isInsert = line.type === 'insert';
                const isDelete = line.type === 'delete';
                return (
                  <div
                    key={idx}
                    className={`flex items-start hover:bg-muted/20 transition-colors ${
                      isInsert
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                        : isDelete
                        ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                        : 'text-foreground'
                    }`}
                  >
                    {/* 旧行番号 */}
                    <span className="w-10 shrink-0 px-2 py-0.5 text-right text-muted-foreground/60 select-none border-r border-border/30 bg-muted/10">
                      {line.oldLineNumber ?? ''}
                    </span>
                    {/* 新行番号 */}
                    <span className="w-10 shrink-0 px-2 py-0.5 text-right text-muted-foreground/60 select-none border-r border-border/30 bg-muted/10">
                      {line.newLineNumber ?? ''}
                    </span>
                    {/* 符号 +/- */}
                    <span
                      className={`w-5 shrink-0 text-center py-0.5 select-none font-bold ${
                        isInsert ? 'text-emerald-500' : isDelete ? 'text-rose-500' : 'text-transparent'
                      }`}
                    >
                      {isInsert ? '+' : isDelete ? '-' : ' '}
                    </span>
                    {/* テキスト */}
                    <pre className="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all">
                      {line.text}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
