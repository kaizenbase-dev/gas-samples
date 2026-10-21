import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Code.gs をそのまま読み込み、GASの SpreadsheetApp だけ偽物に差し替えて動かす
function loadScript(spreadsheetApp) {
  const code = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
  const context = vm.createContext({ SpreadsheetApp: spreadsheetApp, Date, console });
  vm.runInContext(code, context);
  return context;
}

const NOW = new Date('2026-10-21T10:30:00');

test('電話番号：全角・ハイフンなし・+81 を整える', () => {
  const ctx = loadScript({});
  assert.equal(ctx.normalizePhone('０９０１２３４５６７８').value, '090-1234-5678');
  assert.equal(ctx.normalizePhone('+81 90-1234-5678').value, '090-1234-5678');
  assert.equal(ctx.normalizePhone('03(1234)5678').value, '03-1234-5678');
  assert.equal(ctx.normalizePhone('12345').valid, false);
});

test('メール：前後の空白と大文字を整え、形式を確認する', () => {
  const ctx = loadScript({});
  assert.deepEqual({ ...ctx.normalizeEmail('  Taro@Example.COM ') }, { value: 'taro@example.com', valid: true });
  assert.equal(ctx.normalizeEmail('taro-at-example').valid, false);
});

test('正常な回答は「新規」で転記される', () => {
  const ctx = loadScript({});
  const row = ctx.buildRow(
    { 氏名: '山田　太郎', メールアドレス: 'Taro@Example.com', 電話番号: '09012345678', お問い合わせ内容: '見積りをお願いします' },
    [],
    NOW,
  );
  assert.deepEqual([...row], ['2026/10/21 10:30', '山田 太郎', 'taro@example.com', '090-1234-5678', '見積りをお願いします', '新規']);
});

test('形式が不正な項目は「要確認」になり、理由が付く', () => {
  const ctx = loadScript({});
  const row = ctx.buildRow(
    { 氏名: '佐藤', メールアドレス: 'sato-at-example', 電話番号: '12345', お問い合わせ内容: 'テスト' },
    [],
    NOW,
  );
  assert.equal(row[5], '要確認：メール形式・電話番号の形式');
});

test('24時間以内の同じメール・同じ内容は「重複の可能性」', () => {
  const ctx = loadScript({});
  const existing = [['2026/10/21 09:00', '山田 太郎', 'taro@example.com', '090-1234-5678', '見積りをお願いします', '新規']];
  const answers = { 氏名: '山田太郎', メールアドレス: 'taro@example.com', 電話番号: '09012345678', お問い合わせ内容: '見積りをお願いします' };
  assert.equal(ctx.buildRow(answers, existing, NOW)[5], '重複の可能性');

  const old = [['2026/10/19 09:00', '山田 太郎', 'taro@example.com', '090-1234-5678', '見積りをお願いします', '新規']];
  assert.equal(ctx.buildRow(answers, old, NOW)[5], '新規');
});

test('onFormSubmit：シートが無ければ作り、ヘッダーの下に1行追加する', () => {
  const appended = [];
  let created = false;
  const sheet = {
    appendRow: (row) => appended.push(row),
    getLastRow: () => appended.length,
    getRange: () => ({ getValues: () => appended.slice(1) }),
  };
  const app = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => (created ? sheet : null),
      insertSheet: () => {
        created = true;
        return sheet;
      },
    }),
  };
  const ctx = loadScript(app);
  ctx.onFormSubmit({
    namedValues: {
      氏名: ['鈴木 花子'],
      メールアドレス: ['hanako@example.com'],
      電話番号: ['０８０-９８７６-５４３２'],
      お問い合わせ内容: ['資料請求'],
    },
  });
  assert.deepEqual([...appended[0]], ['受付日時', '氏名', 'メール', '電話', '内容', '状態']);
  assert.equal(appended.length, 2);
  assert.equal(appended[1][1], '鈴木 花子');
  assert.equal(appended[1][3], '080-9876-5432');
  assert.equal(appended[1][5], '新規');
});
