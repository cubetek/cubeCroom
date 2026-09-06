/**
 * تصريح أنواع لـ`multicast-dns` — الحزمة تُشحن بلا أنواع.
 *
 * ويُكتب بما نستعمله وحده لا بواجهة المكتبة كاملة: تصريحٌ يدّعي أكثر ممّا
 * جُرِّب يعطي أماناً موهوماً — يمرّ `tsc` على استدعاءٍ لم يره أحد.
 */
declare module 'multicast-dns' {
  type Question = { name?: string; type?: string };
  type Answer = { name: string; type: string; ttl?: number; data: string };

  type Instance = {
    on(event: 'query', handler: (query: { questions?: Question[] }) => void): void;
    on(event: 'error', handler: (error: Error) => void): void;
    removeListener(event: 'query', handler: (query: { questions?: Question[] }) => void): void;
    respond(response: { answers: Answer[] }): void;
    destroy(callback?: () => void): void;
  };

  export default function makeMdns(options?: { loopback?: boolean }): Instance;
}
