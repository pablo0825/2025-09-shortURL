// totp.ts
import {authenticator} from "otplib";

// [標記] 改回function，因為這邊用class沒有意義，沒有不同state，不要用class
// 簡單說，因為它沒有變的不一樣，它就算實例了，還是用同一個資料，所以用class就沒有意義
// export class TotpServer {
//     // 初始化順序：(1) 類別屬性先被賦值 (2) 執行constructor (3) 函式
//     // 目前的寫法，在new TotpServer出來的物件，值都是相同的
//     private readonly step = 30; // 密碼有效時間，標準是30秒
//     private readonly window = 1; // 允許錯誤窗口，允許目前、前一個、後一個的時間窗的密碼都算有效
//
//     constructor() {
//         authenticator.options = {
//             step: this.step,
//             window: this.window,
//         };
//     }
//
//     // 生成secret
//     public generateSecret():string {
//         return authenticator.generateSecret();
//     }
//
//     // 建立QR code用的網址
//     public buildOtpAuthUrl(issuer:string, accountName:string, secret:string):string {
//         return authenticator.keyuri(accountName, issuer, secret);
//     }
//
//     // 驗證驗證碼
//     public verifyCode (token:string, secret:string):boolean {
//         return authenticator.check(token, secret);
//     }
// }

authenticator.options = {
    step: 30, // 密碼有效時間，標準是30秒
    window: 1, // 允許前後一個時間窗，降低時間不同步問題
};

// 生成secret
export function generateTotpSecret():string {
    return authenticator.generateSecret();
}

console.log(generateTotpSecret());

// 建立QR code用的網址
export function buildOtpAuthUrl(issuer:string, accountName:string, secret:string):string {
    return authenticator.keyuri(accountName, issuer, secret);
}

// 驗證驗證碼
export function verifyTotpCode(token:string, secret:string):boolean {
    return authenticator.check(token, secret);
}