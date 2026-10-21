# gas-samples

GAS（Google Apps Script）とスプレッドシートの自動化デモ集です。会社名・金額・氏名はすべて架空のデータです。

| デモ | 内容 |
|---|---|
| [form-to-sheet](form-to-sheet) | Googleフォームの回答を整えて、シートに転記する（電話・メールの表記ゆれ、重複の検出） |
| [invoice](invoice) | 一覧表のチェックした行から、請求書と送付状をまとめて作る（10%と8%の混在に対応） |

それぞれ `node --test test.mjs` で動作確認できます。実際のGoogleアカウント上での動作は、納品時にお客様の環境で確認します。
