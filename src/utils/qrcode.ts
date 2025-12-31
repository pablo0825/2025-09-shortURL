// qrcode.ts
import QRCode from "qrcode";

export async function toDataUrl (text:string):Promise<string> {
    return QRCode.toDataURL(text);
}