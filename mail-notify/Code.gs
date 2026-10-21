// 条件に合うメールが届いたら、SlackまたはLINEに通知するスクリプト（デモ）
// 時間トリガー（例：5分ごと）で checkMail を動かす。通知済みのスレッドにはラベルを付け、二重通知を防ぐ。

var NOTIFIED_LABEL = '通知済み';

// 通知する条件。from は送信元の一部、subject は件名に含まれる言葉（どちらか片方でも可）
var RULES = [
  { name: '注文メール', from: 'order@example-shop.test', subject: '注文' },
  { name: '請求書の連絡', from: '', subject: '請求書' },
];

function buildQuery(rule) {
  var parts = ['-label:' + NOTIFIED_LABEL, 'newer_than:1d'];
  if (rule.from) parts.push('from:' + rule.from);
  if (rule.subject) parts.push('subject:' + rule.subject);
  return parts.join(' ');
}

function buildMessage(rule, thread) {
  var message = thread.getMessages()[0];
  return '【' + rule.name + '】\n件名：' + message.getSubject() + '\n送信元：' + message.getFrom();
}

function sendSlack(text, webhookUrl) {
  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
  });
}

// LINE公式アカウントのMessaging APIで、指定のユーザーIDにメッセージを送る
function sendLine(text, token, userId) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text }] }),
  });
}

function notify(text) {
  var props = PropertiesService.getScriptProperties();
  var slackUrl = props.getProperty('SLACK_WEBHOOK_URL');
  var lineToken = props.getProperty('LINE_CHANNEL_TOKEN');
  var lineUser = props.getProperty('LINE_USER_ID');
  if (slackUrl) sendSlack(text, slackUrl);
  if (lineToken && lineUser) sendLine(text, lineToken, lineUser);
}

function getOrCreateLabel() {
  return GmailApp.getUserLabelByName(NOTIFIED_LABEL) || GmailApp.createLabel(NOTIFIED_LABEL);
}

// 通知した件数を返す
function checkMail() {
  var label = getOrCreateLabel();
  var count = 0;
  RULES.forEach(function (rule) {
    GmailApp.search(buildQuery(rule), 0, 20).forEach(function (thread) {
      notify(buildMessage(rule, thread));
      thread.addLabel(label);
      count++;
    });
  });
  return count;
}
