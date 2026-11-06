// オフラインテスト（ネットワーク・API キー・bsk 不要）：node --test test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topChoices } from '../scripts/jev.mjs';
import { pageGate, toCandidates } from '../scripts/page.mjs';
import { verdictOf } from '../scripts/check.mjs';
import { chunkText, batchBlocks, pickBlocks } from '../scripts/read.mjs';

test('chunkText: 行を 1000 字まで束ね、長い行は硬切り、空行は捨てる', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i} `.padEnd(100, 'x'));
  const blocks = chunkText(lines.join('\n\n'));
  assert.ok(blocks.every((b) => b.length <= 1000));
  assert.equal(blocks.join('\n').split('\n').length, 30);
  assert.deepEqual(chunkText('a'.repeat(2500)).map((b) => b.length), [1000, 1000, 500]);
  assert.deepEqual(chunkText('\n\n  \n'), []);
});

test('batchBlocks: 1 バッチ 12000 字以内、順序維持', () => {
  const blocks = Array.from({ length: 30 }, () => 'x'.repeat(1000));
  const batches = batchBlocks(blocks);
  assert.ok(batches.every((b) => b.length <= 12));
  assert.deepEqual(batches.flat(), blocks.map((_, i) => i));
});

test('pickBlocks: 閾値・失敗バッチ保留・予算・文書順・dropped 表記', () => {
  const blocks = ['A', 'B', 'C', 'D', 'E'];
  const r = pickBlocks(blocks, [0.9, 0.1, 0.2, null, 0.5], 10_000);
  assert.equal(r.text, 'A\n[… 2 blocks dropped …]\nD\nE');
  assert.equal(r.kept, 3);
  const big = ['x'.repeat(500), 'y'.repeat(500), 'z'.repeat(500)];
  const b = pickBlocks(big, [0.4, 0.9, 0.6], 1200);
  assert.equal(b.text, `[… 1 blocks dropped …]\n${'y'.repeat(500)}\n${'z'.repeat(500)}`);
  assert.ok(b.text.length <= 1200);
});

test('topChoices: 降順で n 件', () => {
  assert.deepEqual(topChoices({ probabilities: { a: 0.1, b: 0.6, c: 0.3 } }, 2), [['b', 0.6], ['c', 0.3]]);
});

test('verdictOf: 境界は等号込み', () => {
  assert.equal(verdictOf(0.85), 'yes');
  assert.equal(verdictOf(0.15), 'no');
  assert.equal(verdictOf(0.5), 'unsure');
});

test('toCandidates: click / fill / select を bsk にそのまま渡せる形に', () => {
  const ctx = {
    elements: [{ ref: 'e3', name: 'Next' }],
    inputs: [{ i: 0, label: 'Email', name: 'email' }],
    selects: [{ i: 1, label: 'Size', options: [{ value: 'v1', label: 'S' }, { value: 'v1b', label: 'M' }, { value: 'v2', label: 'L' }] }],
  };
  assert.deepEqual(toCandidates('click', [['e3', 0.4]], ctx), [{ op: 'click', target: '@e3', label: 'Next', p: 0.4 }]);
  assert.deepEqual(toCandidates('fill', [['i0', 0.3]], ctx), [{ op: 'fill', target: '[data-jfi="0"]', label: 'Email', p: 0.3 }]);
  assert.deepEqual(toCandidates('select', [['s1:2', 0.25]], ctx), [{ op: 'select', target: '[data-jfl="1"]', value: 'v2', label: 'Size -> L', p: 0.25 }]);
});

test('pageGate: 敏感サイト・内網・非 http・パスワード欄、allowHosts はパスワード欄を免除しない', () => {
  assert.equal(pageGate({ url: 'https://example.com', password: false }, null), null);
  assert.equal(pageGate({ url: 'https://mybank.example.co.jp', password: false }, null), null); // ラベル単位：mybank は bank 段ではない
  assert.match(pageGate({ url: 'https://bank.example.co.jp', password: false }, null), /^sensitive_site/);
  assert.match(pageGate({ url: 'http://localhost:3000', password: false }, null), /^sensitive_site/);
  assert.match(pageGate({ url: 'chrome://settings', password: false }, null), /^non-http/);
  assert.match(pageGate({ url: 'https://example.com', password: true }, null), /^credential_page/);
  const allow = { allowHosts: new Set(['bank.example.co.jp']) };
  assert.equal(pageGate({ url: 'https://bank.example.co.jp', password: false }, null, allow), null);
  assert.match(pageGate({ url: 'https://bank.example.co.jp', password: true }, null, allow), /^credential_page/);
});
