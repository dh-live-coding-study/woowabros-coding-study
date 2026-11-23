import test from 'node:test';
import assert from 'node:assert/strict';
import { officialCategories, programmersProblemInfo } from '../lib/programmers-info.mjs';

const page = category => `<ol class="breadcrumb"><li><a href="/learn/challenges">코딩테스트 연습</a></li>
<li><a href="/learn/courses/30/parts/17042">${category}</a></li><li class="active">문제 제목</li></ol>`;

test('official problem categories come from breadcrumbs, not the query or problem text', () => {
  assert.deepEqual(officialCategories(page('SELECT') + '<p>GROUP BY와 OUTER JOIN을 쓸 수도 있습니다.</p>'), ['SELECT']);
  assert.deepEqual(officialCategories(page('JOIN')), ['JOIN']);
  assert.deepEqual(officialCategories(page('String, Date')), ['String, Date']);
  assert.deepEqual(officialCategories(page('깊이/너비 우선 탐색(DFS/BFS)')), ['DFS', 'BFS']);
  assert.deepEqual(officialCategories('<ol class="breadcrumb"><li><a href="/learn/challenges/training">코딩 기초 트레이닝</a></li></ol>'), []);
  assert.equal(officialCategories('<html>일시적인 오류</html>'), null);
});

test('public problem metadata is fetched once without GitHub or solved.ac credentials', async () => {
  const calls = [];
  const lookup = programmersProblemInfo({ fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(page('GROUP BY')); } });
  assert.deepEqual(await Promise.all([lookup('131536'), lookup('131536')]), [{ categories: ['GROUP BY'] }, { categories: ['GROUP BY'] }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://school.programmers.co.kr/learn/courses/30/lessons/131536');
  assert.deepEqual(calls[0].options.headers, { Accept: 'text/html' });
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(await lookup('../settings'), null);
  assert.equal(calls.length, 1);
});

test('HTTP, network and markup failures preserve the caller fallback without repeated requests', async () => {
  for (const fetchResult of [async () => new Response('denied', { status: 403 }), async () => { throw new Error('network detail'); }, async () => new Response('<html>login</html>')]) {
    let calls = 0;
    const warnings = [];
    const lookup = programmersProblemInfo({ fetchImpl: async (...args) => { calls++; return fetchResult(...args); }, warn: message => warnings.push(message) });
    assert.equal(await lookup('131536'), null); assert.equal(await lookup('131537'), null);
    assert.equal(calls, 1); assert.equal(warnings.length, 1);
    assert.doesNotMatch(warnings[0], /network detail|denied/);
  }
});
