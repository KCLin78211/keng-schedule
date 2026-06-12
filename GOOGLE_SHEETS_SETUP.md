# Google Sheets 後端設定

目標試算表：
https://docs.google.com/spreadsheets/d/1Y__FELo8Q922P742jto9gE_y9ObCo5yUxdynYErIl_c/edit

## 1. 建立 Apps Script

1. 打開上面的 Google Sheet。
2. 點選 `Extensions` / `擴充功能`。
3. 點選 `Apps Script`。
4. 刪除預設 `Code.gs` 內容。
5. 貼上本專案的 `google-apps-script.gs` 全部內容。
6. 按儲存。

## 2. 初始化分頁

在 Apps Script 編輯器執行 `ensureSchema`。

第一次執行時 Google 會要求授權，請用這份 Sheet 的擁有者帳號授權。

執行後會建立這些分頁：

- `employees`
- `shift_templates`
- `schedule_cells`
- `leave_balances`
- `leave_records`
- `app_meta`

## 3. 部署 Web App

1. 點選 `Deploy`。
2. 選 `New deployment`。
3. 類型選 `Web app`。
4. `Execute as` 選 `Me`。
5. `Who has access` 測試階段可先選 `Anyone with the link`。
6. 部署後複製 `Web app URL`。

把 Web App URL 給 Codex，前端就可以改成：

- 開啟網頁時從 Sheets 載入最新資料。
- 儲存排班時寫回 Sheets。
- 更新 GitHub Pages 時不覆蓋已排好的資料。
