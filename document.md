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
8. 驗證email 
9. 重新發送驗證email

auth 中介層:
1. 雙token驗證(這邊要處理accessToken過期的情況)
2. 權限管理

ps:密碼等明文，要hash過

可以考慮，要不要檔未驗證的email登入，像是限制部分功能不能使用
可以考慮加入，登入時先送驗證碼到eamil上，然後要輸入驗證碼才會發放token

user API:
1. 刪除帳號

權限設計：
基於角色的權限設計
多對多
一個使用者有多個角色，一個角色有多個權限

### user table:

| 名稱                     | 型別     | 用途                               |
|------------------------|--------|----------------------------------|
| id                     | bigint | 主鍵                               |
| email                  | string | 作為帳號                             |
| password_hash          | string | password用hash加密，所以這邊存的是hash(雜湊值) |
| nickname               | string | 使用者名稱                            |
| provider               | string | 第三方登入                            |
| provider_id            | string | 第三方登入                            |
| is_email_verified      | bool   | 表示email是否通過驗證                    |
| email_verified_at      | date   | email通過驗證的時間                     |
| avatar_key             | string | 允許NULL                           |
| is_active              | bool   | 帳號啟用                             |
| deleted_at             | date   | 軟刪除                              |
| created_at             | date   | 創建時間                             |
| updated_at             | date   | 更新時間                             |
| last_login_at          | date   | 最後登入時間                           |
| last_password_reset_at | date   | 最後更新密碼的時間                        |


### refresh_token table:

| 欄位                 | 型別      | 用途              |
|--------------------|---------|-----------------|
| id                 | number  | 主鍵              |
| user_id            | number  | 外鍵約束            |
| refresh_token_hash | string  |                 |
| user_agent         | string  | 紀錄裝置來源的原始資料     |
| ip_address         |         | 當下的ip地址         |
| created_at         | date    | 創建時間            |
| expires_at         | date    | 過期時間            |
| revoked_at         | date    | 強制過期時間          |
| device_info        | string  | 整理過的裝置資料        |
| last_used_at       | date    | 紀錄每一個裝置的最後登入時間  |

### user_role table:

| 欄位      | 型別     | 用途   |
|---------|--------|------|
| id      | number | 主鍵   |
| user_id | number | 約束外鍵 |
| role_id | number | 約束外鍵 |

### role table:

| 欄位          | 型別     | 用途                     |
|-------------|--------|------------------------|
| id          | number | 主鍵                     |
| type        | string | admin, user, assistant |

### permissions table:

| 欄位          | 型別     | 用途                                       |
|-------------|--------|------------------------------------------|
| id          | number | 主鍵                                       |
| name        | string | 權限名稱                                     |
| type        | string | N/A, create, update, read, delete, export |
| description | string | 說明可以做甚麼                                  |
| module      | string | 模組                                       |
| parent_id   | number | 樹狀結構，預設為NULL                             |

### role_permissions:

| 欄位             | 型別     | 用途   |
|----------------|--------|------|
| id             | number | 主鍵   |
| role_id        | number | 約束外鍵 |
| permissions_id | number | 約束外鍵 |

## 2025/12/04

### 權限表:

未授權可使用

| parent_id | module | name        | type          | description                                 |
|-----------|--------|-------------|---------------|---------------------------------------------|
| 1         | auth   | 註冊帳號        | create        | 允許建立新帳號                                     |
| 1         | auth   | 登入          | login         | 允許使用者登入帳號                                   |
| 1         | auth   | 刷新token     | refresh       | 允許使用refresh token獲得新的access token           |
| 1         | auth   | 驗證email     | verify        | 允許驗證使用者註冊時的email                            |
| 1         | auth   | 忘記密碼        |               |                                             |
| 1         | auth   | 重設密碼        | reset         | 允許使用者重新設定密碼                                 |
| 1         | auth   | 登出          | logout        | 允許使用者登出當前裝置                                 |
| 1         | auth   | 登出所有裝置      | logout_all    | 允許使用者強制登出所有裝置                               |
| 1         | auth   | 登出指定裝置      | logout_device | 允許使用者登出指定裝置                                 |

ps:第三方登入還沒處理

有授權才可使用

