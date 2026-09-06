import { Fragment, type ReactNode } from 'react';
import { Check, Target, NotebookPen } from 'lucide-react';
import {
  LESSON_SECTIONS,
  LEARNING_CARD_KINDS,
  lessonSectionDocument,
  richTextPlainText,
  safeLessonLinkSchema,
  type LessonBlock,
  type RichTextNode,
} from '@cubecroom/contracts';
import { richTextStyles } from '#lib/rich-text-styles';
import { LearningCardFrame } from '#components/learning-card-frame';
import { cn } from '#lib/utils';

const SECTION_ORDER = { outcomes: 0, content: 1, summary: 2 } as const;
const READING_SECTIONS = [...LESSON_SECTIONS].sort(
  (a, b) => SECTION_ORDER[a.id] - SECTION_ORDER[b.id],
);

function renderNode(node: RichTextNode, key: number): ReactNode {
  const children = node.content?.map(renderNode);
  const dir = node.attrs?.dir ?? 'auto';
  if (node.type === 'text') {
    let text: ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = <strong>{text}</strong>;
      if (mark.type === 'italic') text = <em>{text}</em>;
      if (mark.type === 'strike') text = <s>{text}</s>;
      if (mark.type === 'underline') text = <u>{text}</u>;
      if (mark.type === 'code') text = <code>{text}</code>;
      if (mark.type === 'link' && safeLessonLinkSchema.safeParse(mark.attrs?.href).success) {
        text = (
          <a href={mark.attrs?.href} target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        );
      }
    }
    return <Fragment key={key}>{text}</Fragment>;
  }
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} dir={dir}>
          {children ?? <br />}
        </p>
      );
    case 'heading': {
      const Heading = `h${node.attrs?.level ?? 2}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Heading key={key} dir={dir}>
          {children}
        </Heading>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} dir={node.attrs?.dir ?? 'rtl'}>
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} dir={node.attrs?.dir ?? 'rtl'} start={node.attrs?.start}>
          {children}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'taskList':
      return (
        <ul key={key} data-type="taskList" dir={node.attrs?.dir ?? 'rtl'}>
          {children}
        </ul>
      );
    case 'taskItem':
      return (
        <li key={key} data-type="taskItem" data-checked={node.attrs?.checked === true}>
          <span
            aria-label={node.attrs?.checked ? 'خطوة مؤشّرة في الدرس' : 'خطوة للتطبيق'}
            className="mt-2 inline-flex size-5 shrink-0 items-center justify-center rounded border border-primary/50 text-primary"
          >
            {node.attrs?.checked ? <Check className="size-4" aria-hidden="true" /> : null}
          </span>
          <div className="min-w-0 flex-1">{children}</div>
        </li>
      );
    case 'learningCard': {
      const kind = node.attrs?.kind;
      if (!kind || !LEARNING_CARD_KINDS.includes(kind)) return null;
      return (
        <LearningCardFrame key={key} kind={kind} title={node.attrs?.title ?? ''}>
          {children}
        </LearningCardFrame>
      );
    }
    case 'table':
      return (
        <div key={key} className="tableWrapper" tabIndex={0} role="region" aria-label="جدول توضيحي">
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{children}</tr>;
    case 'tableCell':
    case 'tableHeader': {
      const Cell = node.type === 'tableHeader' ? 'th' : 'td';
      const alignment = node.attrs?.align;
      return (
        <Cell
          key={key}
          dir={dir}
          colSpan={node.attrs?.colspan}
          rowSpan={node.attrs?.rowspan}
          className={
            alignment === 'left'
              ? 'text-left'
              : alignment === 'right'
                ? 'text-right'
                : alignment === 'center'
                  ? 'text-center'
                  : 'text-start'
          }
        >
          {children}
        </Cell>
      );
    }
    case 'blockquote':
      return (
        <blockquote key={key} dir={dir}>
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} dir="ltr">
          <code>{children}</code>
        </pre>
      );
    case 'hardBreak':
      return <br key={key} />;
    case 'horizontalRule':
      return <hr key={key} />;
  }
}

/** Server-renderable reader: no editor runtime or raw HTML reaches the student. */
export function LessonContent({ blocks }: { blocks: readonly LessonBlock[] }) {
  return (
    <div className="space-y-8">
      {READING_SECTIONS.map((section) => {
        const document = lessonSectionDocument(blocks, section.id);
        if (
          richTextPlainText(document).trim() === '' &&
          !document.content.some((node) => node.type === 'horizontalRule')
        )
          return null;
        return (
          <section
            key={section.id}
            aria-label={section.label}
            data-lesson-section={section.id}
            className={cn(
              section.id === 'outcomes' &&
                'rounded-xl border border-primary/20 bg-primary-soft/50 p-5 sm:p-6',
              section.id === 'summary' &&
                'rounded-xl border border-ok-border bg-ok-bg/50 p-5 sm:p-6',
            )}
          >
            {section.id !== 'content' ? (
              <div className="mb-4 flex items-center gap-3">
                {section.id === 'outcomes' ? (
                  <Target className="size-5 text-primary" aria-hidden="true" />
                ) : (
                  <NotebookPen className="size-5 text-ok-text" aria-hidden="true" />
                )}
                <div>
                  <h2 className="text-xl font-bold text-text">{section.label}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {section.id === 'outcomes'
                      ? 'بعد هذا الدرس، تستطيع أن…'
                      : 'الأفكار التي تأخذها معك'}
                  </p>
                </div>
              </div>
            ) : null}
            <div className={richTextStyles}>{document.content.map(renderNode)}</div>
          </section>
        );
      })}
    </div>
  );
}
