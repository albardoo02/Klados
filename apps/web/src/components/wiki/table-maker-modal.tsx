'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bold,
  Check,
  ClipboardPaste,
  Code,
  Columns,
  Copy,
  Eraser,
  Eye,
  Grid,
  Highlighter,
  Italic,
  Plus,
  RefreshCw,
  Rows,
  Sparkles,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';

export type TableColumnAlign = 'left' | 'center' | 'right';

export interface ParsedMarkdownTable {
  headers: string[];
  alignments: TableColumnAlign[];
  rows: string[][];
  from: number;
  to: number;
}

interface TableMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTable?: ParsedMarkdownTable | null;
  onInsertTable: (markdownTable: string, replaceRange?: { from: number; to: number }) => void;
}

/**
 * エスケープされていない `|` で1行をセル配列に分割する
 */
function splitTableRow(rawLine: string): string[] {
  let trimmed = rawLine.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
    trimmed = trimmed.slice(0, -1);
  }

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * GFM区切り行 (`| :--- | :---: | ---: |`) かどうかを判定する
 */
function isDelimiterRow(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

/**
 * 区切りセルから列のアライメントを判定する
 */
function parseCellAlignment(delimCell: string): TableColumnAlign {
  const c = delimCell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  return 'left';
}

/**
 * ドキュメント全文とカーソル位置から、カーソルが含まれる既存Markdownテーブルを検出・解析する
 */
export function detectMarkdownTableAtCursor(
  docText: string,
  cursorPos: number
): ParsedMarkdownTable | null {
  if (!docText) return null;
  const lines = docText.split('\n');

  // 各行の開始・終了文字インデックスを計算
  const lineOffsets: Array<{ from: number; to: number; text: string }> = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push({
      from: offset,
      to: offset + line.length,
      text: line,
    });
    offset += line.length + 1;
  }

  const clampedPos = Math.min(Math.max(0, cursorPos), docText.length);
  let targetLineIdx = lineOffsets.findIndex(
    (l) => clampedPos >= l.from && clampedPos <= l.to
  );
  if (targetLineIdx === -1) {
    targetLineIdx = lineOffsets.length - 1;
  }

  const isTableLine = (text: string) => {
    const t = text.trim();
    return t.length > 0 && t.includes('|');
  };

  if (!isTableLine(lineOffsets[targetLineIdx]?.text || '')) {
    return null;
  }

  let startIdx = targetLineIdx;
  while (startIdx > 0 && isTableLine(lineOffsets[startIdx - 1].text)) {
    startIdx--;
  }

  let endIdx = targetLineIdx;
  while (endIdx < lineOffsets.length - 1 && isTableLine(lineOffsets[endIdx + 1].text)) {
    endIdx++;
  }

  if (endIdx - startIdx < 1) return null;
  if (!isDelimiterRow(lineOffsets[startIdx + 1].text)) return null;

  const rawHeaders = splitTableRow(lineOffsets[startIdx].text);
  const rawDelims = splitTableRow(lineOffsets[startIdx + 1].text);
  const colCount = Math.max(rawHeaders.length, rawDelims.length, 1);

  const headers = Array.from({ length: colCount }, (_, i) => rawHeaders[i] ?? `列 ${i + 1}`);
  const alignments = Array.from({ length: colCount }, (_, i) =>
    parseCellAlignment(rawDelims[i] ?? '---')
  );

  const rows: string[][] = [];
  for (let r = startIdx + 2; r <= endIdx; r++) {
    const parsedRow = splitTableRow(lineOffsets[r].text);
    rows.push(Array.from({ length: colCount }, (_, c) => parsedRow[c] ?? ''));
  }

  if (rows.length === 0) {
    rows.push(Array.from({ length: colCount }, () => ''));
  }

  return {
    headers,
    alignments,
    rows,
    from: lineOffsets[startIdx].from,
    to: lineOffsets[endIdx].to,
  };
}

/**
 * セル文字列をMarkdownテーブル用にエスケープ整形する
 */
