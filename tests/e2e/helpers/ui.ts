import type {Locator, Page} from '@playwright/test';

/**
 * v1.2.2 (P2a): the marked-signal list keeps the usually-unknown fields (IR band shape, multiplicity, J, note...) in each row's own
 * 「明細」 (<details> inside the `observation-row`). This helper ONLY expands that row; it never reads, asserts or edits anything.
 * Safe to call on an already-expanded row.
 */
export async function openRow(row: Locator): Promise<void> {
  const details = row.locator('details').first();
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
}

/** The five tabs of the result page (page 3). */
export type ResultTab = '圖譜官能基' | '預測結構' | '分子式與搜尋' | '輸入與校正' | '診斷';

/**
 * v1.2.2 (P3): the result page shows one tab at a time (the others are rendered but hidden). This helper ONLY switches to a tab; it never reads,
 * asserts or edits anything. Safe to call when that tab is already open.
 */
export async function openTab(page: Page, name: ResultTab): Promise<void> {
  const tab = page.getByRole('tab', {name});
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}
