// loop / check / read 共通のページ層：bsk 呼び出し、observe、probe、送信前の門禁（privacy.md 参照）。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_TOKENS = 6000; // observe のソフト上限（Jev 入力は安価だが遅延に効く）

// 機密サイト：ホスト名のラベル単位で照合（privacy.md 参照）
export const SENSITIVE_HOST = /(^|[.-])(bank|banking|ginko|shinkin|jabank|smbc|mufg|mizuho|resona|securities|shoken|nenkin|mynumber|myna|e-?tax|hospital|clinic|medical|kenpo|login|signin|auth|sso|accounts?|id|passport|wallet|pay)([.-]|$)/i;
export const INTRANET_HOST = /^(localhost|0\.0\.0\.0|\[.*\]|10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|[^.]+)$|\.(localhost|local|internal|intranet|corp|lan|home\.arpa)$/i;

// 必ず execFileSync + 配列引数（文字列連結は cmd のクォートで壊れる）
export function bsk(args) {
  try {
    const out = execFileSync('bsk', [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return out.trim() ? JSON.parse(out) : {};
  } catch (e) {
    let msg = (e.stdout || e.stderr || e.message || '').toString().trim();
    try { msg = JSON.parse(msg).message ?? msg; } catch {}
    throw new Error(`bsk ${args[0]} failed: ${msg}`);
  }
}

export function assertSession(sid) {
  if (!JSON.stringify(bsk(['session', 'list'])).includes(`"${sid}"`)) throw new Error(`session ${sid} is not active`);
}

// 読み込み・遷移中は "Document changed during observation" / "document identity changed" になるので最大 3 回まで取り直す
export async function observe(sid) {
  for (let i = 0; ; i++) {
    try {
      return bsk(['observe', '--session', sid, '--max-tokens', String(MAX_TOKENS)]).text ?? '';
    } catch (e) {
      if (i >= 3 || !/changed during observation|document identity changed/i.test(e.message)) throw e;
      await new Promise((res) => setTimeout(res, 500));
    }
  }
}

// 1 回の evaluate で URL・タイトル・パスワード欄・期待テキスト・<select>／テキスト入力欄の一覧をまとめて取る。
// 入力欄は VOM に出ないことがある（Yahoo!路線の出発/到着、PyPI 検索など）ため DOM から拾い、data-jfi で指す
export function probe(sid, { expectText = null, fullText = false } = {}) {
  const expr = `(()=>{const vis=e=>e.checkVisibility?e.checkVisibility():true;
const sel=[...document.querySelectorAll('select')].filter(e=>!e.disabled&&vis(e));
const txt=[...document.querySelectorAll('input,textarea')].filter(e=>(e.tagName==='TEXTAREA'||['text','search','email','tel','url','number'].includes(e.type))&&!e.disabled&&!e.readOnly&&vis(e));
const lab=e=>{const l=e.labels&&e.labels[0];return l?l.innerText:''};
return JSON.stringify({url:location.href,title:document.title,
password:[...document.querySelectorAll('input[type=password]')].some(vis),
text:${expectText === null ? 'null' : `(document.body?.innerText||'').includes(${JSON.stringify(expectText)})`},
full:${fullText ? `(document.body?.innerText||'')` : 'null'},
selects:sel.map((e,i)=>{e.dataset.jfl=String(i);return{i,label:(e.getAttribute('aria-label')||(()=>{const l=e.labels&&e.labels[0];if(!l)return'';const c=l.cloneNode(true);c.querySelectorAll('select').forEach(x=>x.remove());return c.textContent})()||e.name||'').trim(),
current:e.selectedOptions[0]?.label||'',options:[...e.options].filter(o=>!o.disabled).map(o=>({value:o.value,label:o.label}))}}),
inputs:txt.map((e,i)=>{e.dataset.jfi=String(i);return{i,label:(e.getAttribute('aria-label')||lab(e)||e.placeholder||e.title||'').trim(),name:e.name||'',
hints:[e.placeholder,e.id,e.getAttribute('autocomplete')].filter(Boolean).join(' '),
context:(e.closest('dl,fieldset,tr,li,form')?.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400),value:e.value}})})})()`;
  return JSON.parse(bsk(['evaluate', '--session', sid, expr]).value);
}

// Jev の入力上限対策：要素ごとに付く長い [ctx: …] を短くする（通販サイトでは数百字×要素数になる）
export const trimCtx = (s) => s.replace(/\[ctx: ([^\]]*)\]/g, (m, c) => (c.length > 60 ? `[ctx: ${c.slice(0, 60)}…]` : m));

export const siteOf = (host) => host.replace(/^www\./, '');

export function hostGate(url, base, { allowHosts = new Set(), allowOriginExit = false } = {}) {
  let u;
  try { u = new URL(url); } catch { return `unparseable URL`; }
  if (!/^https?:$/.test(u.protocol)) return `non-http page (${u.protocol})`;
  const h = u.hostname.toLowerCase();
  if (!allowHosts.has(h) && (SENSITIVE_HOST.test(h.replace(/\.[^.]+$/, '')) || INTRANET_HOST.test(h))) return `sensitive_site: ${h} (see references/privacy.md)`;
  if (base && !allowOriginExit && !(h === base || h.endsWith('.' + base))) return `origin_exit: left ${base} for ${h}`;
  return null;
}

// 送信前の門禁の統一入口：ページ内容を Jev に送る前に必ず通す
export function pageGate(page, base, opts) {
  return hostGate(page.url, base, opts) ?? (page.password ? 'credential_page: a password field is visible; a person must sign in' : null);
}

// 目標質問の上位候補を、主モデルがそのまま bsk に渡せる形にする
export function toCandidates(kind, top, { elements = [], inputs = [], selects = [] }) {
  const p3 = (p) => Math.round(p * 1000) / 1000;
  return top.map(([id, p]) => {
    if (kind === 'click') return { op: 'click', target: '@' + id, label: elements.find((e) => e.ref === id)?.name ?? '', p: p3(p) };
    if (kind === 'fill') {
      const x = inputs[Number(id.slice(1))];
      return { op: 'fill', target: `[data-jfi="${x.i}"]`, label: x.label || x.name, p: p3(p) };
    }
    const [i, j] = id.slice(1).split(':').map(Number);
    const s = selects.find((x) => x.i === i);
    return { op: 'select', target: `[data-jfl="${i}"]`, value: s.options[j].value, label: `${s.label} -> ${s.options[j].label}`, p: p3(p) };
  });
}

// cp932 コンソール対策：stdout は非 ASCII を \uXXXX にエスケープ
export function printLine(obj) {
  console.log(JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
}

// 直接実行されたスクリプトかどうか（テストから import されたときは main を走らせない）
export const isMain = (metaUrl) => Boolean(process.argv[1]) && metaUrl.toLowerCase() === pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase();
