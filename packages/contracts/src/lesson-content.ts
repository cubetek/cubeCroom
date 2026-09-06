import {
  LESSON_SECTIONS,
  lessonBlockSchema,
  type LessonBlock,
  type LessonSection,
} from './lessons.js';
import { richTextPlainText, type RichTextDocument, type RichTextNode } from './rich-text.js';

export function readLessonBlocks(raw: unknown): LessonBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((block) => {
    const result = lessonBlockSchema.safeParse(block);
    return result.success ? [result.data] : [];
  });
}

export function lessonBlockText(block: LessonBlock): string {
  return block.type === 'richText'
    ? richTextPlainText(block.document)
    : block.type === 'list'
      ? block.items.join('\n')
      : block.text;
}

export function lessonContentText(title: string, blocks: readonly LessonBlock[]): string {
  return [
    title,
    ...LESSON_SECTIONS.flatMap((section) => {
      const text = blocks
        .filter((block) => (block.section ?? 'content') === section.id)
        .map(lessonBlockText)
        .filter((part) => part.trim() !== '');
      return text.length === 0 ? [] : [section.label, ...text];
    }),
  ]
    .filter((part) => part.trim() !== '')
    .join('\n\n');
}

export function lessonExcerpt(raw: unknown): string {
  const blocks = readLessonBlocks(raw);
  const text =
    blocks
      .filter((block) => (block.section ?? 'content') === 'content' && block.type !== 'heading')
      .map(lessonBlockText)
      .find((part) => part.trim() !== '')
      ?.trim() ?? '';
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function inlineText(text: string): RichTextNode[] {
  return text
    .split('\n')
    .flatMap((line, index) => [
      ...(index > 0 ? [{ type: 'hardBreak' as const }] : []),
      ...(line !== '' ? [{ type: 'text' as const, text: line }] : []),
    ]);
}

/** Legacy lessons are converted in memory; opening them never rewrites stored data. */
export function lessonSectionDocument(
  blocks: readonly LessonBlock[],
  section: LessonSection,
): RichTextDocument {
  const selected = blocks.filter((block) => (block.section ?? 'content') === section);
  if (selected.length === 1 && selected[0]?.type === 'richText') return selected[0].document;
  const content: RichTextNode[] = selected.flatMap((block): RichTextNode[] => {
    if (block.type === 'richText') return block.document.content;
    if (block.type === 'heading')
      return [{ type: 'heading', attrs: { level: 2 }, content: inlineText(block.text) }];
    if (block.type === 'paragraph') return [{ type: 'paragraph', content: inlineText(block.text) }];
    return [
      {
        type: 'bulletList',
        content: block.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineText(item) }],
        })),
      },
    ];
  });
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

export function replaceLessonSection(
  blocks: readonly LessonBlock[],
  section: LessonSection,
  document: RichTextDocument,
): LessonBlock[] {
  return [
    ...blocks.filter((block) => (block.section ?? 'content') !== section),
    { type: 'richText', section, document },
  ];
}
