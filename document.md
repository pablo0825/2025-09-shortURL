## 2025/11/09

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

## 2025/11/12

完成功能：
1. jwt驗證工具

## 2025/11/13

完成功能：
1. redis驗證工具

## 2025/11/14

auth API：
1. 註冊
2. 登入
3. 登出(單一裝置)
4. 登出(全部裝置)
5. 刷新 refreshToken 
6. 忘記密碼 
7. 重設密碼 
8. 中介層:jwt驗證 (這邊要處理accessToken過期的情況)

ps:密碼等明文，要hash過

user API:
1. 刪除帳號

user table:

| 名稱                     | 型別     | 用途                               |
|------------------------|--------|----------------------------------|
| id                     | number | 主鍵                               |
| nickname               | string | 使用者名稱                            |
| account                | string |                                  |
| password_hash          | string | password用hash加密，所以這邊存的是hash(雜湊值) |
| email                  | string | 作為帳號                             |
| is_email_verified      | bool   | 表示email是否通過驗證                    |
| email_verified_at      | date   | email通過驗證的時間                     |
| avatar_url             | string | 允許NULL                           |
| roles                  | enum   | admin, user, assistant           |
| is_active              | bool   |                                  |
| created_at             | date   |                                  |
| updated_at             | date   | 更新時間                             |
| last_login_at          | date   | 最後登入時間                           |
| last_password_reset_at | date   | 最後更新密碼的時間                        |



登入紀錄(裝置/瀏覽器, ip, 登入時間, 最後活動, 狀態:目前裝置, 非活躍)

登出所有裝置
