// cryptoUtils.ts
import crypto from 'crypto';

export class CryptoUtils {
    private readonly encryptionKey:Buffer;

    constructor() {
        const rawKey:string | undefined = process.env.TWOFA_ENCRYPTION_KEY;

        //
        if(!rawKey){
            // 判斷是否在生產環境
            if (process.env.NODE_ENV === 'production') {
                throw new Error("[crypto] 環境變數中未定義 TWOFA_ENCRYPTION_KEY");
            }

            // alloc 在記憶體中分配一塊新的空間
            // 指定長度為32，填充內容為"a"
            this.encryptionKey = Buffer.alloc(32, "a");
        } else {
            // from 將字傳轉為buffer(二進制資料)格式
            const masterKey = Buffer.from(rawKey, 'utf-8');

            if (masterKey.length !== 32) {
                throw new Error("[crypto] TWOFA_ENCRYPTION_KEY 長度必須為 32 bytes (AES-256)");
            }

            this.encryptionKey = masterKey;
        }
    }

    public encrypt(text:string) {
        // 分配12 bytes的記憶體空間
        // randomBytes 是同步函式，會等到回傳12bytes，才往下執行
        const iv = crypto.randomBytes(12);

        // 建立一個加密實例 (準備一個保險箱)
        // aes-256-gcm 使用aes算法，256元長度，gcm認證魔式
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)

        // 將字串轉換為buffer，也就是開始加密
        let encrypted = cipher.update(text, "utf-8");

        // concat 將所有加密片段合成一個完整的buffer (整批的貨)
        // .final() 告訴加密器，後續沒有資料了，可以把這尾巴的資料送出了
        // 如果沒有執行final()，在取出getAuthTag會出錯
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        // 產生一個16 bytes tag，確保資料沒有被竄改
        const authTag = cipher.getAuthTag();

        return {
            encrypted,
            iv,
            authTag
        }
    }

    public decrypt(encrypted:Buffer, iv:Buffer, authTag:Buffer) {
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString("utf-8");
    }
}