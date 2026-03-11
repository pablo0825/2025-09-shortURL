// isForbiddenTarget.ts
import ipaddr from 'ipaddr.js';
import dns from 'node:dns/promises';

const FORBIDDEN_RANGES = ['loopback', 'private', 'linkLocal', 'uniqueLocal'];

// 判斷hostname是否為內網/本機端的url
export async function isForbiddenTarget(hostname: string): Promise<boolean> {
    // Static check: if hostname is a raw IP address, validate directly.
    // This is faster and avoids unnecessary DNS lookups for direct IP submissions
    // (e.g., http://192.168.1.1/ or http://[::1]/).
    if (ipaddr.isValid(hostname)) {
        try {
            const ip = ipaddr.parse(hostname);
            return FORBIDDEN_RANGES.includes(ip.range());
        } catch {
            return true;
        }
    }

    // DNS-based check for domain names.
    // ⚠ Known limitation: DNS Rebinding attacks can bypass this check for
    // attacker-controlled domains. For production hardening, add network-level
    // egress filtering (e.g., firewall rules blocking outbound requests to
    // private IP ranges) as an additional layer of defense.
    try {
        // dns解析
        const addresses = await dns.lookup(hostname, { all: true });

        for (const { address } of addresses) {
            // 判斷ip是v4或v6
            const ip = ipaddr.parse(address);
            // 判斷ip屬於public (公開)、loopback (本機回送)、private (私有網路)等等
            if (FORBIDDEN_RANGES.includes(ip.range())) {
                return true; // 屬於內網 / 本機 / Link-local
            }
        }
        // dns解析成功
        return false;
    } catch {
        // dns解析失敗
        return true;
    }
}