| parent_id | module | name         | type             | description                                 |
|-----------|--------|--------------|------------------|---------------------------------------------|
| NULL      | link   | 短網址服務        | N/A              | 短網址服務的父節點                                   |
| 2         | link   | 建立link       | create           | 允許建立短網址                                     |
| 2         | link   | 查詢link列表     | list             | 允許查詢使用者擁有的link list                         |
| 2         | link   | 查詢link詳情     | read_stats       | 允許使用者查詢單一link的統計資料                          |
| 2         | link   | 更新link資料     | update           | 允許使用者修改單一link的資料，如: longURL, 社交標題, 社交縮圖, 別名 |
| 2         | link   | 停用link       | disable          | 允許使用者將單一link設為停用狀態                          |
| 2         | link   | 刪除link       | delete           | 允許使用者永久刪除單一link                             |
| 2         | link   | 下載QR Code    | export           | 允許使用者下載單一link的QR Code                       |
| NULL      | user   | 使用者資料        | N/A              | 使用者資料的父節點                                   |
| 3         | user   | 讀取個人資料       | read_profile     | 允許使用者讀取自己的完整資料                              |
| 3         | user   | 更新個人資料       | update_profile   | 允許使用者更新自己的資料                                |
| 3         | user   | 更新個人頭像       | update_avatar    | 允許使用者更新自己的頭像                                |
| 3         | user   | 刪除個人頭像       | delete_avatar    | 允許使用者更新自己的密碼                                |
| 3         | user   | 更新密碼         | update_password  | 允許使用者更新自己的密碼                                |
| 3         | user   | 啟用2fa        | setup_2fa        | 允許使用者啟用自己的兩步驟驗證設定                           |
| 3         | user   | 驗證2fa        | verify_2fa       | 允許使用者驗證自己的兩步驟驗證設定                           |
| 3         | user   | 停用2fa        | disable_2fa      | 允許使用者停用自己的兩步驟驗證設定                           |
| 3         | user   | 刪除帳號         | soft_delete      | 允許使用者刪除自己的帳號                                |
| 3         | user   | 讀取登陸紀錄       | read_sessions    | 允許使用者查看自己的登入紀錄                              |
| 3         | user   | 登出所有裝置      | logout_all    | 允許使用者強制登出所有裝置                               |
| 3         | user   | 登出指定裝置      | logout_device | 允許使用者登出指定裝置                                 |
| NULL      | admin  | 管理員控制        | N/A              | 管理員控制的父節點                                   |
| 4         | admin  | 查詢所有使用者列表    | list_user        | 允許管理員取得所有使用者的列表                             |
| 4         | admin  | 軟刪除使用者       | soft_delete_user | 允許管理員將使用者帳號停用                               |
| 4         | admin  | 恢復使用者        | restore_user     | 允許管理員恢復使用者帳號                                |
| 4         | admin  | 設定角色權限       | manage_role      | 允許管理員編輯角色的權限                                |
| 4         | admin  | 分配角色給使用者     | assign_role      |                                             |
| 4         | admin  | 查詢所有link列表   | read_all_link    | 允許管理員查詢所有使用者的link                           |
| 4         | admin  | 停用任何使用者的link | disable_any_link | 允許管理員停用任何使用者的link                           |
| 4         | admin  | 查看統計資料       | view_stats       | 允許管理員查看儀表板和系統運行數據                           


權限初始化:
先把權限從db中拿出來，放到redis中

## 2025/12/09

### user_log table:

| 欄位            | 型別     | 用途                                    |
|---------------|--------|---------------------------------------|
| id            | number | 主鍵                                    |
| user_id       | number | 外鍵                                    |
| user_nickname | string | 使用者名稱                                 |
| created_at    | date   | 創建時間                                  |
| action        | string | 動作，像是忘記密碼、重設密碼、更新個人資料、更新個人頭像、刪除帳號等等動作 |
| detail        | string | 說明甚麼動作                                |


## 2025/12/15

auth api 大多已經完成，如下，剩下驗證email的api，等完成user, admin的api在回來處理。

user api:
1. 讀取個人資料 getMyProfile
2. 更新個人資料 updateMyProfile
3. 更新個人頭像 updateMyAvatar
4. 刪除個人頭像 deleteMyAvatar
5. 更新密碼 changeMyPassword 用post
6. 設定2fa驗證 setup2fa
7. 驗證2fa驗證 verify2fa
8. 停用2fa驗證 disable2fa
9. 刪除帳號 softDeleteMyAccount
10. 讀取登入紀錄 getMySessionsList
11. 登出指定裝置 logoutDevice
12. 登出全部裝置 logoutAll

ps: logoutAll, logoutDevice等，目前放在auth route中，之後要搬到user route裡面。

要修改suers table的欄位


