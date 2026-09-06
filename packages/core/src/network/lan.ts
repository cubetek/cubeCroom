import { networkInterfaces } from 'node:os';

/**
 * اختيار عنوان الجهاز على الشبكة المحلية.
 *
 * الجهاز الواحد يحمل عناوين كثيرة: البطاقة السلكية، اللاسلكية، ومحوّلات
 * وهمية يزرعها Docker و WSL و VirtualBox. اختيار العنوان الخطأ يعني رابطاً
 * يفتحه المعلم فيرى صفحته، ولا يصل إليه طالب واحد — وهو أسوأ عطل ممكن لأنه
 * يبدو ناجحاً على جهاز المعلم.
 *
 * الترتيب هنا مبنيّ على ذلك:
 *   ١. تُستبعد المحوّلات الوهمية بالاسم، والعناوين الداخلية و IPv6.
 *   ٢. يُستبعد `169.254.x` — عنوان يمنحه النظام لنفسه حين يفشل DHCP، أي
 *      «لا شبكة» متنكّرة في صورة شبكة.
 *   ٣. تُفضَّل النطاقات الخاصة، ثم البطاقة اللاسلكية: طلاب المدرسة على Wi-Fi.
 */

export type NetworkAddress = {
  readonly address: string;
  /** اسم البطاقة كما يسمّيها النظام — يظهر في «تفاصيل تقنية» في T09NoLan. */
  readonly adapter: string;
};

export type InterfaceEntry = {
  readonly address: string;
  readonly family: string | number;
  readonly internal: boolean;
};

export type InterfaceMap = Readonly<Record<string, readonly InterfaceEntry[] | undefined>>;

/** أسماء محوّلات لا يصل إليها طالب أبداً. */
const VIRTUAL = /vethernet|virtualbox|vmware|docker|wsl|hyper-?v|loopback|tailscale|zerotier|tap-|tun\d/i;

const WIRELESS = /wi-?fi|wlan|wireless|اللاسلكي/i;

function isPrivate(address: string): boolean {
  if (address.startsWith('192.168.')) return true;
  if (address.startsWith('10.')) return true;
  const parts = address.split('.');
  const second = Number(parts[1]);
  return parts[0] === '172' && second >= 16 && second <= 31;
}

function isIpv4(entry: InterfaceEntry): boolean {
  return entry.family === 'IPv4' || entry.family === 4;
}

/**
 * دالة صافية ليكون الاختيار قابلاً للفحص: بطاقات الجهاز الذي يعمل عليه
 * المطوّر ليست بطاقات جهاز المعلم في المدرسة.
 */
export function pickLanAddress(interfaces: InterfaceMap): NetworkAddress | null {
  const candidates: Array<NetworkAddress & { rank: number }> = [];

  for (const [adapter, entries] of Object.entries(interfaces)) {
    if (!entries || VIRTUAL.test(adapter)) continue;
    for (const entry of entries) {
      if (entry.internal || !isIpv4(entry)) continue;
      if (entry.address.startsWith('169.254.')) continue;

      const rank = (isPrivate(entry.address) ? 0 : 2) + (WIRELESS.test(adapter) ? 0 : 1);
      candidates.push({ address: entry.address, adapter, rank });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank);
  const best = candidates[0];
  return best ? { address: best.address, adapter: best.adapter } : null;
}

/** العنوان الحالي، أو `null` حين لا يكون الجهاز على شبكة — حالة `T09NoLan`. */
export function lanAddress(): NetworkAddress | null {
  return pickLanAddress(networkInterfaces() as InterfaceMap);
}
