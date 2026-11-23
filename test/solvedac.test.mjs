import test from 'node:test';
import assert from 'node:assert/strict';
import { baekjoonDifficulty, tierName } from '../lib/solvedac.mjs';

const credentials = { clientId: 'example-client-id', clientSecret: 'example-client-secret' };
const judges = { judges: [{ id: 'boj', homepageUrl: 'https://www.acmicpc.net/', prefix: '', idDigits: 0 }] };
const problem = (problemId = '1000', level = 1) => ({ problemId: 1000, level, judgeIds: [{ ojId: 'boj', problemId, subId: '' }] });

function fixture(result = { problems: [problem()] }) {
  const calls = [], warnings = [];
  const difficultyFor = baekjoonDifficulty({ ...credentials, warn: message => warnings.push(message), fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(url.endsWith('/judges') ? judges : result);
  } });
  return { calls, warnings, difficultyFor };
}

test('solved.ac levels include Unrated and the Bronze through Ruby boundaries', () => {
  assert.deepEqual([0, 1, 5, 6, 10, 11, 16, 21, 26, 30].map(tierName),
    ['Unrated', 'Bronze V', 'Bronze I', 'Silver V', 'Silver I', 'Gold V', 'Platinum V', 'Diamond V', 'Ruby V', 'Ruby I']);
  for (const value of [-1, 31, 1.5, '1', null]) assert.equal(tierName(value), null);
});

test('public v4 requests send only app authentication and reuse the result within a run', async () => {
  const { calls, difficultyFor } = fixture();
  assert.deepEqual(await Promise.all([difficultyFor('1000'), difficultyFor('1000')]), ['Bronze V', 'Bronze V']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, '/api/v4/judges');
  assert.equal(calls[1].url.pathname, '/api/v4/problems');
  assert.equal(calls[1].url.searchParams.get('q'), 'id:1000');
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://solved.ac');
    assert.deepEqual(options.headers, { Accept: 'application/json', 'x-client-id': credentials.clientId, 'x-client-secret': credentials.clientSecret });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
  }
});

test('native judge IDs select the grade even when solved.ac uses a different canonical number', async () => {
  const { difficultyFor } = fixture({ problems: [{ ...problem('28955', 11), problemId: 19759 }] });
  assert.equal(await difficultyFor('28955'), 'Gold V');
});

test('missing credentials never make a network request', async () => {
  let calls = 0;
  for (const client of [{}, { clientId: 'id' }, { clientSecret: 'secret' }]) {
    const lookup = baekjoonDifficulty({ ...client, fetchImpl: async () => { calls++; } });
    assert.equal(await lookup('1000'), null);
  }
  assert.equal(calls, 0);
});

test('unmatched, ambiguous, invalid and unrated results are handled separately', async () => {
  for (const result of [{ problems: [] }, { problems: [problem('1001')] },
    { problems: [{ ...problem(), judgeIds: [{ ojId: 'other', problemId: '1000' }] }] },
    { problems: [problem(), problem()] }, { problems: [problem('1000', 31)] },
    { problems: [problem()], diagnostics: [{ severity: 'error' }] }, {}]) {
    const { difficultyFor } = fixture(result);
    assert.equal(await difficultyFor('1000'), null);
  }
  assert.equal(await fixture({ problems: [problem('1000', 0)] }).difficultyFor('1000'), 'Unrated');
});

test('HTTP failures stop further requests for this run without exposing credentials', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const warnings = [];
    const lookup = baekjoonDifficulty({ ...credentials, warn: message => warnings.push(message), fetchImpl: async url => {
      calls++; return url.endsWith('/judges') ? Response.json(judges) : new Response('private provider error', { status });
    } });
    assert.equal(await lookup('1000'), null);
    assert.equal(await lookup('1001'), null);
    assert.equal(calls, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], new RegExp(`HTTP ${status}`));
    assert.ok(!warnings[0].includes(credentials.clientSecret));
    assert.doesNotMatch(warnings[0], /private provider error/);
  }
});

test('network and malformed JSON failures leave the caller free to keep the previous grade', async () => {
  for (const response of [async () => { throw new Error(credentials.clientSecret); }, async () => new Response('<html>failure</html>')]) {
    const warnings = [];
    const lookup = baekjoonDifficulty({ ...credentials, fetchImpl: response, warn: message => warnings.push(message) });
    assert.equal(await lookup('1000'), null);
    assert.equal(await lookup('1001'), null);
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0].includes(credentials.clientSecret));
  }
});