function sanitizeCellText(val: string): string {
  return (val ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();
}

/**
 * ヘッダー・アライメント・行データから整形されたGFM Markdownテーブル文字列を生成する
 */
export function generateMarkdownTableString(
  headers: string[],
  alignments: TableColumnAlign[],
  rows: string[][],
  prettyPad = true
): string {
  const colCount = Math.max(headers.length, 1);
  const safeHeaders = Array.from({ length: colCount }, (_, c) =>
    sanitizeCellText(headers[c] || `項目 ${c + 1}`)
  );
  const safeRows = rows.map((row) =>
    Array.from({ length: colCount }, (_, c) => sanitizeCellText(row[c] ?? ''))
  );

  const colWidths = Array.from({ length: colCount }, (_, c) => {
    if (!prettyPad) return 3;
    let maxLen = Math.max(safeHeaders[c].length, 3);
    for (const r of safeRows) {
      if (r[c].length > maxLen) maxLen = r[c].length;
    }
    return Math.min(maxLen, 40);
  });

  const padCell = (str: string, width: number, align: TableColumnAlign) => {
    if (!prettyPad || str.length >= width) return str;
    const diff = width - str.length;
    if (align === 'right') return ' '.repeat(diff) + str;
    if (align === 'center') {
      const left = Math.floor(diff / 2);
      const right = diff - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    }
    return str + ' '.repeat(diff);
  };

  const headerLine =
    '| ' +
    safeHeaders
      .map((h, c) => padCell(h, colWidths[c], alignments[c] || 'left'))
      .join(' | ') +
    ' |';

  const delimiterLine =
    '| ' +
    Array.from({ length: colCount }, (_, c) => {
      const align = alignments[c] || 'left';
      const dashLen = Math.max(colWidths[c], 3);
      if (align === 'center') {
        return `:${'-'.repeat(Math.max(dashLen - 2, 3))}:`;
      }
      if (align === 'right') {
        return `${'-'.repeat(Math.max(dashLen - 1, 3))}:`;
      }
      return `:${'-'.repeat(Math.max(dashLen - 1, 3))}`;
    }).join(' | ') +
    ' |';

  const bodyLines = safeRows.map(
    (row) =>
      '| ' +
      row
        .map((cell, c) => padCell(cell, colWidths[c], alignments[c] || 'left'))
        .join(' | ') +
      ' |'
  );

  return [headerLine, delimiterLine, ...bodyLines].join('\n');
}

export function TableMakerModal({
  isOpen,
  onClose,
  initialTable,
  onInsertTable,
}: TableMakerModalProps) {
  const [headers, setHeaders] = useState<string[]>(['項目名', '説明', '状態']);
  const [alignments, setAlignments] = useState<TableColumnAlign[]>(['left', 'left', 'center']);
  const [rows, setRows] = useState<string[][]>([
    ['サンプル 1', '詳細テキストをここに入力', '✅ 完了'],
    ['サンプル 2', '詳細テキストをここに入力', '⏳ 進行中'],
    ['サンプル 3', '詳細テキストをここに入力', '📋 未着手'],
  ]);
  const [replaceRange, setReplaceRange] = useState<{ from: number; to: number } | undefined>(
    undefined
  );

  // フォーカス中のセル (row === -1 はヘッダー行)
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>({
    row: 0,
    col: 0,
  });

  // プレビュー / CSVインポートパネル表示切替
  const [bottomPanel, setBottomPanel] = useState<'preview' | 'markdown' | 'import'>('preview');
  const [csvText, setCsvText] = useState('');
  const [firstRowAsHeader, setFirstRowAsHeader] = useState(true);
  const [copiedMd, setCopiedMd] = useState(false);

  // グリッドサイズピッカー (ホバーで 行×列 を直感的に指定)
  const [gridPickerOpen, setGridPickerOpen] = useState(false);
  const [hoverGrid, setHoverGrid] = useState<{ rows: number; cols: number }>({
    rows: 3,
    cols: 3,
  });
  const gridPickerRef = useRef<HTMLDivElement>(null);

  // セル input の Ref マップ ("h-col" または "r-row-col")
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const focusCellInput = (row: number, col: number) => {
    setTimeout(() => {
      const key = row === -1 ? `h-${col}` : `r-${row}-${col}`;
      const el = cellRefs.current.get(key);
      if (el) {
        el.focus();
        el.select();
      }
    }, 10);
  };

  // モーダルオープン時に初期データを反映
  useEffect(() => {
    if (!isOpen) return;
    if (initialTable) {
      setHeaders([...initialTable.headers]);
      setAlignments([...initialTable.alignments]);
      setRows(initialTable.rows.map((r) => [...r]));
      setReplaceRange({ from: initialTable.from, to: initialTable.to });
    } else {
      setHeaders(['項目名', '説明', '状態']);
      setAlignments(['left', 'left', 'center']);
      setRows([
        ['サンプル 1', '詳細テキストをここに入力', '✅ 完了'],
        ['サンプル 2', '詳細テキストをここに入力', '⏳ 進行中'],
        ['サンプル 3', '詳細テキストをここに入力', '📋 未着手'],
      ]);
      setReplaceRange(undefined);
    }
    setBottomPanel('preview');
    setCsvText('');
    setFocusedCell({ row: -1, col: 0 });
    focusCellInput(-1, 0);
  }, [isOpen, initialTable]);

  // グリッドピッカー外側クリックで閉じる
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (gridPickerRef.current && !gridPickerRef.current.contains(e.target as Node)) {
        setGridPickerOpen(false);
      }
    };
    if (gridPickerOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [gridPickerOpen]);

  const colCount = headers.length;
  const rowCount = rows.length;

  // 列数・行数を一括変更
  const resizeTable = (nextRows: number, nextCols: number) => {
    const targetCols = Math.min(Math.max(1, nextCols), 20);
    const targetRows = Math.min(Math.max(1, nextRows), 100);

    setHeaders((prev) =>
      Array.from({ length: targetCols }, (_, c) => prev[c] ?? `項目 ${c + 1}`)
    );
    setAlignments((prev) =>
      Array.from({ length: targetCols }, (_, c) => prev[c] ?? 'left')
    );
    setRows((prev) =>
      Array.from({ length: targetRows }, (_, r) =>
        Array.from({ length: targetCols }, (__, c) => prev[r]?.[c] ?? '')
      )
    );
  };

  // 列の追加
  const insertColumnAt = (index: number) => {
    if (colCount >= 20) return;
    const nextHeaders = [...headers];
    nextHeaders.splice(index, 0, `項目 ${colCount + 1}`);
    const nextAligns = [...alignments];
    nextAligns.splice(index, 0, 'left');
    const nextRows = rows.map((r) => {
      const copy = [...r];
      copy.splice(index, 0, '');
      return copy;
    });
    setHeaders(nextHeaders);
    setAlignments(nextAligns);
    setRows(nextRows);
    setFocusedCell({ row: -1, col: index });
    focusCellInput(-1, index);
  };

  // 列の削除
  const removeColumnAt = (index: number) => {
    if (colCount <= 1) return;
    setHeaders((prev) => prev.filter((_, i) => i !== index));
    setAlignments((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) => prev.map((r) => r.filter((_, i) => i !== index)));
  };

  // 列の左右入れ替え
  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= colCount) return;

    const swap = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    };

    setHeaders((prev) => swap(prev));
    setAlignments((prev) => swap(prev));
    setRows((prev) => prev.map((r) => swap(r)));
    setFocusedCell((prev) => (prev ? { row: prev.row, col: target } : null));
  };

  // 行の追加
  const insertRowAt = (index: number) => {
    if (rowCount >= 100) return;
    const newRow = Array.from({ length: colCount }, () => '');
    const nextRows = [...rows];
    nextRows.splice(index, 0, newRow);
    setRows(nextRows);
    setFocusedCell({ row: index, col: 0 });
    focusCellInput(index, 0);
  };

  // 行の複製
  const duplicateRowAt = (index: number) => {
    if (rowCount >= 100) return;
    const copyRow = [...(rows[index] || [])];
    const nextRows = [...rows];
    nextRows.splice(index + 1, 0, copyRow);
    setRows(nextRows);
  };

  // 行の削除
  const removeRowAt = (index: number) => {
    if (rowCount <= 1) {
      setRows([Array.from({ length: colCount }, () => '')]);
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // 行の上下移動
  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rowCount) return;
    setRows((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
    setFocusedCell((prev) => (prev ? { row: target, col: prev.col } : null));
  };

  // 行列の転置 (Transpose: 行と列を入れ替え)
  const handleTranspose = () => {
    const allMatrix = [headers, ...rows];
    const newColCount = Math.min(allMatrix.length, 20);
    const newRowCount = Math.max(colCount - 1, 1);

    const transposedHeaders = Array.from(
      { length: newColCount },
      (_, c) => allMatrix[c]?.[0] || `項目 ${c + 1}`
    );
    const transposedRows = Array.from({ length: newRowCount }, (_, r) =>
      Array.from({ length: newColCount }, (__, c) => allMatrix[c]?.[r + 1] ?? '')
    );

    setHeaders(transposedHeaders);
    setAlignments(Array.from({ length: newColCount }, (_, c) => alignments[c] ?? 'left'));
    setRows(transposedRows);
  };

  // 指定列でソート
  const handleSortByColumn = (colIdx: number) => {
    setRows((prev) => {
      const copy = [...prev];
      const isAlreadyAsc = copy.every((r, i) =>
        i === 0
          ? true
          : (copy[i - 1][colIdx] || '').localeCompare(r[colIdx] || '', 'ja', {
              numeric: true,
            }) <= 0
      );
      copy.sort((a, b) => {
        const cmp = (a[colIdx] || '').localeCompare(b[colIdx] || '', 'ja', {
          numeric: true,
        });
        return isAlreadyAsc ? -cmp : cmp;
      });
      return copy;
    });
  };

  // 全セルクリア
  const handleClearCells = () => {
    setHeaders(Array.from({ length: colCount }, (_, i) => `項目 ${i + 1}`));
    setRows(
      Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ''))
    );
  };

  // フォーカス中のセルに装飾や定型バッジを挿入
  const applyFormatToFocusedCell = (prefix: string, suffix: string = '', insertText?: string) => {
    if (!focusedCell) return;
    const { row, col } = focusedCell;
    const key = row === -1 ? `h-${col}` : `r-${row}-${col}`;
    const inputEl = cellRefs.current.get(key);

    const currentVal = row === -1 ? headers[col] || '' : rows[row]?.[col] || '';
    let nextVal = currentVal;

    if (insertText !== undefined) {
      if (inputEl && typeof inputEl.selectionStart === 'number') {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd ?? start;
        nextVal = currentVal.slice(0, start) + insertText + currentVal.slice(end);
      } else {
        nextVal = currentVal ? `${currentVal} ${insertText}` : insertText;
      }
    } else if (inputEl && typeof inputEl.selectionStart === 'number') {
      const start = inputEl.selectionStart;
      const end = inputEl.selectionEnd ?? start;
      const selected = currentVal.slice(start, end) || 'テキスト';
      nextVal = currentVal.slice(0, start) + prefix + selected + suffix + currentVal.slice(end);
    } else {
      nextVal = `${prefix}${currentVal || 'テキスト'}${suffix}`;
    }

    if (row === -1) {
      setHeaders((prev) => prev.map((h, i) => (i === col ? nextVal : h)));
    } else {
      setRows((prev) =>
        prev.map((r, rIdx) =>
          rIdx === row ? r.map((c, cIdx) => (cIdx === col ? nextVal : c)) : r
        )
      );
    }

    setTimeout(() => {
      inputEl?.focus();
    }, 10);
  };

  // キーボードナビゲーション (Tab, Enter, 矢印キー)
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (col > 0) {
          setFocusedCell({ row, col: col - 1 });
          focusCellInput(row, col - 1);
        } else if (row > -1) {
          const prevRow = row - 1;
          setFocusedCell({ row: prevRow, col: colCount - 1 });
          focusCellInput(prevRow, colCount - 1);
        }
      } else {
        if (col < colCount - 1) {
          setFocusedCell({ row, col: col + 1 });
          focusCellInput(row, col + 1);
        } else if (row < rowCount - 1) {
          setFocusedCell({ row: row + 1, col: 0 });
          focusCellInput(row + 1, 0);
        } else {
          // 最終セルで Tab を押した場合は新しい行を自動追加して移動
          insertRowAt(rowCount);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Enter でセル内改行 <br> を挿入
        applyFormatToFocusedCell('', '', '<br>');
      } else if (row < rowCount - 1) {
        setFocusedCell({ row: row + 1, col });
        focusCellInput(row + 1, col);
      } else {
        insertRowAt(rowCount);
        setTimeout(() => {
          setFocusedCell({ row: row + 1, col });
          focusCellInput(row + 1, col);
        }, 20);
      }
    } else if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault();
      if (row < rowCount - 1) {
        setFocusedCell({ row: row + 1, col });
        focusCellInput(row + 1, col);
      }
    } else if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      if (row > -1) {
        setFocusedCell({ row: row - 1, col });
        focusCellInput(row - 1, col);
      }
    }
  };

  // Excel / Googleスプレッドシート / TSV / CSV ペースト自動展開
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startCol: number
  ) => {
    const pasted = e.clipboardData?.getData('text/plain') || '';
    if (!pasted.includes('\n') && !pasted.includes('\t')) {
      return; // 通常の単一セルテキストペーストはそのまま許可
    }

    e.preventDefault();
    const rawLines = pasted
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((l, idx, arr) => !(idx === arr.length - 1 && l.trim() === ''));

    if (rawLines.length === 0) return;

    const matrix = rawLines.map((line) =>
      line.includes('\t') ? line.split('\t') : line.split(',')
    );

    const maxPasteCols = Math.max(...matrix.map((r) => r.length));
    const neededCols = Math.min(Math.max(colCount, startCol + maxPasteCols), 20);

    let nextHeaders = Array.from(
      { length: neededCols },
      (_, c) => headers[c] ?? `項目 ${c + 1}`
    );
    const nextAligns = Array.from(
      { length: neededCols },
      (_, c) => alignments[c] ?? 'left'
    );

    let dataStartMatrixIdx = 0;
    let targetRowStart = startRow;

    if (startRow === -1) {
      const headerRow = matrix[0];
      for (let c = 0; c < headerRow.length && startCol + c < neededCols; c++) {
        nextHeaders[startCol + c] = headerRow[c].trim();
      }
      dataStartMatrixIdx = 1;
      targetRowStart = 0;
    }

    const remainingMatrixRows = matrix.slice(dataStartMatrixIdx);
    const neededRows = Math.min(
      Math.max(rowCount, targetRowStart + remainingMatrixRows.length, 1),
      100
    );

    const nextRows = Array.from({ length: neededRows }, (_, r) =>
      Array.from({ length: neededCols }, (__, c) => rows[r]?.[c] ?? '')
    );

    for (let r = 0; r < remainingMatrixRows.length; r++) {
      const targetR = targetRowStart + r;
      if (targetR >= neededRows) break;
      for (let c = 0; c < remainingMatrixRows[r].length; c++) {
        const targetC = startCol + c;
        if (targetC >= neededCols) break;
        nextRows[targetR][targetC] = remainingMatrixRows[r][c].trim();
      }
    }

    setHeaders(nextHeaders);
    setAlignments(nextAligns);
    setRows(nextRows);
  };

  // CSV / TSV テキストエリアからの一括インポート反映
  const handleApplyCsvImport = () => {
    const trimmed = csvText.trim();
    if (!trimmed) return;

    const rawLines = trimmed
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    if (rawLines.length === 0) return;

    // Markdownテーブル形式が貼られた場合も自動解釈
    const isMdFormat = rawLines.every((l) => l.includes('|'));
    let matrix: string[][];

    if (isMdFormat) {
      const filtered = rawLines.filter((l) => !isDelimiterRow(l));
      matrix = filtered.map((l) => splitTableRow(l));
    } else {
      const useTab = rawLines.some((l) => l.includes('\t'));
      matrix = rawLines.map((l) =>
        (useTab ? l.split('\t') : l.split(',')).map((c) => c.trim())
      );
    }

    const maxCols = Math.min(Math.max(...matrix.map((r) => r.length), 1), 20);
    if (firstRowAsHeader && matrix.length >= 1) {
      setHeaders(
        Array.from({ length: maxCols }, (_, c) => matrix[0][c] || `項目 ${c + 1}`)
      );
      setAlignments(Array.from({ length: maxCols }, () => 'left'));
      const dataRows = matrix.slice(1);
      setRows(
        dataRows.length > 0
          ? dataRows.map((r) => Array.from({ length: maxCols }, (_, c) => r[c] ?? ''))
          : [Array.from({ length: maxCols }, () => '')]
      );
    } else {
      setHeaders(Array.from({ length: maxCols }, (_, c) => `項目 ${c + 1}`));
      setAlignments(Array.from({ length: maxCols }, () => 'left'));
      setRows(matrix.map((r) => Array.from({ length: maxCols }, (_, c) => r[c] ?? '')));
    }

    setBottomPanel('preview');
    setCsvText('');
  };

  const generatedMarkdown = useMemo(
    () => generateMarkdownTableString(headers, alignments, rows, true),
    [headers, alignments, rows]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <TableIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold leading-none">
                  Markdown テーブルメーカー
                </h2>
                {replaceRange && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30">
                    既存テーブル編集中
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                行数・列数・文字揃え・セル内容を自由に設定して挿入できます（Excel / スプレッドシートからの直接貼り付け対応）
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 上部ツールバー: サイズ設定・グリッドピッカー・書式挿入・便利機能 */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-2.5 border-b border-border bg-muted/15 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* ビジュアルグリッドサイズピッカー */}
            <div className="relative" ref={gridPickerRef}>
              <button
                type="button"
                onClick={() => {
                  setHoverGrid({
                    rows: Math.min(rowCount, 8),
                    cols: Math.min(colCount, 10),
                  });
                  setGridPickerOpen(!gridPickerOpen);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-semibold text-foreground cursor-pointer shadow-2xs"
                title="マウスホバーで行×列サイズを直感的に変更"
              >
                <Grid className="size-3.5 text-primary" />
                <span>
                  {colCount} 列 × {rowCount} 行
                </span>
              </button>

              {gridPickerOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 p-3 bg-card border border-border rounded-xl shadow-2xl space-y-2 select-none w-60">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span>グリッドサイズ選択</span>
                    <span className="text-primary font-mono">
                      {hoverGrid.cols} 列 × {hoverGrid.rows} 行
                    </span>
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 8 }, (_, r) =>
                      Array.from({ length: 10 }, (__, c) => {
                        const rNum = r + 1;
                        const cNum = c + 1;
                        const active = rNum <= hoverGrid.rows && cNum <= hoverGrid.cols;
                        return (
                          <button
                            key={`${rNum}-${cNum}`}
                            type="button"
                            onMouseEnter={() => setHoverGrid({ rows: rNum, cols: cNum })}
                            onClick={() => {
                              resizeTable(rNum, cNum);
                              setGridPickerOpen(false);
                            }}
                            className={`size-4 rounded-xs border transition-colors cursor-pointer ${
                              active
                                ? 'bg-primary border-primary'
                                : 'bg-muted/40 border-border hover:border-primary/50'
                            }`}
                          />
                        );
                      })
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border text-[10px] text-muted-foreground">
                    <span>クリックでサイズ適用</span>
                    <span>既存データは保持</span>
                  </div>
                </div>
              )}
            </div>

            {/* 列数・行数の直接増減ステッパー */}
            <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1">
              <Columns className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">列:</span>
              <button
                type="button"
                onClick={() => resizeTable(rowCount, colCount - 1)}
                disabled={colCount <= 1}
                className="px-1.5 py-0.2 rounded hover:bg-muted disabled:opacity-30 font-bold cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={colCount}
                onChange={(e) => resizeTable(rowCount, Number(e.target.value) || 1)}
                className="w-9 text-center font-mono text-xs bg-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => resizeTable(rowCount, colCount + 1)}
                disabled={colCount >= 20}
                className="px-1.5 py-0.2 rounded hover:bg-muted disabled:opacity-30 font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1">
              <Rows className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">行:</span>
              <button
                type="button"
                onClick={() => resizeTable(rowCount - 1, colCount)}
                disabled={rowCount <= 1}
                className="px-1.5 py-0.2 rounded hover:bg-muted disabled:opacity-30 font-bold cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={100}
                value={rowCount}
                onChange={(e) => resizeTable(Number(e.target.value) || 1, colCount)}
                className="w-10 text-center font-mono text-xs bg-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => resizeTable(rowCount + 1, colCount)}
                disabled={rowCount >= 100}
                className="px-1.5 py-0.2 rounded hover:bg-muted disabled:opacity-30 font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            <div className="h-4 w-px bg-border mx-0.5 hidden sm:block" />

            {/* 選択中セルへのクイック書式・バッジ挿入 */}
            <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatToFocusedCell('**', '**')}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                title="選択中のセルに太字 (**text**) を適用"
              >
                <Bold className="size-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatToFocusedCell('*', '*')}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                title="選択中のセルに斜体 (*text*) を適用"
              >
                <Italic className="size-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatToFocusedCell('`', '`')}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                title="選択中のセルにインラインコード (`code`) を適用"
              >
                <Code className="size-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatToFocusedCell('==', '==')}
                className="p-1 rounded hover:bg-muted text-amber-500 hover:text-amber-600 cursor-pointer"
                title="選択中のセルにハイライトマーカー (==text==) を適用"
              >
                <Highlighter className="size-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatToFocusedCell('', '', '<br>')}
                className="px-1.5 py-0.5 rounded hover:bg-muted text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                title="セル内改行 (<br>) を挿入 (Shift+Enterでも可)"
              >
                &lt;br&gt;
              </button>
              <div className="h-3.5 w-px bg-border mx-0.5" />
              {['✅', '⏳', '❌', '⚠️'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatToFocusedCell('', '', emoji)}
                  className="px-1 py-0.5 rounded hover:bg-muted text-xs cursor-pointer"
                  title={`${emoji} をセルに挿入`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 右側ユーティリティ: 行列転置・CSV貼付・クリア */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTranspose}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="行と列を入れ替える (転置)"
            >
              <RefreshCw className="size-3.5" />
              <span className="hidden md:inline">行列入替</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setBottomPanel((prev) => (prev === 'import' ? 'preview' : 'import'))
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                bottomPanel === 'import'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="CSV / TSV / スプレッドシートのテキストからテーブルを一括生成"
            >
              <ClipboardPaste className="size-3.5" />
              <span>CSV / 表貼付</span>
            </button>

            <button
              type="button"
              onClick={handleClearCells}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-rose-50 dark:hover:bg-rose-950/30 text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
              title="すべてのセル内容をクリア"
            >
              <Eraser className="size-3.5" />
              <span className="hidden sm:inline">クリア</span>
            </button>
          </div>
        </div>

        {/* メインスプレッドシート編集領域 */}
        <div className="flex-1 overflow-auto p-5 bg-muted/5 min-h-[240px]">
          <div className="inline-block min-w-full align-middle">
            <table className="w-full border-collapse text-xs">
              <thead>
                {/* 列操作＆文字揃え設定バー */}
                <tr>
                  <th className="w-20 p-1.5 bg-muted/40 border border-border text-center text-[10px] font-semibold text-muted-foreground select-none">
                    列設定
                  </th>
                  {headers.map((_, colIdx) => {
                    const currentAlign = alignments[colIdx] || 'left';
                    return (
                      <th
                        key={`col-ctrl-${colIdx}`}
                        className="p-1.5 bg-muted/40 border border-border min-w-[160px]"
                      >
                        <div className="flex items-center justify-between gap-1">
                          {/* 文字揃え切替 (左 / 中央 / 右) */}
                          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
                            {(
                              [
                                { id: 'left', icon: AlignLeft, label: '左揃え (:---)' },
                                { id: 'center', icon: AlignCenter, label: '中央揃え (:---:)' },
                                { id: 'right', icon: AlignRight, label: '右揃え (---:)' },
                              ] as const
                            ).map((al) => {
                              const Icon = al.icon;
                              const active = currentAlign === al.id;
                              return (
                                <button
                                  key={al.id}
                                  type="button"
                                  onClick={() =>
                                    setAlignments((prev) =>
                                      prev.map((a, i) => (i === colIdx ? al.id : a))
                                    )
                                  }
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                  title={al.label}
                                >
                                  <Icon className="size-3" />
                                </button>
                              );
                            })}
                          </div>

                          {/* 列の移動・ソート・追加・削除 */}
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveColumn(colIdx, -1)}
                              disabled={colIdx === 0}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                              title="この列を左へ移動"
                            >
                              <ArrowLeft className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveColumn(colIdx, 1)}
                              disabled={colIdx === colCount - 1}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                              title="この列を右へ移動"
                            >
                              <ArrowRight className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSortByColumn(colIdx)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                              title="この列の値で行をソート (昇順/降順)"
                            >
                              <ArrowUpDown className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => insertColumnAt(colIdx + 1)}
                              className="p-1 rounded hover:bg-primary/15 text-primary cursor-pointer"
                              title="右隣に新しい列を挿入"
                            >
                              <Plus className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeColumnAt(colIdx)}
                              disabled={colCount <= 1}
                              className="p-1 rounded hover:bg-rose-500/15 text-muted-foreground hover:text-rose-500 disabled:opacity-25 cursor-pointer"
                              title="この列を削除"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* ヘッダー行入力 */}
                <tr>
                  <th className="p-2 bg-primary/10 border border-border text-center font-bold text-[11px] text-primary select-none">
                    見出し行
                  </th>
                  {headers.map((headerText, colIdx) => {
                    const align = alignments[colIdx] || 'left';
                    const isFocused =
                      focusedCell?.row === -1 && focusedCell?.col === colIdx;
                    return (
                      <th
                        key={`header-cell-${colIdx}`}
                        className={`p-0 border border-border bg-primary/5 transition-colors ${
                          isFocused ? 'ring-2 ring-primary ring-inset z-10' : ''
                        }`}
                      >
                        <input
                          ref={(el) => {
                            if (el) cellRefs.current.set(`h-${colIdx}`, el);
                            else cellRefs.current.delete(`h-${colIdx}`);
                          }}
                          type="text"
                          value={headerText}
                          onFocus={() => setFocusedCell({ row: -1, col: colIdx })}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaders((prev) =>
                              prev.map((h, i) => (i === colIdx ? val : h))
                            );
                          }}
                          onKeyDown={(e) => handleCellKeyDown(e, -1, colIdx)}
                          onPaste={(e) => handleCellPaste(e, -1, colIdx)}
                          placeholder={`見出し ${colIdx + 1}`}
                          style={{ textAlign: align }}
                          className="w-full px-3 py-2.5 font-bold text-foreground bg-transparent focus:outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {rows.map((rowCells, rowIdx) => (
                  <tr key={`data-row-${rowIdx}`} className="group/row hover:bg-muted/20">
                    {/* 行操作セル */}
                    <td className="p-1 bg-muted/20 border border-border text-center select-none">
                      <div className="flex items-center justify-between px-1 gap-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                          #{rowIdx + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveRow(rowIdx, -1)}
                            disabled={rowIdx === 0}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                            title="行を上へ移動"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(rowIdx, 1)}
                            disabled={rowIdx === rowCount - 1}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer"
                            title="行を下へ移動"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateRowAt(rowIdx)}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                            title="この行を複製"
                          >
                            <Copy className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRowAt(rowIdx)}
                            className="p-0.5 rounded hover:bg-rose-500/15 text-muted-foreground hover:text-rose-500 cursor-pointer"
                            title="この行を削除"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* データセル入力 */}
                    {rowCells.map((cellText, colIdx) => {
                      const align = alignments[colIdx] || 'left';
                      const isFocused =
                        focusedCell?.row === rowIdx && focusedCell?.col === colIdx;
                      return (
                        <td
                          key={`cell-${rowIdx}-${colIdx}`}
                          className={`p-0 border border-border bg-background transition-colors ${
                            isFocused ? 'ring-2 ring-primary ring-inset z-10' : ''
                          }`}
                        >
                          <input
                            ref={(el) => {
                              if (el) cellRefs.current.set(`r-${rowIdx}-${colIdx}`, el);
                              else cellRefs.current.delete(`r-${rowIdx}-${colIdx}`);
                            }}
                            type="text"
                            value={cellText}
                            onFocus={() => setFocusedCell({ row: rowIdx, col: colIdx })}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRows((prev) =>
                                prev.map((r, rI) =>
                                  rI === rowIdx
                                    ? r.map((c, cI) => (cI === colIdx ? val : c))
                                    : r
                                )
                              );
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handleCellPaste(e, rowIdx, colIdx)}
                            placeholder="テキストを入力..."
                            style={{ textAlign: align }}
                            className="w-full px-3 py-2 text-foreground bg-transparent focus:outline-none placeholder:text-muted-foreground/35"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 行追加・列追加ショートカットバー */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => insertRowAt(rowCount)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border hover:border-primary bg-background hover:bg-primary/5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>新しい行を追加 (最終セルで Tab / Enter でも追加可能)</span>
              </button>

              <button
                type="button"
                onClick={() => insertColumnAt(colCount)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border hover:border-primary bg-background hover:bg-primary/5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>新しい列を追加</span>
              </button>
            </div>
          </div>
        </div>

        {/* 下部パネル: ビジュアルプレビュー / Markdownコード確認 / CSV一括インポート */}
        <div className="border-t border-border bg-muted/20 flex flex-col shrink-0 max-h-56">
          <div className="flex items-center justify-between px-6 py-2 border-b border-border/60 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBottomPanel('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  bottomPanel === 'preview'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Eye className="size-3.5" />
                <span>表示プレビュー</span>
              </button>
              <button
                type="button"
                onClick={() => setBottomPanel('markdown')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  bottomPanel === 'markdown'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Sparkles className="size-3.5" />
                <span>生成 Markdown コード</span>
              </button>
              <button
                type="button"
                onClick={() => setBottomPanel('import')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  bottomPanel === 'import'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <ClipboardPaste className="size-3.5" />
                <span>CSV / TSV 一括貼付</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(generatedMarkdown);
                setCopiedMd(true);
                setTimeout(() => setCopiedMd(false), 2000);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-medium cursor-pointer"
            >
              {copiedMd ? (
                <>
                  <Check className="size-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Markdownをコピーしました
                  </span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Markdownをコピー</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 overflow-y-auto flex-1">
            {bottomPanel === 'preview' && (
              <div className="overflow-x-auto">
                <table className="border-collapse border border-border text-xs w-full max-w-4xl">
                  <thead>
                    <tr className="bg-muted/50">
                      {headers.map((h, c) => (
                        <th
                          key={`pv-h-${c}`}
                          style={{ textAlign: alignments[c] || 'left' }}
                          className="border border-border px-3 py-1.5 font-bold text-foreground"
                        >
                          {h || `項目 ${c + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, rIdx) => (
                      <tr key={`pv-r-${rIdx}`} className="even:bg-muted/20">
                        {r.map((cell, cIdx) => (
                          <td
                            key={`pv-c-${rIdx}-${cIdx}`}
                            style={{ textAlign: alignments[cIdx] || 'left' }}
                            className="border border-border px-3 py-1.5 text-foreground/90"
                          >
                            {cell.split('<br>').map((line, lIdx) => (
                              <React.Fragment key={lIdx}>
                                {lIdx > 0 && <br />}
                                {line}
                              </React.Fragment>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bottomPanel === 'markdown' && (
              <pre className="p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                {generatedMarkdown}
              </pre>
            )}

            {bottomPanel === 'import' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    カンマ区切り (CSV)、タブ区切り (Excel / スプレッドシート)、または既存の Markdown 表を貼り付けてください:
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={firstRowAsHeader}
                        onChange={(e) => setFirstRowAsHeader(e.target.checked)}
                        className="rounded border-border text-primary"
                      />
                      <span>1行目を見出しにする</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleApplyCsvImport}
                      disabled={!csvText.trim()}
                      className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      テーブルに反映
                    </button>
                  </div>
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={3}
                  placeholder={`例:\n機能名, 説明, 対応状況\nテーブルメーカー, GUIで直感的に表を作成, ✅ 完了\n全画面画像拡大, クリックでLightbox表示, ✅ 完了`}
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-3 border-t border-border bg-muted/30 text-xs shrink-0">
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3">
            <span>💡 ヒント: セル内で Tab / Enter で素早く次のマスへ移動</span>
            <span>Shift+Enter でセル内改行 (&lt;br&gt;)</span>
            <span>Excelの表をコピーしてセルに直接 Ctrl+V 貼り付け可能</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {replaceRange && (
              <button
                type="button"
                onClick={() => setReplaceRange(undefined)}
                className="px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="既存テーブルの上書きではなく新規テーブルとして挿入する"
              >
                新規挿入に切替
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertTable(generatedMarkdown, replaceRange);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Check className="size-4" />
              <span>{replaceRange ? 'テーブルを更新する' : 'テーブルを挿入する'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
