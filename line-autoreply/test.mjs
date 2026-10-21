import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadScript(globals = {}) {
  const code = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
  const context = vm.createContext({ Date, JSON, String, Object, console, ...globals });
  vm.runInContext(code, context);
  return context;
}

const FAQ = [
  ['営業時間、何時', '営業時間は平日10:00〜18:00です。'],
  ['場所、アクセス、住所', '東京都千代田区サンプル1-2-3です。'],
  ['予約', 'ご予約はこのトークで、希望の日時をお送りください。'],
];

test('キーワードに合う返事を返す（複数キーワード、全角・大文字小文字・空白のゆれに対応）', () => {
  const ctx = loadScript();
  assert.equal(ctx.findReply('営業時間を教えてください', FAQ), '営業時間は平日10:00〜18:00です。');
  assert.equal(ctx.findReply('何時までですか？', FAQ), '営業時間は平日10:00〜18:00です。');
  assert.equal(ctx.findReply('アクセス 方法', FAQ), '東京都千代田区サンプル1-2-3です。');
  assert.equal(ctx.findReply('ＹＯ 予 約', [['yo予約', 'OK']]), 'OK');
});

test('該当がなければ null（上の行が優先される）', () => {
  const ctx = loadScript();
  assert.equal(ctx.findReply('こんにちは', FAQ), null);
  assert.equal(ctx.findReply('予約の場所は？', FAQ), '東京都千代田区サンプル1-2-3です。');
});

function makeEnv() {
  const replies = [];
  const logs = [];
  const faqSheet = {
    getLastRow: () => FAQ.length + 1,
    getRange: () => ({ getValues: () => FAQ }),
  };
  const logSheet = { appendRow: (r) => logs.push(r) };
  const sheets = { FAQ: faqSheet, 記録: logSheet };
  const ctx = loadScript({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'dummy-token' }) },
    UrlFetchApp: { fetch: (url, opts) => replies.push({ url, opts, body: JSON.parse(opts.payload) }) },
    ContentService: { createTextOutput: (t) => ({ text: t }) },
  });
  return { ctx, replies, logs };
}

const webhook = (messages) => ({
  postData: {
    contents: JSON.stringify({
      events: messages.map((m, i) => ({
        type: 'message',
        replyToken: 'token' + i,
        source: { userId: 'Udummy' + i },
        message: m,
      })),
    }),
  },
});

test('doPost：該当する質問に自動返信し、「自動返信」と記録する', () => {
  const { ctx, replies, logs } = makeEnv();
  const out = ctx.doPost(webhook([{ type: 'text', text: '営業時間は？' }]));
  assert.equal(out.text, 'OK');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].url, 'https://api.line.me/v2/bot/message/reply');
  assert.equal(replies[0].opts.headers.Authorization, 'Bearer dummy-token');
  assert.equal(replies[0].body.replyToken, 'token0');
  assert.equal(replies[0].body.messages[0].text, '営業時間は平日10:00〜18:00です。');
  assert.equal(logs[0][1], 'Udummy0');
  assert.equal(logs[0][2], '営業時間は？');
  assert.equal(logs[0][3], '自動返信');
});

test('doPost：該当しない質問は定型文で返し、「要対応」と記録する', () => {
  const { ctx, replies, logs } = makeEnv();
  ctx.doPost(webhook([{ type: 'text', text: '見積りをお願いしたいです' }]));
  assert.equal(replies[0].body.messages[0].text, 'お問い合わせありがとうございます。内容を確認して、担当者からご連絡します。');
  assert.equal(logs[0][3], '要対応');
});

test('doPost：スタンプや画像は無視する', () => {
  const { ctx, replies, logs } = makeEnv();
  ctx.doPost(webhook([{ type: 'sticker' }, { type: 'image' }]));
  assert.equal(replies.length, 0);
  assert.equal(logs.length, 0);
});
