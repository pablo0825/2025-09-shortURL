// qrcode.ts
import QRCode from 'qrcode';

// 回傳一個 Date Url，如: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
// 前端用 <img src=""> 就可以顯示出來
export async function toDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text);
}
