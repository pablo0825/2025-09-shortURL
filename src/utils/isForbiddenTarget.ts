 // isForbiddenTarget.ts
 import ipaddr from "ipaddr.js"
import dns from "node:dns/promises"

export async function isForbiddenTarget (hostname: string): Promise<boolean> {
    try {
        // dns解析
        const addresses = await dns.lookup(hostname, { all: true });

        for (const { address } of addresses) {
            // 判斷ip是v4或v6
            const ip = ipaddr.parse(address);
            // 判斷ip屬於public (公開)、loopback (本機回送)、private (私有網路)等等
            const range = ip.range();

            // ip的rang不能是以下類別的
            if (["loopback", "private", "linkLocal", "uniqueLocal"].includes(range)) {
                return true; // 屬於內網 / 本機 / Link-local
            }
        }
        // dns解析成功
        return false;
    } catch (err) {
        // dns解析失敗
        return true;
    }
}

export function getEffectivePort (u: URL): number {
     // port必定為數字
     if (u.port) return Number(u.port);
     return u.protocol === "https:" ? 443 : 80;
}
