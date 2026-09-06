import type { ReactNode } from 'react';
import { BookOpen, Lightbulb, PencilLine, CircleHelp, BookmarkCheck } from 'lucide-react';
import { LEARNING_CARD_LABELS, type LearningCardKind } from '@cubecroom/contracts';
import { learningCardStyles, learningCardBodyStyles } from '#lib/learning-card-styles';
import { cn } from '#lib/utils';

const icons = {
  concept: Lightbulb,
  example: BookOpen,
  practice: PencilLine,
  check: CircleHelp,
  takeaway: BookmarkCheck,
};

/** No editor import: used directly during server rendering of the student page. */
export function LearningCardFrame({
  kind,
  title,
  children,
}: {
  kind: LearningCardKind;
  title: ReactNode;
  children: ReactNode;
}) {
  const style = learningCardStyles[kind];
  const Icon = icons[kind];
  return (
    <section
      data-learning-card={kind}
      className={cn('my-6 rounded-xl border p-5 sm:p-6', style.frame)}
    >
      <div contentEditable={false} className="mb-4 flex items-start gap-3">
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', style.icon)}
        >
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('text-xs font-semibold tracking-wide', style.badge)}>
            {LEARNING_CARD_LABELS[kind]}
          </div>
          {typeof title === 'string' ? (
            <h3 className="!mb-0 !mt-1 !text-lg !font-semibold text-text">
              {title || LEARNING_CARD_LABELS[kind]}
            </h3>
          ) : (
            title
          )}
        </div>
      </div>
      <div className={learningCardBodyStyles}>{children}</div>
    </section>
  );
}
