** 2025/11/09

要把log改成用pino，實作方式可參考下方網址：
https://medium.com/@artemkhrenov/building-a-production-grade-logger-for-node-js-applications-with-pino-2ebd8447d531

目前實作功能如下
API:
1. 新增shortUrl
2. 重定向Url
3. 查詢shortUrl
4. 刪除shortUrl
5. 停用shortUrl

定時任務：
1. 每天中午12點把過期的link停用
2. 每30分鐘把停用link的check刪除
3. 每10分鍾把link_task的link寫入到check

中介層：
1. 正向快取：加速longUrl的重定向網址的讀取速度;負向快取：預防不存在的shortUrl攻擊
2. 每天相同ip的請求限制在100次(預防有惡意攻擊通過大量創建shortUrl來癱瘓伺服器)

zod:
1. 驗證及重組網址

高併發：
1. 單飛鎖：多人重定向的情況下，只有一位使用者可以進到db，其他人先等待．第一位先行者會建立link的check紀錄，讓後來者使用

未來開發功能：
1. jsw雙token驗證
2. user相關功能
3. admin相關功能(含權限設計)
4. 更換longUrl
5. 自訂社交標題, 縮圖
6. 顯示, 下載QR code
7. 把log改用pino