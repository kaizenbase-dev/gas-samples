// 一覧表（請求一覧シート）から、請求書と送付状のPDFをまとめて作るスクリプト（デモ）
// 1行＝1品目。同じ請求番号の行が、1通の請求書になる。

var SHEET_NAME = '請求一覧';
var OUTPUT_FOLDER_NAME = '請求書PDF';

// 発行元は架空のサンプル。実際の納品時は、お客様の情報に差し替える
var ISSUER = {
  name: '株式会社サンプル商事',
  address: '東京都千代田区サンプル1-2-3',
  registrationNo: 'T0000000000000',
  bank: 'サンプル銀行 本店 普通 0000000 カ）サンプルショウジ',
};

// 列の並び：対象 / 請求番号 / 宛先 / 請求日 / 支払期限 / 品目 / 数量 / 単価 / 税率
var COL = { target: 0, no: 1, to: 2, date: 3, due: 4, item: 5, qty: 6, price: 7, rate: 8 };

function formatDate(value) {
  if (value instanceof Date) {
    return value.getFullYear() + '年' + (value.getMonth() + 1) + '月' + value.getDate() + '日';
  }
  var m = String(value).match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : String(value);
}

function formatYen(n) {
  return '¥' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// 対象にチェックが入った行を、請求番号ごとにまとめる
function groupInvoices(rows) {
  var order = [];
  var byNo = {};
  rows.forEach(function (row) {
    if (row[COL.target] !== true) return;
    var no = String(row[COL.no]);
    if (!byNo[no]) {
      byNo[no] = { no: no, to: row[COL.to], date: row[COL.date], due: row[COL.due], items: [] };
      order.push(no);
    }
    byNo[no].items.push({
      name: row[COL.item],
      qty: Number(row[COL.qty]),
      price: Number(row[COL.price]),
      rate: Number(row[COL.rate]),
    });
  });
  return order.map(function (no) {
    return byNo[no];
  });
}

// 消費税は、税率ごとに合計してから端数（切り捨て）を処理する（1請求書につき税率ごとに1回）
function calcTotals(items) {
  var bases = {};
  items.forEach(function (it) {
    bases[it.rate] = (bases[it.rate] || 0) + it.qty * it.price;
  });
  var groups = Object.keys(bases)
    .map(Number)
    .sort(function (a, b) {
      return b - a;
    })
    .map(function (rate) {
      return { rate: rate, base: bases[rate], tax: Math.floor((bases[rate] * rate) / 100) };
    });
  var subtotal = groups.reduce(function (s, g) {
    return s + g.base;
  }, 0);
  var tax = groups.reduce(function (s, g) {
    return s + g.tax;
  }, 0);
  return { groups: groups, subtotal: subtotal, tax: tax, total: subtotal + tax };
}

var STYLE =
  '<style>body{font-family:sans-serif;font-size:12px;margin:32px;color:#222}h1{font-size:22px;letter-spacing:6px;text-align:center}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px}th{background:#eee}.r{text-align:right}' +
  '.meta{margin:16px 0}.issuer{text-align:right;margin-top:16px}.total{font-size:16px;font-weight:bold;margin:12px 0}</style>';

function buildInvoiceHtml(inv, issuer) {
  var t = calcTotals(inv.items);
  var rows = inv.items
    .map(function (it) {
      return (
        '<tr><td>' + escapeHtml(it.name) + '</td><td class="r">' + it.qty + '</td><td class="r">' + formatYen(it.price) +
        '</td><td class="r">' + it.rate + '%</td><td class="r">' + formatYen(it.qty * it.price) + '</td></tr>'
      );
    })
    .join('');
  var taxRows = t.groups
    .map(function (g) {
      return (
        '<tr><td colspan="4" class="r">' + g.rate + '%対象 ' + formatYen(g.base) + '　消費税</td><td class="r">' +
        formatYen(g.tax) + '</td></tr>'
      );
    })
    .join('');
  return (
    '<html><head><meta charset="utf-8">' + STYLE + '</head><body>' +
    '<h1>請 求 書</h1>' +
    '<div class="meta">請求番号：' + escapeHtml(inv.no) + '<br>請求日：' + formatDate(inv.date) + '</div>' +
    '<p><b>' + escapeHtml(inv.to) + ' 御中</b></p>' +
    '<p class="total">ご請求金額　' + formatYen(t.total) + '（税込）</p>' +
    '<p>お支払期限：' + formatDate(inv.due) + '</p>' +
    '<table><tr><th>品目</th><th>数量</th><th>単価</th><th>税率</th><th>金額</th></tr>' + rows + taxRows +
    '<tr><td colspan="4" class="r"><b>合計（税込）</b></td><td class="r"><b>' + formatYen(t.total) + '</b></td></tr></table>' +
    '<div class="issuer">' + escapeHtml(issuer.name) + '<br>' + escapeHtml(issuer.address) + '<br>登録番号：' +
    escapeHtml(issuer.registrationNo) + '<br>お振込先：' + escapeHtml(issuer.bank) + '</div>' +
    '</body></html>'
  );
}

function buildCoverLetterHtml(inv, issuer) {
  return (
    '<html><head><meta charset="utf-8">' + STYLE + '</head><body>' +
    '<p class="r">' + formatDate(inv.date) + '</p>' +
    '<p><b>' + escapeHtml(inv.to) + ' 御中</b></p>' +
    '<div class="issuer">' + escapeHtml(issuer.name) + '<br>' + escapeHtml(issuer.address) + '</div>' +
    '<h1>請求書送付のご案内</h1>' +
    '<p>拝啓　平素は格別のご高配を賜り、厚く御礼申し上げます。<br>下記のとおり、請求書をお送りいたします。ご査収くださいますようお願い申し上げます。</p>' +
    '<p>記<br>・請求番号：' + escapeHtml(inv.no) + '<br>・お支払期限：' + formatDate(inv.due) + '</p>' +
    '<p class="r">以上　敬具</p>' +
    '</body></html>'
  );
}

function getOutputFolder() {
  var folders = DriveApp.getFoldersByName(OUTPUT_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(OUTPUT_FOLDER_NAME);
}

// 「対象」にチェックを入れた行の請求書と送付状を、Driveのフォルダにまとめて出力する
function generateInvoices() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var rows = sheet.getDataRange().getValues().slice(1);
  var invoices = groupInvoices(rows);
  if (invoices.length === 0) {
    SpreadsheetApp.getUi().alert('「対象」にチェックが入った行がありません。');
    return;
  }
  var folder = getOutputFolder();
  invoices.forEach(function (inv) {
    var invoicePdf = Utilities.newBlob(buildInvoiceHtml(inv, ISSUER), 'text/html', '請求書_' + inv.no + '.html').getAs('application/pdf');
    invoicePdf.setName('請求書_' + inv.no + '.pdf');
    folder.createFile(invoicePdf);
    var letterPdf = Utilities.newBlob(buildCoverLetterHtml(inv, ISSUER), 'text/html', '送付状_' + inv.no + '.html').getAs('application/pdf');
    letterPdf.setName('送付状_' + inv.no + '.pdf');
    folder.createFile(letterPdf);
  });
  SpreadsheetApp.getUi().alert(invoices.length + '通の請求書と送付状を作成しました。');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('請求書').addItem('チェックした行をまとめて作成', 'generateInvoices').addToUi();
}
