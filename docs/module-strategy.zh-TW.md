# 模組策略

## 決策

本專案統一採用 **CommonJS 輸出**。

- `package.json` 必須維持 `"type": "commonjs"`。
- `tsconfig.json` 必須維持 `"compilerOptions.module": "CommonJS"`。

## 我們為什麼這樣選擇

- 目前程式碼、測試與工具鏈在 CommonJS 下已經穩定運作。
- 遷移到 `NodeNext` 需要大範圍調整匯入路徑（加上 `.js` 副檔名），短期風險較高。
- 目前優先目標是交付穩定性與可預期的 CI 行為。

## 防呆規範

- 除非已核准專門的 ESM 遷移計畫，否則不要將 `tsconfig.json` 切換為 `NodeNext`。
- 若未來需要 ESM 遷移，請採分階段批次執行，且每個批次後都要做完整回歸檢查。

## 必要檢查

合併前請執行：

```bash
npm run verify:full
```
