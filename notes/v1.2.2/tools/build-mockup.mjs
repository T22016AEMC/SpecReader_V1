// Generates the stand-alone HTML mock-ups in notes/v1.2.2/mockup/ (no network, no dev server: open the files by double-click).
// All data are SYNTHETIC: the hand-written fixture tests/fixtures/v121/S1.json run through the real v1.2.1 pipeline (numbers are the real output shape).
// Usage: node notes/v1.2.2/tools/build-mockup.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'mockup');
const logo = fs.readFileSync(path.join(out, '_logo-icon-96.png')).toString('base64');

// ---------------------------------------------------------------- styles
const CSS = `
:root{--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--line2:#cbd5e1;--text:#1e293b;--muted:#64748b;--muted2:#94a3b8;
--navy:#064b6b;--primary:#2563eb;--primary-h:#1d4ed8;--cyan:#21c3ec;--sky:#1ca3d2;
--amber-bg:#fffbeb;--amber-line:#fde68a;--amber-tx:#92400e;--amber-ic:#d97706;
--blue-bg:#eff6ff;--blue-line:#bfdbfe;--blue-tx:#1e3a8a;
--rose-bg:#fff1f2;--rose-line:#fecdd3;--rose-tx:#9f1239;
--green-bg:#ecfdf5;--green-line:#a7f3d0;--green-tx:#065f46;
--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Consolas,monospace;
--sans:"Plus Jakarta Sans","Segoe UI","Microsoft JhengHei","PingFang TC",system-ui,sans-serif}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.app{height:100vh;display:flex;flex-direction:column}
/* header 64px */
.hdr{height:64px;flex:none;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 1px 1px rgba(15,23,42,.04);display:flex;align-items:center;gap:16px;padding:0 24px;z-index:30}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brand img{width:40px;height:40px;border-radius:12px;flex:none;border:1px solid rgba(226,232,240,.8)}
.brand h1{margin:0;font-size:20px;line-height:1;font-weight:800;letter-spacing:-.02em;color:var(--navy)}
.brand h1 b{color:#0859be}
.brand .sub{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
.ver{font:600 10px var(--mono);padding:1px 6px;border-radius:4px;background:#f1f5f9;color:var(--muted);margin-left:8px;vertical-align:2px}
.modes{display:flex;gap:4px;margin:0 auto;background:#f1f5f9;border-radius:10px;padding:3px}
.modes a{font-size:12px;font-weight:600;color:#475569;padding:6px 12px;border-radius:8px;text-decoration:none;white-space:nowrap}
.modes a.on{background:#fff;color:var(--primary);box-shadow:0 1px 2px rgba(15,23,42,.12)}
.modes a.sm{font-weight:500;color:var(--muted)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.hr{display:flex;gap:8px;align-items:center;flex:none}
.draft{font-size:11px;color:var(--amber-tx);background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:6px;padding:2px 8px;white-space:nowrap}
/* buttons */
.btn{display:inline-flex;align-items:center;gap:6px;font:600 12px var(--sans);border-radius:8px;padding:6px 12px;border:1px solid var(--line2);background:#fff;color:#334155;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{background:#f8fafc}.btn.pri{background:var(--primary);border-color:var(--primary);color:#fff}.btn.pri:hover{background:var(--primary-h)}
.btn.sm{padding:3px 8px;font-size:11px;border-radius:6px}.btn.gray{background:#f1f5f9;border-color:#f1f5f9}
.btn.danger{color:#be123c}
/* step bar */
.steps{flex:none;background:#fff;border-bottom:1px solid var(--line);height:44px;display:flex;align-items:center;gap:6px;padding:0 24px;z-index:20}
.step{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);padding:5px 12px;border-radius:999px;border:1px solid transparent;text-decoration:none;white-space:nowrap}
.step .n{width:20px;height:20px;border-radius:999px;background:#e2e8f0;color:#475569;font:700 11px var(--mono);display:grid;place-items:center}
.step.on{background:var(--blue-bg);border-color:var(--blue-line);color:var(--blue-tx);font-weight:700}.step.on .n{background:var(--primary);color:#fff}
.step.done .n{background:#10b981;color:#fff}.step small{font-weight:400;color:var(--muted2)}
.step .w{color:var(--amber-ic);font-weight:700}
.sep{color:var(--muted2)}
.stat{margin-left:auto;display:flex;gap:6px;font:11px var(--mono)}
.pill{padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:#f8fafc;color:#475569;white-space:nowrap}
.pill.w{background:var(--amber-bg);border-color:var(--amber-line);color:var(--amber-tx)}.pill.g{background:var(--green-bg);border-color:var(--green-line);color:var(--green-tx)}
/* sub bar (page 3) */
.subbar{flex:none;background:#fff;border-bottom:1px solid var(--line2);display:flex;align-items:center;gap:16px;padding:0 24px;height:48px;z-index:15}
.ctl{display:flex;align-items:center;gap:10px;font-size:12px;color:#475569;min-width:0}
.ctl .st{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.tabs{display:flex;gap:2px;margin-left:auto;height:100%}
.tab{appearance:none;border:0;background:none;font:600 13px var(--sans);color:var(--muted);padding:0 14px;height:100%;border-bottom:3px solid transparent;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap}
.tab:hover{color:var(--text)}.tab[aria-selected=true]{color:var(--primary);border-bottom-color:var(--primary)}
.tab .c{font:600 10px var(--mono);background:#f1f5f9;color:var(--muted);border-radius:999px;padding:0 6px}
.tab .c.w{background:var(--amber-bg);color:var(--amber-tx);border:1px solid var(--amber-line)}
/* the only scrolling region: visible scrollbar */
.scroll{flex:1;overflow-y:scroll;overflow-x:hidden;scrollbar-width:auto;scrollbar-color:#94a3b8 #e2e8f0}
.scroll::-webkit-scrollbar{width:14px}.scroll::-webkit-scrollbar-track{background:#e2e8f0;border-left:1px solid #cbd5e1}
.scroll::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:8px;border:3px solid #e2e8f0}.scroll::-webkit-scrollbar-thumb:hover{background:#64748b}
.wrap{max-width:1280px;margin:0 auto;padding:16px 24px 64px;display:flex;flex-direction:column;gap:12px}
/* cards */
.card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 1px rgba(15,23,42,.03)}
.ch{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(248,250,252,.7);border-radius:12px 12px 0 0}
.sq{width:22px;height:22px;border-radius:6px;background:#0f172a;color:#fff;display:grid;place-items:center;font:700 11px var(--mono);flex:none}
.ch h2,.ch h3{margin:0;font-size:14px;font-weight:700}.ch .r{margin-left:auto;display:flex;gap:6px;align-items:center}
.cb{padding:12px 14px}.hint{font-size:12px;color:var(--muted)}
.tag{font:11px var(--mono);background:#f1f5f9;border-radius:4px;padding:1px 6px;color:#1e293b;white-space:nowrap}
.tag.b{background:var(--blue-bg);color:var(--blue-tx)}.tag.g{background:var(--green-bg);color:var(--green-tx)}.tag.w{background:var(--amber-bg);color:var(--amber-tx)}.tag.r{background:var(--rose-bg);color:var(--rose-tx)}
.alert{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:10px 14px;font-size:12.5px;border:1px solid}
.alert.w{background:var(--amber-bg);border-color:var(--amber-line);color:var(--amber-tx)}.alert.i{background:var(--blue-bg);border-color:var(--blue-line);color:var(--blue-tx)}
.alert.e{background:var(--rose-bg);border-color:var(--rose-line);color:var(--rose-tx)}.alert.s{background:var(--green-bg);border-color:var(--green-line);color:var(--green-tx)}
.alert b{font-weight:700}.alert .ic{font-weight:800;flex:none}.alert ul{margin:2px 0 0;padding-left:18px}
ul.bl{margin:0;padding-left:18px}ul.bl li{margin:2px 0}ul.bl.tight li{margin:0}
.muted{color:var(--muted)}.sm{font-size:12px}.xs{font-size:11px}.mono{font-family:var(--mono)}
.row{display:flex;gap:12px;align-items:center}.grow{flex:1;min-width:0}.gap8{gap:8px}.wrapf{flex-wrap:wrap}
/* details */
details>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"▸";color:var(--muted2);font-size:11px;width:10px;flex:none;transition:transform .12s}
details[open]>summary::before{transform:rotate(90deg)}
.fold{border:1px solid var(--line);border-radius:10px;background:#fff}
.fold>summary{padding:8px 12px;font-weight:600;font-size:13px}.fold>.in{padding:4px 14px 12px;border-top:1px solid var(--line)}
.item{border-bottom:1px solid #f1f5f9}.item:last-child{border-bottom:0}
.item>summary{padding:7px 4px;font-size:13px}.item>.in{padding:2px 4px 10px 22px;font-size:12px;color:#475569}
table{border-collapse:collapse;width:100%}th{font:600 11px var(--sans);color:var(--muted);text-align:left;padding:4px 8px;border-bottom:1px solid var(--line)}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:top}td.m,th.m{font-family:var(--mono)}
/* inputs */
input[type=text],input[type=number],select{font:12px var(--mono);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;background:#fff;color:var(--text);min-width:0}
input:focus,select:focus{outline:2px solid #bfdbfe;border-color:var(--primary)}
.strip{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.strip label{font-size:12px;font-weight:700}
/* chips (page 1) */
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:#fff;border-radius:10px;padding:6px 10px;font-size:12px;min-height:36px}
.chip.on{border-color:var(--primary);box-shadow:0 0 0 2px #dbeafe}.chip.empty{border-style:dashed;color:var(--muted);background:transparent}
.chip b{font:700 12px var(--mono)}.chip .fn{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}
.st-ok{color:#047857;font-weight:600}.st-w{color:#b45309;font-weight:600}
/* viewer */
.viewer{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.viewer svg{display:block;width:100%;height:auto;background:#fff}
.grid2{display:grid;grid-template-columns:7fr 5fr;gap:12px;align-items:start}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:1100px){.grid2{grid-template-columns:1fr}.grid3{grid-template-columns:1fr}.hdr .brand .sub{display:none}.modes a{padding:6px 8px}}
/* conclusion cards */
.top3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cand{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;display:flex;flex-direction:column;gap:8px}
.cand.first{border-color:#93c5fd;box-shadow:0 0 0 3px #eff6ff}
.rank{font:700 11px var(--mono);padding:1px 8px;border-radius:5px;background:#e2e8f0;color:#334155}.cand.first .rank{background:var(--primary);color:#fff}
.score{font:800 22px var(--mono);color:var(--navy);line-height:1}.score small{font-size:11px;font-weight:500;color:var(--muted)}
.struct{background:#fff;border:1px solid #eef2f6;border-radius:8px;display:grid;place-items:center;padding:4px}.struct svg{width:100%;max-width:210px;height:auto}
.reasons{margin:0;padding-left:16px;font-size:12px;color:#334155}.reasons li{margin:1px 0}.reasons .x{color:var(--rose-tx)}
.legend{font-size:11px;color:var(--muted)}
/* chk list */
.chk{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:6px 18px;margin:0;padding:0;list-style:none}
.chk li{display:flex;gap:8px;font-size:12.5px;align-items:flex-start}
.chk .m{flex:none;width:18px;height:18px;border-radius:999px;display:grid;place-items:center;font:800 11px var(--sans);margin-top:1px}
.chk .ok{background:#d1fae5;color:#047857}.chk .wn{background:#fde68a;color:#92400e}.chk .in{background:#dbeafe;color:#1d4ed8}
.pre{white-space:pre-wrap;font:12px/1.7 var(--mono);background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:12px;margin:0;color:#1e293b}
.dev{position:fixed;left:16px;bottom:12px;z-index:50;font-size:12px}.dev>summary{background:#0f172a;color:#fff;border-radius:999px;padding:4px 12px;display:inline-flex;box-shadow:0 2px 6px rgba(15,23,42,.3)}
.dev>summary::before{display:none}.dev .box{margin-top:6px;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:10px 14px;max-width:420px;box-shadow:0 8px 24px rgba(15,23,42,.35)}
.dev ul{margin:0;padding-left:18px}.dev li{margin:2px 0}
dialog{border:1px solid var(--line);border-radius:14px;padding:0;max-width:640px;width:92vw;box-shadow:0 20px 50px rgba(15,23,42,.25)}dialog::backdrop{background:rgba(15,23,42,.35)}
.toast{position:fixed;right:30px;bottom:20px;background:#0f172a;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:60}.toast.on{opacity:1}
@media print{.hdr,.steps,.subbar,.dev{display:none}.scroll{overflow:visible}}
`;

