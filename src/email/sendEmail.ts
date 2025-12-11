// sendEmail.ts
import nodemailer from "nodemailer";
import dotenv from 'dotenv';

dotenv.config();

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASSWORD;

// 檢查環境變數是否有設定
if (!emailUser || !emailPass) {
    throw new Error("[Email] EMAIL_USER, EMAIL_PASSWORD等環境變數未設定");
}

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: emailUser,
        pass: emailPass,
    }
})

export async function verifyEmailConnection() {
    try {
        await transporter.verify();
        console.log("✅ [Email] SMTP 連線成功");
    } catch (err) {
        console.error("❌ [Email] SMTP 無法連線：", err);
    }
}

// 寄信
export async function sendEmail(options: {
    to: string;
    bcc?: string;
    subject: string;
    html:string;
    text:string;
}) {
    if(!emailUser || !emailPass) {
        throw new Error("[Email] email配置缺失，無法寄信")
    }

    try {
        const info = await transporter.sendMail({
            from: `"Your App" <${emailUser}>`,
            to: options.to,
            bcc: options.bcc,
            subject: options.subject,
            html: options.html,
            text: options.text,
        });

        console.log("[Email] 已寄出：", info.messageId);

        return info;
    } catch (err) {
        console.error("[Email] 寄信失敗：", err);

        if (err instanceof Error) {
            throw new Error(`寄信失敗: ${err.message}`);
        }

        throw err;
    }
}