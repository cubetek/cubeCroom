/**
 * تصنيف الملف من امتداده.
 *
 * التسميات منقولة حرفياً من لوحَي `T13Upload` و`T18Files`: «مستند PDF» و«صورة»
 * و«مقطع فيديو» و«مستند». والفئات الثلاث `document · image · clip` هي شرائح
 * الترشيح في T18 نفسها («مستندات · صور · مقاطع»)، فلا فئة رابعة مخترَعة هنا.
 *
 * الامتداد لا النوع المُعلن: لا نثق بما يقوله النظام عن ملف اختاره المعلم،
 * ونوعُ المحتوى يُشتق مما نعرفه نحن. وما لا نعرفه يبقى `other` بلا تخمين.
 */

export type FileCategory = 'document' | 'image' | 'clip' | 'other';

export type FileClassification = {
  /** الامتداد بلا نقطة، بحروف صغيرة — فارغ إن لم يكن للملف امتداد صالح. */
  readonly extension: string;
  /** الشارة المعروضة في الجدول: PDF · PNG · MP4. */
  readonly badge: string;
  /** النوع المقروء للإنسان — يُخزَّن في عمود `kind`. */
  readonly kind: string;
  readonly category: FileCategory;
  readonly mimeType: string;
};

type Entry = { kind: string; category: FileCategory; mimeType: string };

const TABLE: Readonly<Record<string, Entry>> = {
  pdf: { kind: 'مستند PDF', category: 'document', mimeType: 'application/pdf' },

  doc: { kind: 'مستند', category: 'document', mimeType: 'application/msword' },
  docx: {
    kind: 'مستند',
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  odt: { kind: 'مستند', category: 'document', mimeType: 'application/vnd.oasis.opendocument.text' },
  rtf: { kind: 'مستند', category: 'document', mimeType: 'application/rtf' },
  txt: { kind: 'مستند', category: 'document', mimeType: 'text/plain' },
  md: { kind: 'مستند', category: 'document', mimeType: 'text/markdown' },
  ppt: { kind: 'عرض تقديمي', category: 'document', mimeType: 'application/vnd.ms-powerpoint' },
  pptx: {
    kind: 'عرض تقديمي',
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  xls: { kind: 'جدول بيانات', category: 'document', mimeType: 'application/vnd.ms-excel' },
  xlsx: {
    kind: 'جدول بيانات',
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },

  png: { kind: 'صورة', category: 'image', mimeType: 'image/png' },
  jpg: { kind: 'صورة', category: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'صورة', category: 'image', mimeType: 'image/jpeg' },
  gif: { kind: 'صورة', category: 'image', mimeType: 'image/gif' },
  webp: { kind: 'صورة', category: 'image', mimeType: 'image/webp' },
  bmp: { kind: 'صورة', category: 'image', mimeType: 'image/bmp' },
  // SVG صورة تُعرض، لكنها مستند برمجي قابل للتنفيذ داخل المتصفح.
  // تُصنَّف صورةً هنا، وتقديمها للطالب يبقى مسؤولية طبقة الخدمة (Phase 3).
  svg: { kind: 'صورة', category: 'image', mimeType: 'image/svg+xml' },

  mp4: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/mp4' },
  m4v: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/mp4' },
  mov: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/quicktime' },
  webm: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/webm' },
  mkv: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/x-matroska' },
  avi: { kind: 'مقطع فيديو', category: 'clip', mimeType: 'video/x-msvideo' },

  mp3: { kind: 'مقطع صوتي', category: 'clip', mimeType: 'audio/mpeg' },
  m4a: { kind: 'مقطع صوتي', category: 'clip', mimeType: 'audio/mp4' },
  wav: { kind: 'مقطع صوتي', category: 'clip', mimeType: 'audio/wav' },
  ogg: { kind: 'مقطع صوتي', category: 'clip', mimeType: 'audio/ogg' },
};

const UNKNOWN: Entry = { kind: 'ملف', category: 'other', mimeType: 'application/octet-stream' };

/**
 * الامتداد وحده — بلا مسار ولا اسم.
 * يقبل حروفاً وأرقاماً لاتينية فقط وبطول معقول، فلا يتسلّل إلى اسم التخزين
 * ما ليس امتداداً (نقاط متتالية، فواصل مسارات، محارف تحكّم).
 */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  const raw = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(raw) ? raw : '';
}

export function classify(fileName: string): FileClassification {
  const extension = extensionOf(fileName);
  const entry = TABLE[extension] ?? UNKNOWN;
  return {
    extension,
    badge: extension === '' ? 'ملف' : extension.toUpperCase(),
    kind: entry.kind,
    category: entry.category,
    mimeType: entry.mimeType,
  };
}
