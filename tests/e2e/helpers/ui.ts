import type {Locator} from '@playwright/test';

/**
 * v1.2.2 (P2a): the marked-signal list keeps the usually-unknown fields (IR band shape, multiplicity, J, note...) in each row's own
 * 「明細」 (<details> inside the `observation-row`). This helper ONLY expands that row; it never reads, asserts or edits anything.
 * Safe to call on an already-expanded row.
 */
export async function openRow(row: Locator): Promise<void> {
  const details = row.locator('details').first();
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
}
