# 弦之境 · Violin Atlas

繁體中文小提琴學習中心，部署於 https://xieyaozhong.github.io/violin/ 。純靜態 HTML/CSS/JavaScript，無 API 金鑰、無付費後端、無必要的第三方 JavaScript。

## 內容

- 篠崎弘嗣經典少年系列與新版1–4冊、鈴木及其他系統教材
- Wohlfahrt、Kayser、Ševčík、Schradieck、Kreutzer、Paganini 等練習曲和公有領域作品的合法來源
- Wikimedia Commons 逐檔授權的真實演奏錄音，可播放、調速、循環、查看授權及前往原始來源
- 自編樂理、演奏技巧、聲學、音色文章和雙語術語
- 指板音高實驗、大小調音階、音程耳訓、節拍器、練習紀錄
- 本機收藏、進度及紀錄匯出，不需註冊

## 開發與部署

直接開啟 index.html 可使用大部分功能；音訊由 Wikimedia Commons 的原始檔案服務提供，需網路連線。以本機靜態伺服器啟動可獲得一致的瀏覽器環境，例如 `python -m http.server 8000`。

GitHub Pages 設定：main 分支、根目錄 `/`。若尚未啟用 Pages，需在 Settings → Pages 選擇 Deploy from a branch，再選 main / (root)。無需建置或安裝依賴。

- `data.js`：書目、錄音、原創學習文章、術語、路徑、來源
- `app.js`：路由、互動、播放器、音高實驗與紀錄
- `styles.css`：響應式版面與配色
- `index.html`：語意化頁面結構

## 版權與來源

本站程式碼及原創文字採用專案原有 LICENSE（MIT）。書籍、錄音、樂譜及外部資料不因本站程式碼授權而改變權利狀態。商業教材只收錄書目、簡介與合法取得連結，不提供盜版掃描或音檔。IMSLP 的個別版本須依所在地法規確認，原作公有領域不代表新版編輯、編曲或現代錄音也必然公有領域。Wikimedia Commons 錄音以各個原始檔案頁的授權為準；下載或再利用時需保留署名及授權條件。Philharmonia 採樣不得原樣重發佈為樣本庫，故本站只提供來源連結。UNSW 研究音檔亦只連結原站。

來源查核日期：2026-09-07。內容屬學習參考，不取代教師對姿勢、技術與個別身體條件的指導。外部連結、授權與可用性可能變更。

## 隱私

收藏與練習紀錄使用瀏覽器 localStorage，沒有伺服器帳號或資料上傳。可在練習頁匯出 JSON、刪除紀錄，或清除瀏覽器網站資料。音訊播放會直接連線至 Wikimedia Commons。