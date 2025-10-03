// base62.ts
export class Base62 {
    // readonly 只能讀取，不能修改 (只能在constructor賦值，如果在以外的地方，會產生錯誤)
    private readonly alphabet: string; // 字符
    private readonly base: bigint; // 字符長度
    private readonly charToVal: Map<string, number>; // 對照表

    constructor (alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
        const set = new Set(alphabet.split(""));

        if (set.size !== alphabet.length) {
            throw new Error("Alphabet contains duplicate characters.");
        }
        if (alphabet.length < 2) {
            throw new Error("Alphabet must have at least 2 distinct characters.");
        }

        this.alphabet = alphabet;
        this.base = BigInt(alphabet.length);
        this.charToVal = new Map<string, number>();

        // 字符與數字的對照表
        for (let i:number = 0; i < alphabet.length; i++) {
            this.charToVal.set(alphabet[i], i);
        }
    }

    // 10 → base62
    // 12345 → 9ix
    private _encodeNumber (num:bigint):string {
        if (num < 0n) {
            throw new Error("Please input a non-negative integer.");
        }

        if (num === 0n) return this.alphabet[0];

        let n:bigint = num;
        // let s:string = "";
        const out:string[] = [];

        while (n > 0) {
            // 12345 % 62 = 14
            const remainder = Number(n % this.base);
            // s = this.alphabet[remainder] + s;
            // 查看14在62進制表示的字符
            out.push(this.alphabet[remainder]);
            // 12345 % 62 = 14，重新覆值給n
            // 這邊會自動取整數
            n = n / this.base;
        }
        // reverse()有反轉陣列的功能
        return out.reverse().join("");
    }

    // base62 → 10
    // F2H →
    private _decodeString (str:string):number {
        if ( str.length === 0) {
            throw new Error("Input string must be non-empty.");
        }

        let val:number = 0;
        for (let i:number = 0; i < str.length; i++) {
            // ch = 9
            const ch = str[i];
            // 從對照表中，取出對應的數字
            const digit = this.charToVal.get(ch);
            if (digit === undefined) {
                throw new Error(`Invalid character "${ch}" for this alphabet.`);
            }
            // 不能超過這個數字的範圍
            // Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991 最大極限值
            const baseNum = Number(this.base);
            // 簡化：(1000 - 50) / 62 = 15
            const limit = Math.floor((Number.MAX_SAFE_INTEGER - digit) / baseNum);
            if (val > limit) {
                throw new Error("Decoded value exceeds Number.MAX_SAFE_INTEGER. Consider using the BigInt version.");
            }
            // val = 15
            val = val * baseNum + digit;
        }
        return val;
    }

    encode10to62 (num:bigint):string {
        return this._encodeNumber(num);
    }

    decode62to10 (str:string):number {
        return this._decodeString(str);
    }
}