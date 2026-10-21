import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadScript(globals = {}) {
  const code = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
  const context = vm.createContext({ JSON, Object, console, ...globals });
  vm.runInContext(code, context);
  return context;
}

const thread = (subject, from) => {
  const labels = [];
  return {
    labels,
    getMessages: () => [{ getSubject: () => subject, getFrom: () => from }],
    addLabel: (l) => labels.push(l),
  };
};

test('検索条件：通知済みを除き、送信元と件名を指定する', () => {
  const ctx = loadScript();
  assert.equal(
    ctx.buildQuery({ name: 'x', from: 'order@example-shop.test', subject: '注文' }),
    '-label:通知済み newer_than:1d from:order@example-shop.test subject:注文',
  );
  assert.equal(ctx.buildQuery({ name: 'y', from: '', subject: '請求書' }), '-label:通知済み newer_than:1d subject:請求書');
});

test('通知文：ルール名・件名・送信元が入る', () => {
  const ctx = loadScript();
  const text = ctx.buildMessage({ name: '注文メール' }, thread('【注文】10月分', 'order@example-shop.test'));
  assert.equal(text, '【注文メール】\n件名：【注文】10月分\n送信元：order@example-shop.test');
});

test('checkMail：該当スレッドを通知し、ラベルを付け、件数を返す', () => {
  const sent = [];
  const t1 = thread('注文のご連絡', 'order@example-shop.test');
  const t2 = thread('請求書送付のお知らせ', 'billing@example-corp.test');
  const queries = [];
  const label = { name: '通知済み' };
  const ctx = loadScript({
    GmailApp: {
      getUserLabelByName: () => null,
      createLabel: () => label,
      search: (q) => {
        queries.push(q);
        return q.includes('subject:注文') ? [t1] : [t2];
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => ({ SLACK_WEBHOOK_URL: 'https://hooks.example.test/x' })[k] || null,
      }),
    },
    UrlFetchApp: { fetch: (url, opts) => sent.push({ url, body: JSON.parse(opts.payload) }) },
  });
  assert.equal(ctx.checkMail(), 2);
  assert.equal(queries.length, 2);
  assert.deepEqual(t1.labels, [label]);
  assert.deepEqual(t2.labels, [label]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, 'https://hooks.example.test/x');
  assert.ok(sent[0].body.text.includes('注文メール'));
});

test('LINEの設定があれば、LINEにも送る（トークンはヘッダーに入る）', () => {
  const sent = [];
  const ctx = loadScript({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => ({ LINE_CHANNEL_TOKEN: 'dummy-token', LINE_USER_ID: 'Udummy' })[k] || null,
      }),
    },
    UrlFetchApp: { fetch: (url, opts) => sent.push({ url, opts }) },
  });
  ctx.notify('テスト通知');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.line.me/v2/bot/message/push');
  assert.equal(sent[0].opts.headers.Authorization, 'Bearer dummy-token');
  assert.deepEqual(JSON.parse(sent[0].opts.payload), { to: 'Udummy', messages: [{ type: 'text', text: 'テスト通知' }] });
});

test('通知先が未設定なら、何も送らない', () => {
  const sent = [];
  const ctx = loadScript({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    UrlFetchApp: { fetch: () => sent.push(1) },
  });
  ctx.notify('テスト');
  assert.equal(sent.length, 0);
});
