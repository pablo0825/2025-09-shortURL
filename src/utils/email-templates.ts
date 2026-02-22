type PasswordResetEmailParams = {
    nickname: string;
    resetAt: string;
    ip: string;
};

export const buildPasswordResetEmail = (params: PasswordResetEmailParams) => {
    const {nickname, resetAt, ip} = params;

    const html = `
        <h2>更新密碼</h2>
        <p>親愛的 ：</p>
        <p>您的帳號密碼已於 ${resetAt} 成功重設。</p>
        <p>重設位置 IP: ${ip}</p>
        <p>如果這不是您本人的操作,請立即聯繫我們的客服團隊。</p>`
    ;

    const text = `親愛的 ：\n\n您的帳號密碼更新成功。\n\n如果這不是您本人的操作,請立即聯繫我們的客服團隊。\n\n`;

    const subject = `${nickname} 您的密碼更新成功通知`;

    return {html, text, subject};
};
