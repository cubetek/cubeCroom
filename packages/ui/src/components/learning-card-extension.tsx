'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import {
  LEARNING_CARD_KINDS,
  LEARNING_CARD_LABELS,
  RICH_TEXT_LIMITS,
  type LearningCardKind,
} from '@cubecroom/contracts';
import { Input } from '#components/input';
import { LearningCardFrame } from '#components/learning-card-frame';
import { cn } from '#lib/utils';

function kindOf(value: unknown): LearningCardKind {
  return LEARNING_CARD_KINDS.includes(value as LearningCardKind)
    ? (value as LearningCardKind)
    : 'concept';
}

function LearningCardView({ node, updateAttributes, selected }: NodeViewProps) {
  const kind = kindOf(node.attrs.kind);
  return (
    <NodeViewWrapper className={cn('rounded-xl', selected && 'ring-2 ring-primary/40')}>
      <LearningCardFrame
        kind={kind}
        title={
          <Input
            aria-label={`عنوان ${LEARNING_CARD_LABELS[kind]}`}
            value={String(node.attrs.title ?? '')}
            maxLength={RICH_TEXT_LIMITS.cardTitle}
            placeholder={LEARNING_CARD_LABELS[kind]}
            onChange={(event) => updateAttributes({ title: event.target.value })}
            className="mt-1 h-auto border-transparent bg-transparent px-0 py-0 text-lg font-semibold shadow-none focus-visible:border-primary/30"
          />
        }
      >
        <NodeViewContent className="min-h-12" />
      </LearningCardFrame>
    </NodeViewWrapper>
  );
}

export const LearningCard = Node.create({
  name: 'learningCard',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      kind: {
        default: 'concept',
        parseHTML: (element) => kindOf(element.getAttribute('data-learning-card')),
        renderHTML: (attributes) => ({ 'data-learning-card': kindOf(attributes.kind) }),
      },
      title: {
        default: '',
        parseHTML: (element) =>
          (element.getAttribute('data-title') ?? '').slice(0, RICH_TEXT_LIMITS.cardTitle),
        renderHTML: (attributes) => ({ 'data-title': String(attributes.title ?? '') }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-learning-card]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LearningCardView);
  },
});
