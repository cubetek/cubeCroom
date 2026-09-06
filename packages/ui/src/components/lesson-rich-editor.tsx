'use client';

import { memo, useEffect, useRef, useState } from 'react';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Placeholder from '@tiptap/extension-placeholder';
import { TableMap } from '@tiptap/pm/tables';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Undo2,
  Redo2,
  Link,
  Minus,
  Pilcrow,
  Table,
  ListChecks,
  Blocks,
} from 'lucide-react';
import {
  safeLessonLinkSchema,
  LEARNING_CARD_KINDS,
  LEARNING_CARD_LABELS,
  RICH_TEXT_LIMITS,
  type RichTextDocument,
} from '@cubecroom/contracts';
import { Button } from '#components/button';
import { Input } from '#components/input';
import { Label } from '#components/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#components/dialog';
import { cn } from '#lib/utils';
import { richTextStyles } from '#lib/rich-text-styles';
import { LearningCard } from '#components/learning-card-extension';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '#components/dropdown-menu';

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => safeLessonLinkSchema.safeParse(url).success,
    },
  }),
  LearningCard,
  TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
  TaskList,
  TaskItem.configure({
    nested: true,
    a11y: { checkboxLabel: (node) => `خطوة: ${node.textContent || 'اكتب الخطوة'}` },
  }),
  Placeholder.configure({
    placeholder: 'اكتب الفكرة، أو أضف مثالاً وخطوة للتطبيق…',
    includeChildren: true,
  }),
];

export type LessonRichEditorProps = {
  value: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  label: string;
};

/** Own editor state; parent saves and side panels do not rerender ProseMirror transactions. */
export const LessonRichEditor = memo(function LessonRichEditor({
  value,
  onChange,
  label,
}: LessonRichEditorProps) {
  const emitted = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions,
    content: value as JSONContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    injectCSS: false,
    textDirection: 'rtl',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        dir: 'rtl',
        class: cn(
          richTextStyles,
          'min-h-80 whitespace-pre-wrap px-6 py-4 outline-none sm:px-10 [&:focus-visible]:outline-none',
        ),
      },
    },
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON() as RichTextDocument;
      emitted.current = document;
      change.current(document);
    },
  });

  useEffect(() => {
    if (editor && value !== emitted.current) {
      emitted.current = value;
      editor.commands.setContent(value as JSONContent, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor)
    return (
      <p className="p-8 text-text-muted" role="status">
        نجهّز محرّر الدرس…
      </p>
    );
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface focus-within:border-primary/40">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <p className="border-t border-hairline px-6 py-2 text-xs text-text-muted">
        حرّر المكوّنات مباشرة: العناوين والأمثلة والتدريبات والجداول. يدعم التراجع واختصارات لوحة
        المفاتيح.
      </p>
    </div>
  );
});

function EditorToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      heading2: current.isActive('heading', { level: 2 }),
      heading3: current.isActive('heading', { level: 3 }),
      bullet: current.isActive('bulletList'),
      ordered: current.isActive('orderedList'),
      quote: current.isActive('blockquote'),
      link: current.isActive('link'),
      undo: current.can().undo(),
      redo: current.can().redo(),
      tasks: current.isActive('taskList'),
      table: current.isActive('table'),
      card: current.isActive('learningCard'),
      tableRows: (() => {
        const { $from } = current.state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === 'table') return node.childCount;
        }
        return 0;
      })(),
      tableColumns: (() => {
        const { $from } = current.state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === 'table') return TableMap.get(node).width;
        }
        return 0;
      })(),
    }),
  });
  const actions = [
    { label: 'نص عادي', icon: Pilcrow, run: () => editor.chain().focus().setParagraph().run() },
    {
      label: 'عنوان فرعي',
      icon: Heading2,
      pressed: active.heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'عنوان صغير',
      icon: Heading3,
      pressed: active.heading3,
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: 'عريض',
      icon: Bold,
      pressed: active.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'مائل',
      icon: Italic,
      pressed: active.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'تسطير',
      icon: Underline,
      pressed: active.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'قائمة نقطية',
      icon: List,
      pressed: active.bullet,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'قائمة مرقمة',
      icon: ListOrdered,
      pressed: active.ordered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'خطوات للتطبيق',
      icon: ListChecks,
      pressed: active.tasks,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: 'جدول توضيحي',
      icon: Table,
      pressed: active.table,
      disabled: active.table,
      run: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
    },
    {
      label: 'اقتباس',
      icon: Quote,
      pressed: active.quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    { label: 'فاصل', icon: Minus, run: () => editor.chain().focus().setHorizontalRule().run() },
    {
      label: 'رابط',
      icon: Link,
      pressed: active.link,
      run: () => {
        setUrl(String(editor.getAttributes('link').href ?? ''));
        setError('');
        setLinkOpen(true);
      },
    },
    {
      label: 'تراجع',
      icon: Undo2,
      disabled: !active.undo,
      run: () => editor.chain().focus().undo().run(),
    },
    {
      label: 'إعادة',
      icon: Redo2,
      disabled: !active.redo,
      run: () => editor.chain().focus().redo().run(),
    },
  ];
  const applyLink = () => {
    if (!safeLessonLinkSchema.safeParse(url).success) {
      setError('أدخل رابطًا كاملًا يبدأ بـ https:// أو http:// أو mailto:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkOpen(false);
  };
  return (
    <>
      <div
        role="toolbar"
        aria-label="تنسيق الدرس"
        className="flex flex-wrap gap-1 border-b border-hairline bg-canvas/60 px-3 py-2"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="إدراج مكوّن تعليمي" className="gap-2">
              <Blocks className="size-4" aria-hidden="true" /> مكوّن تعليمي
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {LEARNING_CARD_KINDS.map((kind) => (
              <DropdownMenuItem
                key={kind}
                disabled={active.card || active.table}
                onSelect={() => {
                  editor
                    .chain()
                    .focus()
                    .insertContent([
                      {
                        type: 'learningCard',
                        attrs: { kind, title: LEARNING_CARD_LABELS[kind] },
                        content: [{ type: 'paragraph' }],
                      },
                      { type: 'paragraph' },
                    ])
                    .run();
                }}
              >
                {LEARNING_CARD_LABELS[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {actions.map(({ label, icon: ActionIcon, pressed, disabled, run }) => (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            aria-label={label}
            title={disabled ? `لا تتوفر خطوة ${label}` : label}
            aria-pressed={pressed}
            aria-disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!disabled) run();
            }}
            className={cn(
              'size-9 p-0',
              pressed && 'bg-primary-soft text-primary-on-soft',
              disabled && 'text-text-muted/60',
            )}
          >
            <ActionIcon className="size-4" aria-hidden="true" />
          </Button>
        ))}
      </div>
      {active.table ? (
        <div
          role="toolbar"
          aria-label="تحرير الجدول"
          className="flex flex-wrap gap-2 border-b border-hairline bg-primary-soft/30 px-3 py-2"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={active.tableRows >= RICH_TEXT_LIMITS.tableRows}
            onClick={() => {
              if (active.tableRows < RICH_TEXT_LIMITS.tableRows)
                editor.chain().focus().addRowAfter().run();
            }}
          >
            إضافة صف
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={active.tableColumns >= RICH_TEXT_LIMITS.tableColumns}
            onClick={() => {
              if (active.tableColumns < RICH_TEXT_LIMITS.tableColumns)
                editor.chain().focus().addColumnAfter().run();
            }}
          >
            إضافة عمود
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            حذف الصف
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            حذف العمود
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            إزالة الجدول
          </Button>
        </div>
      ) : null}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة رابط</DialogTitle>
            <DialogDescription>حدّد النص أولًا ثم أدخل عنوان الرابط.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="lesson-link">عنوان الرابط</Label>
          <Input
            id="lesson-link"
            dir="ltr"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-error-text">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setLinkOpen(false);
              }}
            >
              إزالة الرابط
            </Button>
            <Button onClick={applyLink}>تطبيق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
