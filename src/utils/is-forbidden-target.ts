 // isForbiddenTarget.ts
 import ipaddr from "ipaddr.js"
import dns from "node:dns/promises"

 const FORBIDDEN_RANGES = new Set(["loopback", "private", "linkLocal", "uniqueLocal"]);

 // 判斷hostname是否為內網/本機端的url
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