import React, {useState} from 'react';

/**
 * 「顯示前 N 筆＋展開全部」 (v1.2.2): the result tabs never use an inner scroll area; a long list shows its first N items and a button for the rest.
 * Display only: all items stay in the data.
 */
export function LimitedList<T>({items, limit, render, as = 'ul', className, label = '筆', testId}: {
  items: readonly T[];
  limit: number;
  render: (item: T, index: number) => React.ReactNode;
  as?: 'ul' | 'div' | 'tbody';
  className?: string;
  label?: string;
  testId?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  const Tag = as;
  return (
    <>
      <Tag className={className} data-testid={testId}>{shown.map((it, i) => render(it, i))}</Tag>
      {items.length > limit && <ShowMoreButton all={all} total={items.length} shown={Math.min(limit, items.length)} label={label} onToggle={() => setAll(v => !v)} />}
    </>
  );
}

export function ShowMoreButton({all, total, shown, label = '筆', onToggle}: {all: boolean; total: number; shown: number; label?: string; onToggle: () => void}) {
  return (
    <button type="button" aria-expanded={all} onClick={onToggle} className="mt-1.5 block text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">
      {all ? '收合' : `展開全部 ${total} ${label}（目前顯示前 ${shown} ${label}）`}
    </button>
  );
}
