import React from 'react';

/**
 * v1.4.2 stop 34 (C): the nmrshiftdb2 attribution, shown in the site footer and with the ¹H prediction result (Mode B, ¹H NMR).
 * The sentence is the one at the head of scripts/nmrshiftdb2/extract_h1.py and in tests/fixtures/v140/nmrshiftdb2/extraction_stats.json (pinned by tests/ui/nmrshiftdb2Notice.test.ts).
 * Some ¹H class shifts may come from measured nmrshiftdb2 spectra (V12_CONFIG.v142Nmrshiftdb2); the sentence is shown whether or not that layer is on.
 */
export const NMRSHIFTDB2_NOTICE = 'Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.';
export const NMRSHIFTDB2_LICENSE_URL = 'https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt';

export function Nmrshiftdb2Notice({testId = 'nmrshiftdb2-notice', className = ''}: {testId?: string; className?: string}) {
  return (
    <p data-testid={testId} className={`text-[11px] text-slate-500 ${className}`}>
      {NMRSHIFTDB2_NOTICE}{' '}
      <a href={NMRSHIFTDB2_LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">nmrshiftdb2 Database License</a>
    </p>
  );
}

/** The site footer (App, below <main>). */
export function SiteFooter() {
  return (
    <footer data-testid="site-footer" className="border-t border-slate-800 px-4 py-3 text-center">
      <Nmrshiftdb2Notice testId="footer-nmrshiftdb2-notice" />
    </footer>
  );
}
