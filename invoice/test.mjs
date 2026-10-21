import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadScript(globals = {}) {
  const code = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
  const context = vm.createContext({ Date, Math, Number, String, Object, console, ...globals });
  vm.runInContext(code, context);
  return context;
}

// 列：対象 / 請求番号 / 宛先 / 請求日 / 支払期限 / 品目 / 数量 / 単価 / 税率
const ROWS = [
  [true, 'INV-001', '株式会社テスト商店', '2026/10/31', '2026/11/30', '事務用品', 3, 1000, 10],
  [true, 'INV-001', '株式会社テスト商店', '2026/10/31', '2026/11/30', '飲料（軽減税率）', 5, 400, 8],
  [false, 'INV-002', '有限会社見本工業', '2026/10/31', '2026/11/30', '保守費用', 1, 50000, 10],
  [true, 'INV-003', '見本クリニック', '2026/10/31', '2026/11/30', '清掃サービス', 2, 999, 10],
];

test('チェックした行だけを、請求番号ごとにまとめる', () => {
  const ctx = loadScript();
  const invoices = ctx.groupInvoices(ROWS);
  assert.equal(invoices.length, 2);
  assert.equal(invoices[0].no, 'INV-001');
  assert.equal(invoices[0].items.length, 2);
  assert.equal(invoices[1].no, 'INV-003');
});

test('税率が混在する請求書は、税率ごとに集計する', () => {
  const ctx = loadScript();
  const t = ctx.calcTotals(ctx.groupInvoices(ROWS)[0].items);
  assert.equal(t.subtotal, 5000);
  assert.deepEqual(
    t.groups.map((g) => ({ ...g })),
    [
      { rate: 10, base: 3000, tax: 300 },
      { rate: 8, base: 2000, tax: 160 },
    ],
  );
  assert.equal(t.tax, 460);
  assert.equal(t.total, 5460);
});

test('消費税の端数は、税率ごとに1回だけ切り捨てる', () => {
  const ctx = loadScript();
  const t = ctx.calcTotals([{ name: 'A', qty: 2, price: 999, rate: 10 }]);
  assert.equal(t.groups[0].tax, 199);
  assert.equal(t.total, 2197);
});

test('請求書HTMLに、宛先・金額・税率別の内訳が入る', () => {
  const ctx = loadScript();
  const inv = ctx.groupInvoices(ROWS)[0];
  const html = ctx.buildInvoiceHtml(inv, ctx.ISSUER);
  assert.ok(html.includes('株式会社テスト商店 御中'));
  assert.ok(html.includes('¥5,460（税込）'));
  assert.ok(html.includes('10%対象 ¥3,000'));
  assert.ok(html.includes('8%対象 ¥2,000'));
  assert.ok(html.includes('2026年10月31日'));
});

test('宛先に記号があっても、HTMLが壊れない（エスケープ）', () => {
  const ctx = loadScript();
  const inv = { no: 'X', to: '<b>A&B</b>', date: '2026/10/31', due: '2026/11/30', items: [{ name: 'a', qty: 1, price: 100, rate: 10 }] };
  const html = ctx.buildInvoiceHtml(inv, ctx.ISSUER);
  assert.ok(html.includes('&lt;b&gt;A&amp;B&lt;/b&gt; 御中'));
});

test('generateInvoices：チェックした請求書の数だけ、請求書と送付状を作る', () => {
  const created = [];
  const alerts = [];
  const makeBlob = () => {
    const b = { name: '' };
    b.getAs = () => b;
    b.setName = (n) => {
      b.name = n;
    };
    return b;
  };
  const sheet = { getDataRange: () => ({ getValues: () => [['対象', '請求番号'], ...ROWS] }) };
  const ctx = loadScript({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      getUi: () => ({ alert: (m) => alerts.push(m) }),
    },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => ({ createFile: (b) => created.push(b.name) }),
    },
    Utilities: { newBlob: () => makeBlob() },
  });
  ctx.generateInvoices();
  assert.deepEqual(created, ['請求書_INV-001.pdf', '送付状_INV-001.pdf', '請求書_INV-003.pdf', '送付状_INV-003.pdf']);
  assert.equal(alerts[0], '2通の請求書と送付状を作成しました。');
});
