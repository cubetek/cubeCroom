/**
 * التعامل مع مفاتيح المزوّدين كنصّ — SEC-005.
 *
 * القاعدة المعلنة: «المفتاح لا يُخزَّن في SQLite ولا يظهر في أي log». هذا
 * الملف يخدم شطرها الثاني: ما يُعرض للمعلم مُقنَّع، وما يُكتب في تشخيص أو
 * رسالة خطأ يمرّ بمِنقاة قبل أن يخرج.
 *
 * التقنيع ليس تجميلاً: لوح `T19AiSettings` ينصّ على «Never display full key»،
 * ومعلمٌ يفتح شاشته أمام صفّه أو يشارك شاشته في اجتماع لا يجوز أن يكشف مفتاحه
 * بذلك.
 */

/**
 * «sk-…4f2a» — بادئة قصيرة وآخر أربعة محارف.
 *
 * الطرفان يكفيان ليتعرّف المعلم على مفتاحه بين مفتاحين، ولا يكفيان لاستعماله
 * ولا لتخمين ما بينهما.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === '') return '';
  if (trimmed.length <= 8) return '•'.repeat(trimmed.length);

  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}

/**
 * هل يبدو هذا النصّ مفتاحاً؟
 *
 * قواعد المزوّدين الثلاثة (PRD §11) تشترك في بادئة معروفة أو طول كبير من
 * محارف المفاتيح. والقاعدة متساهلة عمداً: **حجب نصّ ليس مفتاحاً خسارةُ سطر
 * في سجلّ تشخيص، وتسريب مفتاح خسارةُ حساب المعلم.**
 */
export function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim();
  if (/^(sk|pk|rk)-[A-Za-z0-9_-]{12,}$/.test(trimmed)) return true;
  if (/^AIza[A-Za-z0-9_-]{20,}$/.test(trimmed)) return true;
  return /^[A-Za-z0-9_-]{40,}$/.test(trimmed);
}

/**
 * يمسح ما يشبه المفاتيح من نصّ حرّ قبل كتابته أو عرضه.
 *
 * يُستعمل في «تصدير سجلّات التشخيص» و«التفاصيل التقنية»: كلاهما نصّ يُنسخ
 * ويُرسل إلى الدعم الفني، وهو أخطر مكان قد يمرّ فيه مفتاح.
 */
export function redactSecrets(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{12,}/g, (candidate) =>
    looksLikeSecret(candidate) ? maskKey(candidate) : candidate,
  );
}
