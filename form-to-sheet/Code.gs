// Googleフォームの回答を「転記先」シートに整えて転記するスクリプト（デモ）
// フォームの送信をトリガーに onFormSubmit が動く。

var TARGET_SHEET_NAME = '転記先';
var HEADERS = ['受付日時', '氏名', 'メール', '電話', '内容', '状態'];
var DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function toHalfWidth(text) {
  return String(text).replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
  });
}

function normalizeEmail(raw) {
  var email = toHalfWidth(raw || '').trim().toLowerCase();
  var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return { value: email, valid: valid };
}

function normalizePhone(raw) {
  var digits = toHalfWidth(raw || '').replace(/[^0-9]/g, '');
  if (digits.indexOf('81') === 0 && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }
  if (digits.length === 11 && /^0[789]0/.test(digits)) {
    return { value: digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7), valid: true };
  }
  if (digits.length === 10 && /^0[36]/.test(digits)) {
    return { value: digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6), valid: true };
  }
  if (digits.length === 10 && digits.charAt(0) === '0') {
    return { value: digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6), valid: true };
  }
  return { value: String(raw || '').trim(), valid: false };
}

function formatDateTime(date) {
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

// 既存の行（HEADERSと同じ並び）に、同じメール・同じ内容が24時間以内にあるかを調べる
function isDuplicate(existingRows, email, content, now) {
  for (var i = 0; i < existingRows.length; i++) {
    var row = existingRows[i];
    var receivedAt = new Date(String(row[0]).replace(/\//g, '-').replace(' ', 'T'));
    if (isNaN(receivedAt.getTime())) continue;
    if (row[2] === email && row[4] === content && now - receivedAt < DUPLICATE_WINDOW_MS) {
      return true;
    }
  }
  return false;
}

function buildRow(answers, existingRows, now) {
  var name = toHalfWidth(answers['氏名'] || '').replace(/\s+/g, ' ').trim();
  var email = normalizeEmail(answers['メールアドレス']);
  var phone = normalizePhone(answers['電話番号']);
  var content = String(answers['お問い合わせ内容'] || '').trim();

  var problems = [];
  if (!name) problems.push('氏名が空');
  if (!email.valid) problems.push('メール形式');
  if (!phone.valid) problems.push('電話番号の形式');
  if (!content) problems.push('内容が空');

  var status = '新規';
  if (problems.length > 0) {
    status = '要確認：' + problems.join('・');
  } else if (isDuplicate(existingRows, email.value, content, now)) {
    status = '重複の可能性';
  }

  return [formatDateTime(now), name, email.value, phone.value, content, status];
}

function getOrCreateTargetSheet(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TARGET_SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function onFormSubmit(e) {
  var answers = {};
  Object.keys(e.namedValues).forEach(function (key) {
    answers[key] = e.namedValues[key][0];
  });

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateTargetSheet(spreadsheet);
  var lastRow = sheet.getLastRow();
  var existingRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues() : [];

  sheet.appendRow(buildRow(answers, existingRows, new Date()));
}
