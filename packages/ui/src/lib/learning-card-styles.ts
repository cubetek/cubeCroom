import type { LearningCardKind } from '@cubecroom/contracts';

/** Semantic appearances shared by editor node views and the static student reader. */
export const learningCardStyles: Readonly<
  Record<
    LearningCardKind,
    {
      frame: string;
      badge: string;
      icon: string;
    }
  >
> = {
  concept: {
    frame: 'border-primary/25 border-s-4 border-s-primary bg-primary-soft/60',
    badge: 'text-primary-on-soft',
    icon: 'bg-primary text-primary-foreground',
  },
  example: {
    frame: 'border-hairline bg-surface-2/60',
    badge: 'text-text-2',
    icon: 'bg-surface text-primary',
  },
  practice: {
    frame: 'border-pending-border border-dashed bg-pending-bg/50',
    badge: 'text-pending-text',
    icon: 'bg-pending-bg text-pending-text',
  },
  check: {
    frame: 'border-ai-border bg-ai-bg/50',
    badge: 'text-ai-text',
    icon: 'bg-ai text-white',
  },
  takeaway: {
    frame: 'border-ok-border border-s-4 border-s-success bg-ok-bg/60',
    badge: 'text-ok-text',
    icon: 'bg-success text-white',
  },
};

export const learningCardBodyStyles = 'min-w-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0';
