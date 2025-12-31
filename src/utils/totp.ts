// totp.ts
import {authenticator} from "otplib";

export class TotpServer {
    // 初始化順序：(1) 類別屬性先被賦值 (2) 執行constructor (3) 函式
    // 目前的寫法，在new TotpServer出來的物件，值都是相同的
    private readonly step = 30; // 密碼有效時間，標準是30秒
    private readonly window = 1; // 允許錯誤窗口，允許目前、前一個、後一個的時間窗的密碼都算有效

    constructor() {
        authenticator.options = {
            step: this.step,
            window: this.window,
        };
    }

    // 生成secret
    public generateSecret():string {
        return authenticator.generateSecret();
    }

    // 建立QR code用的網址
    public buildOtpAuthUrl(issuer:string, accountName:string, secret:string):string {
        return authenticator.keyuri(accountName, issuer, secret);
    }

    // 驗證驗證碼
    public verifyCode (token:string, secret:string):boolean {
        return authenticator.check(token, secret);
    }
}