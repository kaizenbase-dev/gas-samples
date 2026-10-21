# gas-samples

GAS（Google Apps Script）とスプレッドシートの自動化デモ集です。会社名・金額・氏名・メッセージはすべて架空のデータです。

| デモ | 内容 |
|---|---|
| [form-to-sheet](form-to-sheet) | Googleフォームの回答を整えて、シートに転記する（電話・メールの表記ゆれ、重複の検出） |
| [invoice](invoice) | 一覧表のチェックした行から、請求書と送付状をまとめて作る（10%と8%の混在に対応） |
| [mail-notify](mail-notify) | 条件に合うメールが届いたら、SlackまたはLINEに通知する（二重通知の防止つき） |
| [line-autoreply](line-autoreply) | LINE公式アカウントに、キーワードに応じて自動で返事をする（返事はシートで管理） |

それぞれ `node --test test.mjs` で動作確認できます。実際のGoogleアカウント・LINE・Slack上での動作は、納品時にお客様の環境で確認します。
