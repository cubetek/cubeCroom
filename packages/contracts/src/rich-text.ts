import { z } from 'zod';

export const safeLessonLinkSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'استخدم رابطًا يبدأ بـ https:// أو http:// أو mailto:.');

const markSchema = z
  .object({
    type: z.enum(['bold', 'italic', 'strike', 'underline', 'code', 'link']),
    attrs: z.object({ href: safeLessonLinkSchema }).optional(),
  })
  .refine((mark) => mark.type !== 'link' || mark.attrs !== undefined);

export type RichTextMark = z.infer<typeof markSchema>;
export const LEARNING_CARD_KINDS = ['concept', 'example', 'practice', 'check', 'takeaway'] as const;
export type LearningCardKind = (typeof LEARNING_CARD_KINDS)[number];
export const LEARNING_CARD_LABELS: Readonly<Record<LearningCardKind, string>> = {
  concept: 'الفكرة الأساسية',
  example: 'مثال يوضّح الفكرة',
  practice: 'جرّب بنفسك',
  check: 'تحقق من فهمك',
  takeaway: 'تذكّر',
};
export const RICH_TEXT_LIMITS = { tableRows: 40, tableColumns: 12, cardTitle: 160 } as const;
export type RichTextNode = {
  type:
    | 'paragraph'
    | 'heading'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'blockquote'
    | 'codeBlock'
    | 'horizontalRule'
    | 'text'
    | 'hardBreak'
    | 'learningCard'
    | 'table'
    | 'tableRow'
    | 'tableHeader'
    | 'tableCell'
    | 'taskList'
    | 'taskItem';
  text?: string | undefined;
  attrs?:
    | {
        level?: number | undefined;
        start?: number | undefined;
        dir?: 'rtl' | 'ltr' | 'auto' | null | undefined;
        language?: string | null | undefined;
        kind?: LearningCardKind | undefined;
        title?: string | undefined;
        checked?: boolean | undefined;
        colspan?: number | undefined;
        rowspan?: number | undefined;
        colwidth?: number[] | null | undefined;
        align?: 'left' | 'center' | 'right' | null | undefined;
      }
    | undefined;
  marks?: RichTextMark[] | undefined;
  content?: RichTextNode[] | undefined;
};
export type RichTextDocument = { type: 'doc'; content: RichTextNode[] };

const isInline = (node: RichTextNode) => node.type === 'text' || node.type === 'hardBreak';
const isBlock = (node: RichTextNode) =>
  !isInline(node) &&
  !['listItem', 'taskItem', 'tableRow', 'tableCell', 'tableHeader'].includes(node.type);
const NODE_ATTRIBUTES: Partial<Record<RichTextNode['type'], readonly string[]>> = {
  heading: ['level'],
  orderedList: ['start'],
  codeBlock: ['language'],
  learningCard: ['kind', 'title'],
  taskItem: ['checked'],
  tableCell: ['colspan', 'rowspan', 'colwidth', 'align'],
  tableHeader: ['colspan', 'rowspan', 'colwidth', 'align'],
};

/** Verify a bounded rectangular grid, including merged cells, before rendering native tables. */
function validTable(rows: RichTextNode[]): boolean {
  if (rows.length === 0 || rows.length > RICH_TEXT_LIMITS.tableRows) return false;
  const grid: boolean[][] = Array.from({ length: rows.length }, () => []);
  for (let row = 0; row < rows.length; row++) {
    let column = 0;
    for (const cell of rows[row]?.content ?? []) {
      while (grid[row]?.[column]) column++;
      const width = cell.attrs?.colspan ?? 1;
      const height = cell.attrs?.rowspan ?? 1;
      if (column + width > RICH_TEXT_LIMITS.tableColumns || row + height > rows.length)
        return false;
      for (let y = row; y < row + height; y++) {
        for (let x = column; x < column + width; x++) {
          if (grid[y]?.[x]) return false;
          grid[y]![x] = true;
        }
      }
      column += width;
    }
  }
  const columns = grid[0]?.length ?? 0;
  return (
    columns > 0 && grid.every((row) => row.length === columns && Array.from(row).every(Boolean))
  );
}

function validChildren(node: RichTextNode, children: RichTextNode[]): boolean {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' && node.text.length > 0 && children.length === 0;
    case 'hardBreak':
    case 'horizontalRule':
      return children.length === 0;
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
      return children.every(isInline);
    case 'bulletList':
    case 'orderedList':
      return children.length > 0 && children.every((child) => child.type === 'listItem');
    case 'taskList':
      return children.length > 0 && children.every((child) => child.type === 'taskItem');
    case 'table':
      return children.every((child) => child.type === 'tableRow') && validTable(children);
    case 'tableRow':
      return (
        children.length <= RICH_TEXT_LIMITS.tableColumns &&
        children.every((child) => ['tableCell', 'tableHeader'].includes(child.type))
      );
    default:
      return children.length > 0 && children.every(isBlock);
  }
}

const nodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'paragraph',
        'heading',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'horizontalRule',
        'text',
        'hardBreak',
        'learningCard',
        'table',
        'tableRow',
        'tableHeader',
        'tableCell',
        'taskList',
        'taskItem',
      ]),
      text: z.string().max(50_000).optional(),
      attrs: z
        .object({
          level: z.number().int().min(1).max(6).optional(),
          start: z.number().int().min(1).max(1_000_000).optional(),
          dir: z.enum(['rtl', 'ltr', 'auto']).nullable().optional(),
          language: z.string().max(100).nullable().optional(),
          kind: z.enum(LEARNING_CARD_KINDS).optional(),
          title: z.string().trim().max(RICH_TEXT_LIMITS.cardTitle).optional(),
          checked: z.boolean().optional(),
          colspan: z.number().int().min(1).max(RICH_TEXT_LIMITS.tableColumns).optional(),
          rowspan: z.number().int().min(1).max(RICH_TEXT_LIMITS.tableRows).optional(),
          colwidth: z
            .array(z.number().int().min(0).max(1200))
            .max(RICH_TEXT_LIMITS.tableColumns)
            .nullable()
            .optional(),
          align: z.enum(['left', 'center', 'right']).nullable().optional(),
        })
        .optional(),
      marks: z.array(markSchema).max(6).optional(),
      content: z.array(nodeSchema).max(500).optional(),
    })
    .superRefine((node, ctx) => {
      const children = node.content ?? [];
      if (!validChildren(node, children))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'بنية محتوى الدرس غير صالحة.' });
      if (node.type !== 'text' && node.text !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'النص يوضع داخل عقدة نصية.' });
      if (node.marks?.length && !isInline(node))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'التنسيق يطبّق على النص فقط.' });
      if (
        Object.keys(node.attrs ?? {}).some(
          (key) => key !== 'dir' && !NODE_ATTRIBUTES[node.type]?.includes(key),
        )
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'خصائص لا تطابق نوع المحتوى.' });
      if (
        node.type === 'learningCard' &&
        (!node.attrs?.kind || typeof node.attrs.title !== 'string')
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'حدّد نوع المكوّن التعليمي وعنوانه.',
        });
      if (
        node.type === 'taskItem' &&
        (typeof node.attrs?.checked !== 'boolean' || children[0]?.type !== 'paragraph')
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'بنية خطوة التدريب غير صالحة.' });
      if (node.type === 'listItem' && children[0]?.type !== 'paragraph')
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'عنصر القائمة يبدأ بفقرة.' });
      if (
        ['tableHeader', 'tableCell'].includes(node.type) &&
        node.attrs?.colwidth &&
        node.attrs.colwidth.length !== (node.attrs.colspan ?? 1)
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'عرض الأعمدة لا يطابق الخلية.' });
    }),
);

// Bound depth and total work before recursive parsing of IPC/backup content.
const boundedTree = z.unknown().superRefine((value, ctx) => {
  const stack = [{ value, depth: 0, card: false, table: false }];
  let nodes = 0;
  let characters = 0;
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (++nodes > 6000 || entry.depth > 12 || characters > 250_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'محتوى القسم أكبر أو أعمق من الحد المسموح.',
      });
      return;
    }
    if (typeof entry.value !== 'object' || entry.value === null) continue;
    const node = entry.value as {
      type?: unknown;
      attrs?: { title?: unknown };
      text?: unknown;
      content?: unknown;
    };
    if ((node.type === 'learningCard' && entry.card) || (node.type === 'table' && entry.table)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'لا يمكن تداخل المكوّنات التعليمية أو الجداول داخل نفسها.',
      });
      return;
    }
    if (typeof node.text === 'string') characters += node.text.length;
    if (typeof node.attrs?.title === 'string') characters += node.attrs.title.length;
    if (Array.isArray(node.content)) {
      if (node.content.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'عدد فقرات القسم أكبر من الحد المسموح.',
        });
        return;
      }
      for (const child of node.content)
        stack.push({
          value: child,
          depth: entry.depth + 1,
          card: entry.card || node.type === 'learningCard',
          table: entry.table || node.type === 'table',
        });
    }
  }
  if (characters > 250_000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'محتوى القسم طويل جدًا.' });
});

export const richTextDocumentSchema = boundedTree.pipe(
  z.object({
    type: z.literal('doc'),
    content: z
      .array(nodeSchema)
      .max(500)
      .refine((nodes) => nodes.every(isBlock)),
  }),
);

export function richTextPlainText(document: RichTextDocument): string {
  const text = (node: RichTextNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'learningCard')
      return [
        node.attrs?.title || LEARNING_CARD_LABELS[node.attrs?.kind ?? 'concept'],
        ...(node.content ?? []).map(text),
      ].join('\n');
    if (node.type === 'tableRow') return (node.content ?? []).map(text).join(' | ');
    if (node.type === 'taskItem')
      return `${node.attrs?.checked ? '☑' : '☐'} ${(node.content ?? []).map(text).join('\n')}`;
    const separator = ['paragraph', 'heading', 'codeBlock'].includes(node.type) ? '' : '\n';
    return (node.content ?? []).map(text).join(separator);
  };
  return document.content.map(text).join('\n\n');
}