// ---------------------------------------------------------------- small helpers
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hex = (cx, cy, r, inner = [1, 3, 5]) => {
  const pts = Array.from({length: 6}, (_, i) => [cx + r * Math.cos(Math.PI / 3 * i), cy + r * Math.sin(Math.PI / 3 * i)]);
  const poly = pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const dbl = inner.map(i => { const a = pts[i], b = pts[(i + 1) % 6]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const k = .78;
    const f = p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]; const [x1, y1] = f(a), [x2, y2] = f(b); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('');
  return `<polygon points="${poly}"/>${dbl}`;
};
const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const txt = (x, y, t, a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" class="lb">${t}</text>`;
const wrapSvg = (vb, body) => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img"><style>polygon,line{stroke:#334155;stroke-width:1.6;fill:none;stroke-linecap:round}.lb{font:600 11px sans-serif;fill:#0f172a}</style>${body}</svg>`;
const STRUCT = {
  bis: wrapSvg('0 0 200 100', hex(50, 50, 18) + hex(150, 50, 18) + line(68, 50, 100, 50) + line(100, 50, 132, 50) + line(100, 50, 100, 24) + line(100, 50, 100, 76) + line(32, 50, 20, 50) + line(168, 50, 180, 50) + txt(12, 54, 'OH') + txt(188, 54, 'OH') + txt(100, 18, 'CH₃') + txt(100, 90, 'CH₃')),
  cre: wrapSvg('0 0 140 100', hex(70, 50, 22) + line(48, 50, 30, 50) + line(92, 50, 110, 50) + txt(20, 54, 'OH') + txt(122, 54, 'CH₃')),
  mox: wrapSvg('0 0 170 100', hex(60, 50, 22) + line(38, 50, 22, 50) + line(82, 50, 100, 50) + line(112, 50, 128, 40) + txt(14, 54, 'OH') + txt(106, 56, 'O') + txt(140, 38, 'CH₃')),
};

// IR spectrum (synthetic, % transmittance) built from the S1 fixture peaks
const IRPK = [[3350, 25, 170], [3030, 80, 14], [2965, 70, 16], [1612, 60, 14], [1510, 20, 16], [1440, 65, 14], [1235, 30, 22], [1175, 45, 14], [830, 28, 12], [560, 60, 14]];
function irSvg({marks = true, calib = false, baseline = false} = {}) {
  const W = 760, H = 330, L = 56, R = 740, T = 14, B = 286, x = w => L + (4000 - w) / 3600 * (R - L), y = t => B - (t / 100) * (B - T);
  const val = w => { let t = 96; for (const [c, tt, s] of IRPK) t -= (96 - tt) * Math.exp(-.5 * ((w - c) / s) ** 2); return Math.max(4, t); };
  let d = ''; for (let w = 4000; w >= 400; w -= 6) d += `${x(w).toFixed(1)},${y(val(w)).toFixed(1)} `;
  const ticks = [4000, 3500, 3000, 2500, 2000, 1500, 1000, 500].map(w => `<line x1="${x(w)}" y1="${B}" x2="${x(w)}" y2="${B + 5}" stroke="#64748b"/><text x="${x(w)}" y="${B + 18}" text-anchor="middle" font-size="11" fill="#475569" font-family="IBM Plex Mono,monospace">${w}</text>`).join('');
  const mk = marks ? IRPK.map(([c, tt], i) => `<g><line x1="${x(c)}" y1="${y(val(c)) - 6}" x2="${x(c)}" y2="${y(val(c)) - 20}" stroke="#2563eb" stroke-width="1.5"/><circle cx="${x(c)}" cy="${y(val(c))}" r="3.5" fill="#2563eb"/><text x="${x(c)}" y="${y(val(c)) - 24}" text-anchor="middle" font-size="10" fill="#1d4ed8" font-family="IBM Plex Mono,monospace">${c}</text></g>`).join('') : '';
  const cal = calib ? [[3000, 'A'], [1500, 'B/C'], [500, 'D']].map(([w, l]) => `<g><line x1="${x(w)}" y1="${T}" x2="${x(w)}" y2="${B}" stroke="#0ea5e9" stroke-dasharray="4 3"/><rect x="${x(w) - 14}" y="${T + 2}" width="28" height="16" rx="4" fill="#0ea5e9"/><text x="${x(w)}" y="${T + 14}" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">${l}</text></g>`).join('') : '';
  const bl = baseline ? `<polyline fill="none" stroke="#d97706" stroke-width="2" points="${[4000, 3000, 2000, 1000, 400].map(w => `${x(w)},${y(97 - (w < 1200 ? 2 : 0))}`).join(' ')}"/>${[4000, 3000, 2000, 1000, 400].map((w, i) => `<circle cx="${x(w)}" cy="${y(97 - (w < 1200 ? 2 : 0))}" r="7" fill="#fbbf24" fill-opacity=".35" stroke="#92400e"/><text x="${x(w) + 10}" y="${y(97) - 10}" font-size="11" fill="#b45309" font-weight="700">${i + 1}</text>`).join('')}` : '';
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="#fff" stroke="#94a3b8"/><polyline fill="none" stroke="#0e7abd" stroke-width="1.6" points="${d}"/>${bl}${cal}${mk}${ticks}<text x="${(L + R) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#64748b">波數 cm⁻¹（草圖：合成資料）</text></svg>`;
}
function h1Svg({calib = false} = {}) {
  const W = 760, H = 250, L = 56, R = 740, T = 14, B = 206, x = p => L + (12 - p) / 12 * (R - L);
  const pk = [[7.08, 4, 'd'], [6.73, 4, 'd'], [4.75, 2, 'br s'], [1.62, 6, 's'], [7.26, 1, '']];
  const lines = pk.map(([p, h, m], i) => `<line x1="${x(p)}" y1="${B}" x2="${x(p)}" y2="${B - (i === 4 ? 30 : 40 + h * 22)}" stroke="${i === 4 ? '#94a3b8' : '#0e7abd'}" stroke-width="3"/>`).join('');
  const marks = pk.slice(0, 4).map(([p, h, m]) => `<g><circle cx="${x(p)}" cy="${B - (40 + h * 22) - 6}" r="3.5" fill="#2563eb"/><text x="${x(p)}" y="${B - (40 + h * 22) - 14}" text-anchor="middle" font-size="10" fill="#1d4ed8" font-family="IBM Plex Mono,monospace">${p.toFixed(2)}</text></g>`).join('');
  const ticks = [12, 10, 8, 6, 4, 2, 0].map(p => `<line x1="${x(p)}" y1="${B}" x2="${x(p)}" y2="${B + 5}" stroke="#64748b"/><text x="${x(p)}" y="${B + 18}" text-anchor="middle" font-size="11" fill="#475569" font-family="IBM Plex Mono,monospace">${p}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="#fff" stroke="#94a3b8"/>${lines}${marks}${ticks}<text x="${(L + R) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#64748b">δ ppm（草圖：合成影像；x 軸為程式預設 0–12 ppm 假設）</text></svg>`;
}

// ---------------------------------------------------------------- shell
const header = (mode = 'A') => `
<header class="hdr">
  <div class="brand"><img src="data:image/png;base64,${logo}" alt="SpecReader"><div><h1>Spec<b>Reader</b><span class="ver">v1.2.2</span></h1><div class="sub">規則與證據導向的多光譜結構解析工作台</div></div></div>
  <nav class="modes" aria-label="模式">
    <a href="#" class="${mode === 'A' ? 'on' : ''}" title="Mode A：實驗證據 → 官能基判讀 → 候選結構推論">Mode A：實驗證據<span class="sr"> → 官能基判讀 → 候選結構推論</span></a>
    <a href="#" title="Mode B：輸入結構 → 預測光譜">Mode B：輸入結構<span class="sr"> → 預測光譜</span></a>
    <a href="#" class="sm">專案資訊</a><a href="#" class="sm">紀錄</a><a href="#" class="sm">引擎與測試</a>
  </nav>
  <div class="hr"><span class="draft">草圖 · 合成樣本，非真實資料</span><button class="btn" onclick="document.getElementById('exp').showModal()">⬇ 匯出報告</button></div>
</header>`;

const stepsBar = (active, warn = true) => {
  const s = (n, label, sub, cls) => `<a class="step ${cls}" href="#"><span class="n">${n}</span><span>第 ${n} 頁 ${label}${n === 3 && warn ? ' <span class="w" title="尚有光譜未校正">⚠</span>' : ''} <small>${sub}</small></span></a>`;
  return `<div class="steps">${s(1, '訊號標記', '上傳・點峰', active === 1 ? 'on' : 'done')}<span class="sep">›</span>${s(2, '座標校正', '像素 → 真實刻度', active === 2 ? 'on' : active > 2 ? 'done' : '')}<span class="sep">›</span>${s(3, '化學判讀', '結論・證據・診斷', active === 3 ? 'on' : '')}
  <div class="stat"><span class="pill">已標記 14</span><span class="pill ${warn ? 'w' : 'g'}">${warn ? '座標：1 張未校正' : '座標：全部已確認'}</span></div></div>`;
};

const inputStrip = (formula = '') => `
<section class="card"><div class="cb"><div class="strip">
  <label>Mode A 輸入證據中心</label>
  <input type="text" aria-label="分子式（選填）" placeholder="分子式（選填）例：C15H16O2" value="${formula}" style="width:210px">
  <input type="text" placeholder="其他化學證據（FeCl₃ 呈色、D₂O 交換…）" style="width:300px">
  <span class="pill g">光譜：IR、¹H</span><span class="pill">分子式：${formula ? '已提供' : '未提供'}</span>
  <button class="btn sm gray" style="margin-left:auto">重置空白未知物</button></div></div></section>`;

const devNote = items => `<details class="dev"><summary>草圖說明</summary><div class="box"><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div></details>`;
const exportDialog = `<dialog id="exp"><div class="ch"><div class="sq">⬇</div><h3>匯出報告</h3><div class="r"><button class="btn sm" onclick="this.closest('dialog').close()">關閉</button></div></div>
<div class="cb"><p class="hint" style="margin-top:0">匯出視窗功能全數保留（草圖僅示意；診斷分頁另有同樣的按鈕）。</p><div class="row wrapf gap8"><button class="btn">複製 Markdown 報告</button><button class="btn">下載完整 JSON 證據包</button><button class="btn">列印報告</button><button class="btn">生成 Gemini 輔助科學評論</button></div></div></dialog>`;
const page = (title, body, scripts = '') => `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="app">${body}</div>${exportDialog}<div class="toast" id="toast"></div><script>
const toast=m=>{const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1800)};
${scripts}</script></body></html>`;

// ---------------------------------------------------------------- page 1
function page1() {
  const rows = IRPK.map(([c], i) => `<details class="item"><summary><span class="mono" style="width:70px">${c}</span><span class="muted xs">cm⁻¹</span><span class="grow"></span><button class="btn sm danger" onclick="event.preventDefault()">刪除</button></summary><div class="in"><div class="row wrapf gap8"><span>基線相對強度 <b class="mono">${(0.18 + i * 0.07).toFixed(2)}</b></span><span>吸收帶形態 <select><option>${i === 0 ? '寬峰' : '未判定'}</option><option>窄峰</option><option>寬峰</option></select></span><span>備註 <input type="text" style="width:150px" placeholder="選填"></span></div></div></details>`).join('');
  const body = header() + stepsBar(1) + `<main class="scroll"><div class="wrap">
  ${inputStrip()}
  <section class="card"><div class="cb"><div class="row wrapf gap8"><div class="chips">
    <div class="chip on"><b>IR</b><span class="fn">synthetic-fixture.csv</span><span class="tag">10 標記</span><span class="st-ok">座標來自數值檔</span><button class="btn sm danger" title="移除此光譜">×</button><label class="btn sm gray" style="cursor:pointer">更換<input type="file" hidden></label></div>
    <div class="chip"><b>¹H</b><span class="fn">h1-scan.png</span><span class="tag">4 標記</span><span class="st-w" title="圖片的 x 軸目前用程式預設的 0–12 ppm 推定，不是使用者校正過的">⚠ 預設座標（未校正）</span><button class="btn sm danger" title="移除此光譜">×</button><label class="btn sm gray" style="cursor:pointer">更換<input type="file" hidden></label></div>
    <label class="chip empty" style="cursor:pointer"><b>¹³C</b> ＋ 加入<input type="file" hidden></label>
    <label class="chip empty" style="cursor:pointer"><b>MS</b> ＋ 加入<input type="file" hidden></label>
    <label class="chip empty" style="cursor:pointer"><b>MS/MS</b> ＋ 加入<input type="file" hidden></label>
    <label class="chip empty" style="cursor:pointer"><b>ToF-SIMS</b> ＋ 加入<input type="file" hidden></label></div>
    <span class="grow"></span><label class="sm"><input type="checkbox" checked> 上傳時自動尋峰</label><a class="btn pri" href="02-page2-calibration.html">下一步：第 2 頁 座標校正 →</a></div>
    <p class="hint" style="margin:8px 0 0">點圖上的峰頂或谷底標記；圖片此階段只記錄像素位置，不需要先校正。AI 自動尋峰不會寫入正式證據。</p></div></section>
  <div class="grid2">
    <section class="viewer"><div class="ch"><div class="sq">IR</div><h3>IR · synthetic-fixture.csv</h3><div class="r"><span class="tag b">標記圖譜 ●</span><button class="btn sm">放大</button><button class="btn sm">重置</button></div></div>${irSvg({marks: true})}</section>
    <section class="card"><div class="ch"><div class="sq">≡</div><h3>已標記訊號（IR · 10 筆）</h3><div class="r"><button class="btn sm">自動尋峰</button><button class="btn sm danger">清空</button></div></div>
      <div class="cb"><form class="row gap8" onsubmit="return false"><input type="number" aria-label="位置" placeholder="位置 cm⁻¹" style="width:96px"><input type="number" aria-label="強度" placeholder="強度" style="width:70px"><input type="text" placeholder="備註" style="width:90px"><button class="btn pri sm" type="submit">新增標記</button></form>
      <div style="margin-top:8px">${rows}</div><p class="hint" style="margin:8px 0 0">每筆預設只顯示波數與刪除；點 ▸ 展開基線相對強度、吸收帶形態與備註。</p></div></section>
  </div></div></main>` + devNote(['整頁 6 張光譜卡 → 一排小標籤；未載入的只剩「＋加入」，已載入的才顯示檔名與標記數', '第 1 頁橫幅與步驟列合併：只剩步驟列＋一行說明', '¹H 圖片卡片顯示「預設座標（未校正）」，不再寫「已具備物理座標」', '標記清單：預設只有波數＋刪除，其餘欄位在 ▸ 明細內', '圖上移：輸入證據中心縮成一列']);
  return page('SpecReader 草圖 1 · 第 1 頁 訊號標記', body);
}

// ---------------------------------------------------------------- page 2
function page2() {
  const body = header() + stepsBar(2) + `<main class="scroll"><div class="wrap">
  ${inputStrip()}
  <div class="alert w"><span class="ic">⚠</span><div><b>還有 2 張光譜尚未校正：IR（待校正）、¹H（只有預設座標）。</b> 你可以直接前往第 3 頁；結果頁最上方會標示這件事。<a href="#" class="btn sm" style="margin-left:8px">逐張檢查</a></div></div>
  <div class="row wrapf gap8"><div class="chips"><div class="chip on"><b>IR</b><span class="st-w">⚠ 尚未校正</span></div><div class="chip"><b>¹H</b><span class="st-w">⚠ 預設座標（未校正）</span></div></div><span class="grow"></span><a class="btn" href="01-page1-signal-marking.html">← 返回第 1 頁</a><a class="btn pri" href="03-result-structure.html">下一步：第 3 頁 判讀 →</a></div>
  <div class="grid2">
    <section class="viewer"><div class="ch"><div class="sq">IR</div><h3>IR 原圖 · 校正與基線共用這張圖</h3><div class="r"><span class="tag" style="background:#e0f2fe;color:#075985">藍色虛線＝校正點</span><span class="tag w">黃色圓點＝基線</span></div></div>${irSvg({marks: false, calib: true, baseline: true})}</section>
    <div style="display:flex;flex-direction:column;gap:12px">
      <section class="card"><div class="ch"><div class="sq">①</div><h3>座標校正</h3><div class="r"><span class="tag w">IR ⚠ 尚未校正</span></div></div><div class="cb">
        <p class="sm" style="margin:0 0 8px"><b>做什麼：</b>告訴程式圖上的刻度對應哪個波數（<b>影響峰的位置</b>）。</p>
        <div class="row wrapf gap8" role="radiogroup" aria-label="校正方式">
          <label class="chip on" style="flex-direction:column;align-items:flex-start;gap:2px;flex:1.3"><span><input type="radio" name="m" checked> <b>分段校正（5 點）</b> <span class="tag g">IR 建議</span></span><span class="xs muted">IR 圖的刻度常在中途換比例，不是等距</span></label>
          <label class="chip" style="flex-direction:column;align-items:flex-start;gap:2px;flex:1"><span><input type="radio" name="m"> <b>兩點線性</b></span><span class="xs muted">刻度等距時可用</span></label>
          <label class="chip" style="flex-direction:column;align-items:flex-start;gap:2px;flex:1"><span><input type="radio" name="m"> <b>三點（進階）</b></span><span class="xs muted">檢查是否線性</span></label></div>
        <table style="margin-top:10px"><thead><tr><th>點</th><th>像素 X</th><th>實際刻度 (cm⁻¹)</th><th></th></tr></thead><tbody>
          ${[['A', 120, 3000], ['B', 780, 500], ['C', 440, 1500], ['D', 600, 1000]].map(([k, p, v]) => `<tr><td><b>${k}</b></td><td><input type="number" value="${p}" style="width:70px" aria-label="校正點 ${k} 像素 X"></td><td><input type="number" value="${v}" style="width:80px" aria-label="校正點 ${k} 物理波數"></td><td><button class="btn sm gray">點圖取樣</button></td></tr>`).join('')}</tbody></table>
        <div class="alert i" style="margin-top:10px"><span class="ic">i</span><span>分段校正需要至少 3 個點（A、B 加 1 個以上中間點）。換算依據：分段線性；最大誤差 0.4 cm⁻¹。</span></div>
        <button class="btn pri" style="width:100%;justify-content:center;margin-top:10px;padding:9px">套用分段線性校正並轉換 10 個標記訊號</button>
        <details class="fold" style="margin-top:10px"><summary>換算預覽（10 筆）</summary><div class="in"><table><thead><tr><th>原始像素</th><th>預覽 (cm⁻¹)</th><th>已套用</th></tr></thead><tbody><tr><td class="m">px(128,203)</td><td class="m">3350.0</td><td class="muted">尚未套用</td></tr><tr><td class="m">px(214,257)</td><td class="m">3030.0</td><td class="muted">尚未套用</td></tr><tr><td colspan="3" class="muted">…其餘 8 筆</td></tr></tbody></table></div></details>
      </div></section>
      <section class="card"><div class="ch"><div class="sq">②</div><h3>IR 基線</h3><div class="r"><span class="tag">預覽：尚未套用</span></div></div><div class="cb">
        <p class="sm" style="margin:0 0 8px"><b>做什麼：</b>用 5 個點標出吸收的零點線（<b>只影響強度，不影響峰位</b>）。基線穿過寬 OH／NH 或弱峰可能移除真實吸收，請對照原圖。</p>
        <div class="row wrapf gap8"><label class="sm"><input type="checkbox" checked aria-label="啟用 IR 五點基線"> 使用五點基線</label><label class="sm">吸收方向 <select aria-label="IR 吸收方向"><option>自動辨識</option><option>吸收峰朝下</option><option>吸收峰朝上</option></select></label><label class="sm">原始尺度 <select><option>%T</option><option>吸光度</option><option>未知／相對</option></select></label></div>
        <div class="row wrapf gap8" style="margin-top:8px"><button class="btn sm">重設五點基線</button><button class="btn sm pri">套用 IR 設定</button><button class="btn sm">停用基線</button></div></div></section>
    </div></div></div></main>` + devNote(['「基線」與「校正」拆成 ①②兩張卡，各用一句話說明（影響峰位 vs 只影響強度）', 'IR：分段校正放在最上面、標「IR 建議」；不再藏在進階選項', '每張光譜顯示 ✓已校正／⚠尚未校正／⚠預設座標', '前往第 3 頁只提醒、不攔截', '寶貴的畫布（左）與兩張卡（右）同時看得到，不用往下捲']);
  return page('SpecReader 草圖 2 · 第 2 頁 座標校正', body);
}

// ---------------------------------------------------------------- result pages
const CAND = [
  {rank: 1, f: 'C15H16O2', s: 78, svg: STRUCT.bis, name: '雙酚型（對稱 ×2）', r: ['¹H：4 組訊號全部對上（位移、積分比 2:2:1:3、對位二取代）', 'IR：10 個峰中 8 個與預測一致，1 個不明（3030）、1 個矛盾（560）', '分子式未宣告；由 ¹H（H = 2 × 8）推得'], con: 1},
  {rank: 2, f: 'C7H8O', s: 72, svg: STRUCT.cre, name: '對甲酚', r: ['¹H：1.62 ppm（6H 單峰）不相容 — 甲基只有 3H', 'IR：8/10 個峰與預測一致，1 個矛盾（560）'], con: 2},
  {rank: 3, f: 'C7H8O2', s: 67, svg: STRUCT.mox, name: '4-甲氧基酚', r: ['¹H：7.08 ppm 偏差較大，1.62 ppm 無對應', 'IR：8/10 個峰與預測一致，1 個矛盾（560）'], con: 2},
];

const FG_ROWS = [
  ['酚 O–H', '1 個 IR 峰：3350 cm⁻¹（寬）', '較支持', '伴隨帶 1180–1270、1450–1620 已觀測', ['IR 3350 cm⁻¹｜寬峰｜相容 0.90']],
  ['芳環骨架 C=C', '3 個 IR 峰：1612、1510、1440 cm⁻¹', '較支持', '伴隨帶 1450–1620、3000–3100 已觀測', ['IR 1612 cm⁻¹｜較支持', 'IR 1510 cm⁻¹｜較支持（寬 162）', 'IR 1440 cm⁻¹｜較支持']],
  ['酚 C–O', '2 個 IR 峰：1235、1175 cm⁻¹', '較支持', '伴隨帶 1450–1620、3200–3650 已觀測', ['IR 1235 cm⁻¹｜較支持', 'IR 1175 cm⁻¹｜較支持']],
  ['脂肪族 C–H', '1 個 IR 峰：2965 cm⁻¹', '較支持', '伴隨帶 1350–1470 已觀測', ['IR 2965 cm⁻¹｜較支持']],
  ['芳香 C–H 面外彎曲', '1 個 IR 峰：830 cm⁻¹', '較支持', '伴隨帶 1450–1620 已觀測', ['IR 830 cm⁻¹｜較支持（對位二取代常見）']],
  ['可能分子內氫鍵 OH', '3 個 IR 峰：3350、3030、2965 cm⁻¹', '較支持', '伴隨帶 1610–1735 已觀測', ['…']],
  ['羧酸寬 O–H', '2 個 IR 峰：3030、2965 cm⁻¹', '可能', '伴隨帶 1210–1320 已觀測', ['…']],
  ['醯胺 I C=O', '1 個 IR 峰：1612 cm⁻¹', '可能', '伴隨帶 1500–1650 已觀測', ['…']],
  ['烯烴 C=C', '1 個 IR 峰：1612 cm⁻¹', '可能', '伴隨帶 3020–3100 已觀測', ['…']],
  ['二級胺 N–H', '1 個 IR 峰：3350 cm⁻¹', '證據不足', '只有 1 條伴隨帶（1000–1250），無 N 專屬證據', ['…']],
  ['一級胺 N–H', '1 個 IR 峰：3350 cm⁻¹', '證據不足', '只有 1 條伴隨帶（1550–1650），無 N 專屬證據', ['…']],
  ['OH／NH 可交換氫（¹H）', '1 組 ¹H 訊號：4.75 ppm（br s, 2H）', '可能', '來源：¹H', ['¹H 4.75 ppm｜br s｜2H']],
];
const HIDDEN = [['氫鍵 O–H', 'IR 3350'], ['硝基 NO₂ 伸縮對', 'IR 1510'], ['三級胺 C–N', 'IR 1235、1175'], ['醚 C–O–C', 'IR 1235、1175'], ['C–F 指紋', 'IR 1235、1175'], ['胺 C–N', 'IR 1235、1175'], ['C–Br 指紋', 'IR 560']];

const DIAG = `SpecReader 診斷摘要（v1.2.2 草圖；合成樣本 S1，非真實資料）
產生時間：2026-11-01 14:05｜版本 1.2.2｜分析 #1（結果為目前輸入）

■ 資料檢查
- ¹H：數值檔（座標來自檔案）｜程式無法得知是否已對溶劑殘峰／TMS 校準
- IR：數值檔（座標來自檔案）｜五點基線 v3 已套用
- 溶劑：CDCl₃（使用者宣告）　頻率：400 MHz（使用者宣告）

■ ¹H 峰表與程式的讀法（4 筆）
- 7.08 ppm｜4H｜d（J = 8.6）｜芳香 CH、烯基 CH｜要求等價
- 6.73 ppm｜4H｜d（J = 8.6）｜芳香 CH、烯基 CH｜要求等價
- 4.75 ppm｜2H｜br s｜烯基 CH、接 O 的碳 H、可交換 H（OH／NH）
- 1.62 ppm｜6H｜s｜烷基 H、可交換 H｜單峰規則套用
- 積分最簡比 2 : 2 : 1 : 3；原子清單讀法 k = 1–3

■ IR 帶與校正方式（10 筆）
- 校正方式：數值檔，無需校正；峰：3350（寬）、3030、2965、1612、1510、1440、1235、1175、830、560 cm⁻¹
- 伴隨帶全部可觀測者：酚 O–H、芳環骨架 C=C、酚 C–O、脂肪族 C–H、芳香 C–H 面外彎曲
- IR 證據不足而隱藏的官能基：7 項

■ 分子式表（共 200 個假設；12 個被搜尋、188 個未搜尋）
- #1 C7H8O（k = 1）｜第二輪（含烯基）｜1 個候選｜完整
- #2 C7H8O2｜第一輪｜2 個候選｜未完整（含烯基的讀法尚未執行）
- #3 C8H8O｜第一輪｜1 個候選｜未完整
- #4 C8H8O2｜第一輪｜5 個候選｜未完整
- #24 C15H16O2（k = 2）｜第二輪（含烯基）｜4 個候選｜未完整（時間預算）
- #5 C9H8O 起其餘：未搜尋（k 輪流名額已滿等原因）

■ 搜尋計畫摘要
- 共 12 個分子式被搜尋：9 個只跑第一輪、3 個也跑了第二輪
- O 下限 1（IR 3350 寬帶 → O–H；IR 1235、1175 強 C–O）
- 未搜尋原因：k 輪流名額已滿 38、¹H 清單不可行 76、O 變體超過保留數 21、O 數在 IR 證據範圍之外 53
- 窮舉：未完整（TIME_BUDGET）；取得 13 個有效圖候選

■ 前幾名候選
- #1 C15H16O2｜相容度 78/100｜CC(C)(c1ccc(O)cc1)c1ccc(O)cc1
- #2 C7H8O｜72/100｜Cc1ccc(O)cc1
- #3 C7H8O2｜67/100｜COc1ccc(O)cc1

■ 各規則擋掉的結構數（全部分子式合計）
- 必含子結構「對位二取代苯」：5183　等價（對稱）檢查：5167　烯基檢查：124　芳香原子檢查：4
- 禁含片段「對位短橋（2／3／4 個原子）」：35／37／34　「間位短橋（1／2／3 個原子）」：2／2／3
- 化學合理性規則「過氧 O–O」3、「偶二醇」1、「非環狀半縮醛／半縮酮」1
`;

function resultBody(initial, warn) {
  const dc = warn ? `
  <div class="alert w"><span class="ic">⚠</span><div><b>資料檢查：2 項需要你確認</b>
   <ul><li><b>¹H 尚未校正</b>：圖片座標是程式用圖框推定的 0–12 ppm（<span class="tag w">預設座標</span>），不是你校正過的。位移若有偏差，下方排名可能不可靠。 <a class="btn sm" href="02-page2-calibration.html">回第 2 頁校正 ¹H</a></li>
   <li><b>溶劑未宣告</b>：溶劑殘峰（例如 CDCl₃ 的 7.26 ppm）不會被自動排除；<b>頻率未宣告</b>：程式以 400 MHz 計算。</li></ul></div></div>` :
  `<div class="alert s"><span class="ic">✓</span><div><b>資料檢查：沒有發現需要處理的項目</b></div></div>`;
  const dcList = warn ? `
   <li><span class="m wn">!</span><span><b>¹H 校正</b>：⚠ 預設座標（依圖框推定 0–12 ppm），使用者未校正</span></li>
   <li><span class="m ok">✓</span><span><b>IR 校正</b>：已校正（分段線性，5 點，最大誤差 0.4 cm⁻¹）；基線設定 v3</span></li>
   <li><span class="m wn">!</span><span><b>溶劑</b>：未宣告（Unknown）</span></li>
   <li><span class="m wn">!</span><span><b>頻率</b>：未宣告，程式以 400 MHz 計算</span></li>` : `
   <li><span class="m in">i</span><span><b>¹H 校正</b>：數值檔，座標來自檔案（程式無法得知是否已對溶劑殘峰校準）</span></li>
   <li><span class="m in">i</span><span><b>IR 校正</b>：數值檔，座標來自檔案；基線設定 v3</span></li>
   <li><span class="m ok">✓</span><span><b>溶劑</b>：CDCl₃（使用者宣告）</span></li>
   <li><span class="m ok">✓</span><span><b>頻率</b>：400 MHz（使用者宣告）</span></li>`;
  const dataCheck = `<section class="card" data-testid="data-check"><div class="ch"><div class="sq">✓</div><h3>資料檢查</h3><div class="r"><span class="hint">只讀現有資料，不改任何分析</span></div></div><div class="cb"><ul class="chk">${dcList}</ul></div></section>`;
  const top = CAND.map(c => `<article class="cand ${c.rank === 1 ? 'first' : ''}"><div class="row"><span class="rank">#${c.rank}</span><span class="grow"></span><span class="score" title="未校準的模型相容度，不是正確機率">${c.s}<small> /100</small></span></div>
   <div class="struct">${c.svg}</div><div><b>${c.f}</b> <span class="muted sm">${c.name}</span></div>
   <ul class="reasons">${c.r.map(x => `<li ${/不相容|矛盾|偏差/.test(x) ? '' : ''}>${x}</li>`).join('')}</ul>
   <div class="row gap8"><button class="btn sm" onclick="goTab('evidence')">看證據 →</button><button class="btn sm gray">送入 Mode B</button></div></article>`).join('');
  const warnLine = warn ? `<div class="alert w" style="margin-bottom:10px"><span class="ic">⚠</span><span><b>最重要的警告：</b>¹H 未經校正 — 下列排名可能不可靠，請先確認 ¹H 位移。</span></div>` : `<div class="alert w" style="margin-bottom:10px"><span class="ic">⚠</span><span><b>最重要的警告：</b>窮舉未完整（時間預算用盡）— 清單只是「在目前限制下找到的結構」，不代表所有可能。</span></div>`;
  const structure = `${dataCheck}
  <section class="card" data-testid="conclusion-card"><div class="ch"><div class="sq">★</div><h3>結論</h3><div class="r"><span class="hint">前 3 名候選 · 相容度＝未校準的模型相容度（非機率）</span></div></div><div class="cb">${warnLine}<div class="top3">${top}</div>
   <p class="legend" style="margin:8px 0 0">組成來源：未指定分子式；不以前置猜測限制搜尋。共找到 13 個候選結構，其餘 10 個在下方。</p></div></section>
  <section class="card"><div class="ch"><div class="sq">▤</div><h3>其餘候選結構（10）</h3><div class="r"><span class="hint">依相容度排序</span></div></div><div class="cb">
   <details class="fold"><summary>展開 #4–#13（每個：結構圖、相容度、1 行理由、[看證據]）</summary><div class="in"><p class="hint">（草圖省略）候選卡內的「候選組裝與驗證證據」折疊區仍保留在卡片上。</p></div></details>
   <details class="fold" style="margin-top:8px"><summary>De novo 搜尋狀態與界限</summary><div class="in"><p class="hint">獨立原子／鍵枚舉目前支援中性 C/N/O/F/Cl/Br；資料庫命中不代表答案正確。</p></div></details></div></section>`;

  const fgItems = FG_ROWS.map(([n, peaks, lvl, comp, det]) => `<details class="item"><summary><b>${n}</b><span class="muted">— ${peaks}</span><span class="grow"></span><span class="tag ${lvl === '較支持' ? 'g' : lvl === '證據不足' ? 'w' : ''}">${lvl}</span></summary><div class="in"><div>${comp}</div><ul class="bl">${det.map(d => `<li class="mono xs">${d}</li>`).join('')}</ul><div class="xs muted" style="margin-top:4px">完整觀測 ID：IR:synthetic-fixture.csv:3350 …（展開才看）</div></div></details>`).join('');
  const hid = HIDDEN.map(([n, p]) => `<li><b>${n}</b> <span class="muted">— ${p}（單一孤立峰、無伴隨帶、無其他光譜佐證）</span></li>`).join('');
  const evidence = `
  <section class="card"><div class="ch"><div class="sq">1</div><h3>官能基證據</h3><div class="r"><span class="tag">12 項顯示</span><span class="tag w">7 項隱藏</span></div></div><div class="cb">
   <p class="hint" style="margin:0 0 6px">相同官能基合併成一行；點開看每個峰。「經驗假設，非機率」。單一 IR 峰不能單獨確認官能基，需結合其他光譜或分子式（此提醒只在這裡說一次）。</p>
   ${fgItems}
   <details class="fold" style="margin-top:8px;background:#fffdf5;border-color:var(--amber-line)"><summary style="color:var(--amber-tx)">另有 7 項 IR 證據不足的官能基，已隱藏（點開查看）</summary><div class="in"><p class="hint">判定條件：只有 IR 來源 · 只有 1 個孤立峰 · 沒有任何伴隨帶被觀測到。這是顯示層篩選，資料與分析不變。</p><ul class="bl">${hid}</ul></div></details></div></section>
  <section class="card"><div class="ch"><div class="sq">2</div><h3>分子連結（局部結構假設）證據</h3><div class="r"><span class="tag">11 個局部結構</span></div></div><div class="cb">
   <p class="hint" style="margin:0 0 6px">局部結構是「片段」，不是完整分子；兩片段之間的連結 46 組為「可能」，64 組為「未知」（共享同一個觀測，不可當成兩個獨立片段必須共存）。以下說明只講一次。</p>
   <ul class="bl tight"><li>較支持（4）：對位雙取代芳香環；六碳芳香環局部骨架；可能酚類局部連接；O–H／含氧端點競爭假設</li><li>可能（7）：C=O 兩側連接；C=C 局部骨架（芳香的競爭解釋）；C–O 局部連接（醇／醚）；sp³ 碳環境；sp 三鍵；間位、鄰位芳香環</li></ul>
   <details class="fold" style="margin-top:8px"><summary>明細：11 個局部結構（來源觀測、開放連接點）</summary><div class="in"><table><thead><tr><th>局部結構</th><th>來源觀測</th><th>狀態</th></tr></thead><tbody><tr><td>對位雙取代芳香環</td><td class="mono xs">¹H 7.08、¹H 6.73</td><td><span class="tag g">較支持</span></td></tr><tr><td>六碳芳香環局部骨架</td><td class="mono xs">IR 1612、1510、1440 …</td><td><span class="tag g">較支持</span></td></tr><tr><td colspan="3" class="muted">…其餘 9 個</td></tr></tbody></table></div></details></div></section>
  <section class="card"><div class="ch"><div class="sq">3</div><h3>各候選的支持與矛盾證據</h3><div class="r"><span class="hint">點候選卡上的「看證據」會跳到這裡並展開該候選</span></div></div><div class="cb">
   <p class="hint" style="margin:0 0 6px">所有候選使用同一個評分方法：候選分子圖選出區間／環境知識，與實測峰型、寬度、伴隨峰比較；每個原始峰只計一次。（這句模板話只在這裡出現一次。）</p>
   <details class="fold" open id="cand1"><summary><span class="rank" style="background:#2563eb;color:#fff">#1</span> C15H16O2 <span class="muted">雙酚型</span><span class="grow"></span><span class="score" style="font-size:15px">78<small>/100</small></span></summary><div class="in">
     <ul class="bl"><li><b>IR：</b>10 個峰中 <span class="tag g">8 個與預測一致</span> <span class="tag">1 個不明</span> <span class="tag r">1 個矛盾</span>
        <details class="item" style="margin-left:-18px"><summary class="xs muted" style="padding-left:18px">明細（10 筆）</summary><div class="in"><table><thead><tr><th>觀測</th><th>結果</th><th class="m">相容</th></tr></thead><tbody>
          ${[[3350, '一致', .9], [3030, '不明', .28], [2965, '一致', .84], [1612, '一致', .92], [1510, '一致', .98], [1440, '一致', .85], [1235, '一致', .73], [1175, '一致', .73], [830, '一致', .74], [560, '矛盾', 0]].map(([w, r, c]) => `<tr><td class="mono">IR ${w} cm⁻¹</td><td><span class="tag ${r === '一致' ? 'g' : r === '矛盾' ? 'r' : ''}">${r}</span></td><td class="m">${c.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></details></li>
       <li><b>¹H：</b>4 組訊號中 <span class="tag g">3 組一致</span> <span class="tag">1 組不明（4.75 br s，可交換 H）</span>；環境數與 H 總數吻合（預測 3 種環境／14H，實測 3 組／14H）。</li>
       <li><b>模型相容分：</b>IR 70、¹H 90、整體 78。</li></ul></div></details>
   <details class="fold" style="margin-top:8px"><summary><span class="rank">#2</span> C7H8O <span class="muted">對甲酚</span><span class="grow"></span><span class="score" style="font-size:15px">72<small>/100</small></span></summary><div class="in"><ul class="bl"><li>IR：8 個一致、1 個不明、<span class="tag r">1 個矛盾（560）</span></li><li>¹H：4 組中 3 組一致、<span class="tag r">1 組矛盾（1.62 ppm，6H 單峰 vs 預測 3H）</span></li></ul></div></details>
   <details class="fold" style="margin-top:8px"><summary><span class="rank">#3</span> C7H8O2 <span class="muted">4-甲氧基酚</span><span class="grow"></span><span class="score" style="font-size:15px">67<small>/100</small></span></summary><div class="in"><ul class="bl"><li>…</li></ul></div></details></div></section>
  <section class="card"><div class="ch"><div class="sq">4</div><h3>其他正反證據與提醒</h3></div><div class="cb"><ul class="bl"><li>跨模態共識：已基於目前載入之 IR + ¹H 圖譜完成特徵約束提取。</li><li>尚未載入的光譜（¹³C、MS、MS/MS、ToF-SIMS）不當成反證，但可能影響位置異構物的唯一性判別。</li></ul>
   <details class="fold" style="margin-top:8px"><summary>跨光譜一致性（只列有提供的光譜）</summary><div class="in"><table><thead><tr><th>候選</th><th class="m">IR</th><th class="m">¹H</th><th class="m">綜合</th></tr></thead><tbody><tr><td>#1 C15H16O2</td><td class="m"><span class="tag b">相容 70</span></td><td class="m"><span class="tag g">支持 90</span></td><td class="m"><b>78%</b></td></tr><tr><td>#2 C7H8O</td><td class="m"><span class="tag b">相容 70</span></td><td class="m"><span class="tag b">相容 75</span></td><td class="m"><b>72%</b></td></tr><tr><td>#3 C7H8O2</td><td class="m"><span class="tag b">相容 70</span></td><td class="m"><span class="tag b">相容 63</span></td><td class="m"><b>67%</b></td></tr></tbody></table><p class="hint" style="margin:6px 0 0">未提供：¹³C、MS、MS/MS、ToF-SIMS（不扣分）。數值一律四捨五入到整數。</p></div></details>
   <details class="fold" style="margin-top:8px"><summary>可追溯證據明細（32 筆；證據 ID → 規則 → 影響）</summary><div class="in"><p class="hint">原「4. 可追溯證據推理鏈明細」整張表放這裡，預設收合、不加內部捲軸；每筆的觀測 ID 顯示為「IR 3350 cm⁻¹」。</p></div></details></div></section>`;

  const formulaTab = `
  <section class="card"><div class="ch"><div class="sq">C</div><h3>組成推斷（分子式假設）</h3><div class="r"><span class="tag w">窮舉：未完整</span><span class="tag">200 個假設</span></div></div><div class="cb">
   <details class="fold" open data-testid="composition-panel"><summary data-testid="composition-panel-summary">組成推斷（分子式假設）｜由光譜推斷（假設，非確認）｜200 個分子式假設｜窮舉：未完整（INCOMPLETE）</summary><div class="in">
   <ul class="bl"><li><b>搜尋計畫：</b>共 12 個分子式被搜尋（9 個只跑第一輪，3 個也跑了第二輪）；188 個列出但未搜尋。</li><li><b>O 下限 1：</b>IR 3350 寬帶 → O–H；IR 1235、1175 強 C–O 帶。</li><li><b>未考慮 S；</b>無 N 專屬證據（模糊的 O／N 訊號歸 O）。</li><li><b>未搜尋原因：</b>k 輪流名額已滿 38 · ¹H 清單不可行 76 · O 變體超過保留數 21 · O 數在 IR 範圍之外 53。</li></ul>
   <details class="fold" open style="margin-top:8px" data-testid="composition-hypotheses"><summary>分子式假設（16／200：所有被搜尋的列＋前 4 列未搜尋）</summary><div class="in"><table><thead><tr><th>排序</th><th>分子式</th><th>DBE</th><th>k</th><th>搜尋結果</th></tr></thead><tbody>
    ${[[1, 'C7H8O', 4, 1, '第二輪（含烯基）｜1 個候選｜完整'], [2, 'C7H8O2', 4, 1, '第一輪｜2 個候選｜未完整'], [3, 'C8H8O', 5, 1, '第一輪｜1 個候選｜未完整'], [4, 'C8H8O2', 5, 1, '第一輪｜5 個候選｜未完整'], [24, 'C15H16O2', 8, 2, '第二輪（含烯基）｜4 個候選｜未完整（時間預算）'], [5, 'C9H8O', 6, 1, '未搜尋（k 輪流名額已滿）']].map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</tbody></table><p class="hint" style="margin:6px 0 0">相對信心未校準，只表示假設之間的比較，不是機率。（草圖只畫其中 6 列。）</p><button class="btn sm" style="margin-top:6px">展開全部 200 個</button></div></details>
   <details class="fold" style="margin-top:8px"><summary>由 ¹H 推得的原子清單（4 組訊號）</summary><div class="in"><table><thead><tr><th>δ (ppm)</th><th>積分</th><th>最簡比</th><th>多重性</th><th>位移類別</th></tr></thead><tbody><tr><td class="mono">7.08</td><td>4</td><td>2</td><td>d</td><td>芳香 CH、烯基 CH</td></tr><tr><td class="mono">6.73</td><td>4</td><td>2</td><td>d</td><td>芳香 CH、烯基 CH</td></tr><tr><td class="mono">4.75</td><td>2</td><td>1</td><td>br s</td><td>可交換 H（OH／NH）等</td></tr><tr><td class="mono">1.62</td><td>6</td><td>3</td><td>s</td><td>烷基 H</td></tr></tbody></table></div></details>
   <details class="fold" style="margin-top:8px"><summary>實際套用的約束與被擋掉的結構數</summary><div class="in"><ul class="bl"><li>必含子結構：對位二取代苯（依據 ¹H 7.08、6.73）</li><li>被擋掉：必含子結構 5183、等價（對稱）檢查 5167、烯基 124、芳香原子 4、禁含片段（對位短橋 106、間位短橋 7）、合理性規則 5</li></ul></div></details>
   <details class="fold" style="margin-top:8px" open data-testid="composition-limitations"><summary>限制</summary><div class="in"><ul class="bl"><li>分子式是假設，不是確認；使用者分子式永遠優先並作為硬限制。</li><li>相對信心沒有校準。</li><li>窮舉完整性只相對於目前的分子式、片段讀法與禁止規則。</li></ul></div></details>
   </div></details></div></section>`;

  const inputTab = `
  <section class="card"><div class="ch"><div class="sq">IR</div><h3>IR · synthetic-fixture.csv</h3><div class="r"><span class="tag ${warn ? '' : ''}">數值檔 · 座標來自檔案</span><a class="btn sm" href="02-page2-calibration.html">到第 2 頁調整</a></div></div><div class="cb"><ul class="bl tight"><li>10 個標記；校正：無需（數值檔）；五點基線 v3 已套用</li></ul>
   <details class="fold" style="margin-top:8px"><summary>峰表（10 筆）</summary><div class="in"><table><thead><tr><th>位置</th><th>基線相對強度</th><th>形態</th></tr></thead><tbody><tr><td class="mono">3350</td><td class="mono">0.75</td><td>寬峰</td></tr><tr><td class="mono">3030</td><td class="mono">0.16</td><td>未判定</td></tr><tr><td colspan="3" class="muted">…其餘 8 筆</td></tr></tbody></table></div></details></div></section>
  <section class="card"><div class="ch"><div class="sq">¹H</div><h3>¹H NMR · ${warn ? 'h1-scan.png' : 'synthetic-fixture.csv'}</h3><div class="r">${warn ? '<span class="tag w">⚠ 預設座標（未校正）</span>' : '<span class="tag">數值檔 · 座標來自檔案</span>'}<a class="btn sm" href="02-page2-calibration.html">到第 2 頁校正</a></div></div><div class="cb"><ul class="bl tight"><li>溶劑：${warn ? '<span class="tag w">未宣告</span>' : 'CDCl₃'}　頻率：${warn ? '<span class="tag w">未宣告（程式以 400 MHz 計算）</span>' : '400 MHz'}</li><li>4 個標記</li></ul>
   <details class="fold" style="margin-top:8px"><summary>峰表（4 筆）</summary><div class="in"><table><thead><tr><th>δ ppm</th><th>積分</th><th>多重性／J</th></tr></thead><tbody><tr><td class="mono">7.08</td><td>4</td><td>d, 8.6 Hz</td></tr><tr><td class="mono">6.73</td><td>4</td><td>d, 8.6 Hz</td></tr><tr><td class="mono">4.75</td><td>2</td><td>br s</td></tr><tr><td class="mono">1.62</td><td>6</td><td>s</td></tr></tbody></table></div></details></div></section>
  <section class="card"><div class="ch"><div class="sq">⚙</div><h3>校正摘要</h3></div><div class="cb"><ul class="bl tight"><li>IR：${warn ? '分段線性，5 點，最大誤差 0.4 cm⁻¹' : '數值檔，無需校正'}</li><li>¹H：${warn ? '<b>預設座標（未校正）</b>' : '數值檔，無需校正'}</li><li>未提供：¹³C、MS、MS/MS、ToF-SIMS</li></ul></div></section>`;

  const diagTab = `
  <section class="card"><div class="ch"><div class="sq">✎</div><h3>複製診斷摘要</h3><div class="r"><button class="btn pri" id="copy">複製診斷摘要</button></div></div><div class="cb">
   <p class="hint" style="margin:0 0 8px">純文字、條列；貼給規劃者或存檔即可。不含使用者的原始圖譜或檔案內容，只含上面這些設定與數字。</p><pre class="pre" id="diag">${esc(DIAG)}</pre></div></section>
  <section class="card"><div class="ch"><div class="sq">⬇</div><h3>匯出</h3></div><div class="cb"><div class="row wrapf gap8"><button class="btn" onclick="document.getElementById('exp').showModal()">開啟匯出視窗（Markdown 預覽）</button><button class="btn">複製 Markdown 報告</button><button class="btn">下載完整 JSON 證據包</button><button class="btn">列印報告</button></div></div></section>
  <section class="card"><div class="ch"><div class="sq">6</div><h3>分析過程（六步驟推理）</h3></div><div class="cb"><ol class="bl"><li>collectObservedEvidence — 14 個實際觀測；精度未知保留 null</li><li>generateChemicalHypotheses — 35 個競爭環境／耦合假設</li><li>inferLocalStructures — 11 個局部圖</li><li>searchMolecularGraphs — 已展開 29,892,583 狀態；TIME_BUDGET</li><li>ChemicalHardConstraintValidator + scoreScientificEvidence — 13 個候選通過硬限制</li><li>StructureRenderer2D + ReasoningPanel — 由完整 SMILES 生成 2D 圖</li></ol></div></section>`;

  const tabs = [['structure', '結構', '3', ''], ['evidence', '證據', '', ''], ['formula', '分子式與搜尋', '200', ''], ['input', '輸入與校正', warn ? '⚠ 1' : '', warn ? 'w' : ''], ['diag', '診斷', '', '']];
  const sub = `<div class="subbar" data-testid="analysis-control"><div class="ctl"><button class="btn pri">▶ 開始分析</button><span class="st" role="status">分析完成（使用已保存輸入快照）· 13 個候選</span></div>
   <div class="tabs" role="tablist">${tabs.map(([id, n, c, cls]) => `<button class="tab" role="tab" id="t-${id}" aria-selected="${id === initial}" aria-controls="p-${id}" onclick="goTab('${id}')">${n}${c ? `<span class="c ${cls}">${c}</span>` : ''}</button>`).join('')}</div></div>`;
  const panels = [['structure', structure], ['evidence', evidence], ['formula', formulaTab], ['input', inputTab], ['diag', diagTab]].map(([id, html]) => `<div id="p-${id}" role="tabpanel" aria-labelledby="t-${id}" ${id === initial ? '' : 'hidden'} style="display:${id === initial ? 'flex' : 'none'};flex-direction:column;gap:12px">${html}</div>`).join('');
  return header() + stepsBar(3, warn) + sub + `<main class="scroll" id="sc"><div class="wrap">${inputStrip('')}${panels}</div></main>`;
}
const resultScripts = `
function goTab(id){document.querySelectorAll('[role=tabpanel]').forEach(p=>{const on=p.id==='p-'+id;p.hidden=!on;p.style.display=on?'flex':'none'});
 document.querySelectorAll('[role=tab]').forEach(t=>t.setAttribute('aria-selected',t.id==='t-'+id));document.getElementById('sc').scrollTop=0;}
document.getElementById('copy')&&document.getElementById('copy').addEventListener('click',async()=>{const t=document.getElementById('diag').textContent;
 try{await navigator.clipboard.writeText(t);toast('已複製診斷摘要（'+t.split('\\n').length+' 行）')}catch(e){const r=document.createRange();r.selectNodeContents(document.getElementById('diag'));const s=getSelection();s.removeAllRanges();s.addRange(r);toast('請按 Ctrl+C 複製（瀏覽器不允許自動複製）')}});
`;
function resultPage(title, initial, warn, notes) {
  return page(title, resultBody(initial, warn) + devNote(notes), resultScripts);
}

// ---------------------------------------------------------------- index
const index = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>SpecReader v1.2.2 介面草圖</title><style>${CSS}body{padding:32px}</style></head><body><div style="max-width:760px;margin:0 auto">
<div class="brand" style="margin-bottom:16px"><img src="data:image/png;base64,${logo}" alt=""><div><h1>Spec<b>Reader</b> <span class="ver">v1.2.2 草圖</span></h1><div class="sub">雙擊任一檔案即可開啟；不需要 dev server、不需要網路。資料全部是合成樣本（tests/fixtures/v121/S1）。</div></div></div>
<div class="card"><div class="cb"><ol class="bl" style="line-height:2">
<li><a href="01-page1-signal-marking.html">第 1 頁 訊號標記</a></li><li><a href="02-page2-calibration.html">第 2 頁 座標校正</a></li>
<li><a href="03-result-structure.html">結果頁 · 結構（資料檢查橫條＋結論卡）</a></li><li><a href="04-result-evidence.html">結果頁 · 證據（合併顯示、IR 證據不足隱藏列）</a></li>
<li><a href="05-result-diagnosis.html">結果頁 · 診斷（複製診斷摘要）</a></li><li><a href="06-result-datacheck-warning.html">結果頁 · 資料檢查有警告（未校正）</a></li>
<li><a href="07-result-formula-search.html">結果頁 · 分子式與搜尋（補充）</a></li><li><a href="08-result-input-calibration.html">結果頁 · 輸入與校正（補充）</a></li></ol>
<p class="hint">建議用 1280×720 與 1920×1080 兩種視窗大小各看一次。標題列與分頁列固定在上方，只有中間內容區捲動（右側有一直可見的捲軸）。左下角「草圖說明」可展開每張圖的重點。</p></div></div></div></body></html>`;

// ---------------------------------------------------------------- write
const files = {
  '01-page1-signal-marking.html': page1(),
  '02-page2-calibration.html': page2(),
  '03-result-structure.html': resultPage('SpecReader 草圖 3 · 結果頁 結構', 'structure', false, ['固定在上方：標題列、步驟列、分析列＋分頁列；只有中間捲動', '最上方「資料檢查」橫條；其下「結論卡」（前 3 名、整數相容度、1–3 行理由、最重要的警告）', '預設只展開結論卡；其餘候選收合', '候選卡上的「看證據 →」直接跳到證據分頁']),
  '04-result-evidence.html': resultPage('SpecReader 草圖 4 · 結果頁 證據', 'evidence', false, ['同一官能基合併成一行；點開看每個峰（觀測 ID 顯示為「IR 3350 cm⁻¹」）', '琥珀色列：IR 證據不足的官能基預設隱藏，點開才看', '重複模板話（例如「單一峰不可斷言」「每原始峰只計一次」）每類只講一次', '「看證據」會展開對應候選（此例：#1 已展開）']),
  '05-result-diagnosis.html': resultPage('SpecReader 草圖 5 · 結果頁 診斷', 'diag', false, ['「複製診斷摘要」一鍵複製純文字條列（預覽在下方）', '匯出 JSON／Markdown／列印都在這一頁，頂端「匯出報告」仍保留', '六步驟推理放在這裡（分析中則顯示在分析列）']),
  '06-result-datacheck-warning.html': resultPage('SpecReader 草圖 6 · 資料檢查有警告', 'structure', true, ['¹H 只有程式預設座標（沒有使用者校正）→ 琥珀色橫條', '同一個警告也出現在：步驟列「第 3 頁 ⚠」、「輸入與校正」分頁徽章、結論卡的「最重要警告」', '溶劑、頻率未宣告也一併列出', '提醒不攔截：仍可照常檢視結果']),
  '07-result-formula-search.html': resultPage('SpecReader 草圖 7 · 結果頁 分子式與搜尋', 'formula', false, ['原 CompositionPanel 整塊搬到這個分頁；內部 data-testid 與 <details> 結構不變', '假設表預設只列「所有被搜尋的列＋前 4 列未搜尋」，其餘按鈕展開，不使用內部捲軸']),
  '08-result-input-calibration.html': resultPage('SpecReader 草圖 8 · 結果頁 輸入與校正', 'input', true, ['峰表、溶劑、頻率、校正摘要集中在這裡', '空欄位（未載入的光譜）合併成一行「未提供」']),
  'index.html': index,
};
for (const [name, html] of Object.entries(files)) fs.writeFileSync(path.join(out, name), html);
console.log('wrote', Object.keys(files).length, 'files to', out);
