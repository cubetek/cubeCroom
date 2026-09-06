import { eq } from 'drizzle-orm';
import type { Db } from '../open.js';
import { aiProviders, aiUsage } from '../schema.js';
import { newId, now } from '../ids.js';

export type AiProvider = typeof aiProviders.$inferSelect;
export type AiProviderStatus = 'connected' | 'error' | 'disconnected';

/**
 * حالة مزوّدي الذكاء الاصطناعي — PRD §11 · SEC-005.
 *
 * **الجدول بلا عمود للمفتاح، وهذا الملف لا يعرف المفتاح إطلاقاً.** ما يُخزَّن
 * هنا: أي مزوّد مربوط، وبأي نموذج، ومتى تحقّقنا منه آخر مرة. أما المفتاح فمشفَّر
 * في خزنة النظام خارج القاعدة — فنسخةٌ احتياطية أو ملف قاعدة مُرسَل إلى الدعم
 * لا يحمل سرّاً.
 */
export function aiRepository(db: Db) {
  return {
    list(): AiProvider[] {
      return db.select().from(aiProviders).all();
    },

    find(provider: string): AiProvider | undefined {
      return db.select().from(aiProviders).where(eq(aiProviders.provider, provider)).get();
    },

    /** يُنشئ صفّ المزوّد أو يحدّثه — الربط حدث يتكرر بتغيير المفتاح. */
    upsert(input: {
      provider: string;
      label: string;
      status: AiProviderStatus;
      defaultModel?: string | null | undefined;
    }): AiProvider {
      const existing = this.find(input.provider);
      const timestamp = now();
      const connectedAt =
        input.status === 'connected' ? (existing?.connectedAt ?? timestamp) : existing?.connectedAt ?? null;

      const row: AiProvider = {
        id: existing?.id ?? newId(),
        provider: input.provider,
        label: input.label,
        defaultModel: input.defaultModel === undefined ? (existing?.defaultModel ?? null) : input.defaultModel,
        status: input.status,
        connectedAt,
        lastCheckedAt: timestamp,
      };

      if (existing === undefined) db.insert(aiProviders).values(row).run();
      else db.update(aiProviders).set(row).where(eq(aiProviders.provider, input.provider)).run();

      return row;
    },

    /**
     * يسجّل نداءً واحداً — US-T13.
     *
     * `tokens` تبقى `null` حين لا يعيدها المزوّد، ولا تُكتب صفراً: الصفر رقمٌ
     * يقرؤه المعلم على أنه «لم يُستهلك شيء»، والحقيقة أننا لا نعرف. والفرق
     * بينهما هو ما يجعل «إن توفّرت» شرطاً حقيقياً لا عبارة تحوّط.
     *
     * ولا يُسجَّل نصّ الطلب ولا نتيجته: السجلّ للاستهلاك لا للمحتوى.
     */
    recordUsage(input: { provider: string; model?: string | null | undefined; tokens?: number | null | undefined }): void {
      db.insert(aiUsage)
        .values({
          id: newId(),
          provider: input.provider,
          model: input.model ?? null,
          requests: 1,
          tokens: input.tokens ?? null,
          occurredAt: now(),
        })
        .run();
    },

    /**
     * ملخّص استهلاك مزوّد.
     * `tokens` تبقى `null` إن لم يعد أي نداء عدداً — فتُخفي الشاشة العمود بدل
     * أن تعرض صفراً لا يعنيه المزوّد.
     */
    usage(provider: string): { requests: number; tokens: number | null; lastUsedAt: Date | null } {
      const rows = db.select().from(aiUsage).where(eq(aiUsage.provider, provider)).all();
      if (rows.length === 0) return { requests: 0, tokens: null, lastUsedAt: null };

      const counted = rows.filter((row) => row.tokens !== null);
      return {
        requests: rows.reduce((sum, row) => sum + row.requests, 0),
        tokens: counted.length === 0 ? null : counted.reduce((sum, row) => sum + (row.tokens ?? 0), 0),
        lastUsedAt: rows.reduce<Date | null>(
          (latest, row) => (latest === null || row.occurredAt > latest ? row.occurredAt : latest),
          null,
        ),
      };
    },

    /**
     * «حذف المفتاح» — يبقى صفّ المزوّد بحالة `disconnected`.
     * حذف الصفّ كان سيمحو النموذج المختار، فيعيد المعلم اختياره بلا سبب.
     */
    disconnect(provider: string): void {
      const existing = this.find(provider);
      if (existing === undefined) return;
      db.update(aiProviders)
        .set({ status: 'disconnected', connectedAt: null, lastCheckedAt: now() })
        .where(eq(aiProviders.provider, provider))
        .run();
    },
  };
}
