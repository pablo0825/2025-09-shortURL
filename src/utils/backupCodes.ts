// backupCodes.ts
import crypto from "crypto";
import bcrypt from "bcrypt";

// 產生backup codes
export function generteBackupCodes(count:number = 10):string[] {
    // Array.from 建立一個新的Array實體，指定長度為10，並透過map循環10次
    const codes:string[] = Array.from({length:count}).map(() => {
        // randomBytes 產生 4 bytes的隨機資料
        // toString 將 4 bytes轉為16進位的字串，1個bytes轉為2格字元，所以總共是8個字元
        // toUpperCase 轉成大寫
        const raw:string = crypto.randomBytes(4).toString("hex").toUpperCase();

        // slice() 切割指定的字元長度
        // A1B2-C3D4
        return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    })

    return codes;
}

console.log(generteBackupCodes())

// hash backup codes
export async function hashBackupCodes (codes:string[]):Promise<string[]> {
    const saltRounds = 10;

    const hashes:string[] = await Promise.all(codes.map(c => bcrypt.hash(c, saltRounds)));

    return hashes;
}

// 移除使用後的backup code，並回傳一個新的hashes
export async function consumBackupCodes (code:string, storedHashes:string[]) {
    for(let i:number = 0; i < storedHashes.length; i++) {
        // 比較code和hash後的code
        const ok:boolean = await bcrypt.compare(code, storedHashes[i]);

        if(ok) {
            // backup code使用後從storedHashes中移除
            // const usedCode:string = storedHashes.filter((_, idx) => idx === i);
            const usedCode:string = storedHashes[i];

            return {ok:true, hash: usedCode};
        }
    }

    return {ok:false, hashes:storedHashes};
}

