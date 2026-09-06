'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
} from '@cubecroom/ui';
import type { ClassSummary } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T07 — إنشاء فصل وتعديله.
 *
 * حقل واحد إلزامي: «تحتاج الاسم فقط للبدء». والمادة والمستوى حقلا نصّ لا
 * قائمتَي اختيار — اللوح يعرضهما قائمتين لكن المصدر لا يذكر تصنيفاً للمواد
 * ولا للمستويات، واختراع تصنيف يحصر المعلم في خانات لم يطلبها أحد.
 *
 * زر الحفظ يُعطَّل ولا يُخفى أثناء الحفظ، ومعه سببه نصّاً — التعطيل وحده
 * تباينه لا يكفي لحمل المعنى.
 */

export type ClassDialogProps = {
  readonly row: ClassSummary | null;
  readonly onClose: () => void;
  readonly onSaved: (row: ClassSummary, mode: 'create' | 'edit') => void;
};

/** عمودُ حقلٍ واحد: عنوانه فوقه، وشرحه تحته. */
const FIELD = 'flex flex-col gap-1.5';

export function ClassDialog({ row, onClose, onSaved }: ClassDialogProps) {
  const editing = row !== null;
  const [name, setName] = useState(row?.name ?? '');
  const [subject, setSubject] = useState(row?.subject ?? '');
  const [level, setLevel] = useState(row?.level ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const patch = {
      name: name.trim(),
      subject: subject.trim(),
      level: level.trim(),
      description: description.trim(),
    };
    try {
      const saved = editing
        ? await bridge().classesUpdate({ id: row.id, patch })
        : await bridge().classesCreate(patch);
      onSaved(saved, editing ? 'edit' : 'create');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الفصل.');
      setBusy(false);
    }
  };

  return (
    // العنوان نفسه يصير اسم الحوار عند قارئ الشاشة، فلا حاجة إلى `aria-label` يخالفه.
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/*
       * أعرضُ من الحوار المعتاد (٥٢٠px) لأن «المادة» و«المستوى» يقفان في صفّ
       * واحد أدناه: عند العرض الافتراضي يصير لكلٍّ منهما نصفٌ لا يتّسع لمثاله
       * («السادس الابتدائي») فيُقصّ النائب في الحقلين معاً.
       */}
      <DialogContent className="max-w-155">
        <DialogHeader>
          <DialogTitle>{editing ? 'تعديل الفصل' : 'إنشاء فصل'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'التعديل لا يؤثر على طلاب الفصل ولا على دروسه.'
              : 'تحتاج الاسم فقط للبدء — يمكنك إكمال البقية لاحقاً.'}
          </DialogDescription>
        </DialogHeader>

        <div className={FIELD}>
          <Label htmlFor="class-name">
            اسم الفصل <span className="text-error-text">*</span>
          </Label>
          {/*
           * الحدّ الأحمر يأتي من `aria-invalid` لا من صنفٍ ثانٍ: الحقل يعلن
           * خطأه في شجرة الوصول وفي الشاشة بإعلانٍ واحد، فلا يفترقان.
           */}
          <Input
            id="class-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error !== null) setError(null);
            }}
            placeholder="الصف السادس — علوم"
            autoFocus
            aria-invalid={error !== null}
          />
          <p className="text-t-label text-text-muted">
            هذا الاسم يظهر لطلابك عند دخولهم — اجعله واضحاً مثل «الصف السادس — علوم».
          </p>
        </div>

        {/* المادة والمستوى في صفّ واحد: كلاهما كلمة أو كلمتان، وسطران لهما هدرٌ للطول. */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className={FIELD}>
            <Label htmlFor="class-subject">
              المادة <span className={OPTIONAL}>اختياري</span>
            </Label>
            <Input
              id="class-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="علوم"
            />
          </div>
          <div className={FIELD}>
            <Label htmlFor="class-level">
              المستوى <span className={OPTIONAL}>اختياري</span>
            </Label>
            <Input
              id="class-level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              placeholder="السادس الابتدائي"
            />
          </div>
        </div>

        <div className={FIELD}>
          <Label htmlFor="class-description">
            وصف مختصر <span className={OPTIONAL}>اختياري</span>
          </Label>
          <Input
            id="class-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="مثال: حصة العلوم لفصل ٦/أ — الفصل الدراسي الأول."
          />
        </div>

        {error !== null ? (
          <Alert tone="error" live>
            {error}
          </Alert>
        ) : null}

        <p className="flex items-center gap-1.75 text-t-label text-ok-text">
          <Icon name="check-circle" size={15} />
          يُحفظ على هذا الجهاز.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          {busy ? (
            <Button variant="primary" disabled disabledReason="لا تُغلق النافذة الآن.">
              {editing ? 'جارٍ الحفظ…' : 'جارٍ الإنشاء…'}
            </Button>
          ) : name.trim().length < 2 ? (
            <Button variant="primary" disabled disabledReason="اكتب اسم الفصل أولاً.">
              {editing ? 'حفظ التعديل' : 'إنشاء الفصل'}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()}>
              {editing ? 'حفظ التعديل' : 'إنشاء الفصل'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «اختياري» أصغرُ درجةً من عنوانه وأخفُّ وزناً — فلا يُقرأ جزءاً من اسم الحقل.
 * و`font-normal` لازمة: `Label` يحمل وزن ٥٠٠ من رمزه، وهو يرث إلى ابنه.
 */
const OPTIONAL = 'text-t-caption font-normal text-text-muted';
