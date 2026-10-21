// LINE公式アカウントに届いたメッセージへ、キーワードに応じて自動で返事をするスクリプト（デモ）
// 返事の文章は「FAQ」シートで管理する。届いたメッセージは「記録」シートに残す。
// LINEのWebhook URLに、このスクリプトをウェブアプリとして公開したURLを設定する。

var FAQ_SHEET_NAME = 'FAQ';
var LOG_SHEET_NAME = '記録';
var DEFAULT_REPLY = 'お問い合わせありがとうございます。内容を確認して、担当者からご連絡します。';
var REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

function normalize(text) {
  return String(text || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    })
    .replace(/\s+/g, '')
    .toLowerCase();
}

// faqRows：[キーワード, 返事] の配列。キーワードは「、」で複数指定できる。上の行が優先
function findReply(text, faqRows) {
  var target = normalize(text);
  for (var i = 0; i < faqRows.length; i++) {
    var keywords = String(faqRows[i][0] || '').split('、');
    for (var j = 0; j < keywords.length; j++) {
      var keyword = normalize(keywords[j]);
      if (keyword && target.indexOf(keyword) !== -1) {
        return String(faqRows[i][1]);
      }
    }
  }
  return null;
}

function formatDateTime(date) {
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function replyToLine(replyToken, text, token) {
  UrlFetchApp.fetch(REPLY_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
  });
}

function doPost(e) {
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var faqSheet = spreadsheet.getSheetByName(FAQ_SHEET_NAME);
  var logSheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
  var faqLastRow = faqSheet.getLastRow();
  var faqRows = faqLastRow > 1 ? faqSheet.getRange(2, 1, faqLastRow - 1, 2).getValues() : [];

  var events = JSON.parse(e.postData.contents).events || [];
  events.forEach(function (event) {
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;
    var matched = findReply(event.message.text, faqRows);
    replyToLine(event.replyToken, matched || DEFAULT_REPLY, token);
    logSheet.appendRow([
      formatDateTime(new Date()),
      event.source && event.source.userId ? event.source.userId : '',
      event.message.text,
      matched ? '自動返信' : '要対応',
    ]);
  });

  return ContentService.createTextOutput('OK');
}
