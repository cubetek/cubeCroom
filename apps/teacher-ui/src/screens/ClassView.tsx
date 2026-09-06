'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@cubecroom/ui';
import type { ClassSummary } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { Activities } from './Activities';
import { Lessons } from './Lessons';
import { Requests } from './Requests';
import { StudentAccess } from './StudentAccess';
import { Students } from './Students';

/**
 * قشرة الفصل — التنقّل الداخلي الذي ترسمه ألواح T08 · T09 · T12 · T15.
 *
 * الأقسام الستة بأسمائها من اللوح، وكلها مبنيّة الآن. وما لم يُبنَ منها بعدُ
 * كان يُعرض معطّلاً بسببه المكتوب لا مخفيّاً: إخفاؤه يجعل المعلم يظن أن الفصل
 * ينقصه شيء، وإظهاره عاملاً وهو فارغ أسوأ.
 */

type Section = 'overview' | 'access' | 'requests' | 'students' | 'lessons' | 'activities';

const SECTIONS: ReadonlyArray<{ key: Section; label: string; pending?: string }> = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'access', label: 'تشغيل دخول الطلاب' },
  { key: 'requests', label: 'طلبات الدخول' },
  { key: 'students', label: 'الطلاب' },
  { key: 'lessons', label: 'الدروس والمحتوى' },
  { key: 'activities', label: 'الأنشطة والنتائج' },
];

export type ClassViewProps = {
  readonly row: ClassSummary;
  readonly onBack: () => void;
  /** القسم الذي يُفتح عليه الفصل حين يأتي الفتح من الرئيسية. */
  readonly initialSection?: Section | undefined;
  readonly onOpenAiSettings: () => void;
  readonly onOpenDiagnostics: () => void;
};

export function ClassView({
  row,
  onBack,
  initialSection,
  onOpenAiSettings,
  onOpenDiagnostics,
}: ClassViewProps) {
  const [section, setSection] = useState<Section>(initialSection ?? 'lessons');
  const [studentAi, setStudentAi] = useState(row.studentAiEnabled);
  const [busy, setBusy] = useState(false);
  const [editingLesson, setEditingLesson] = useState(false);

  /** لوحُ قسمٍ واحد — الشرط كما كان، ولا يُركَّب منه إلا المفتوح. */
  const panel = (one: (typeof SECTIONS)[number]): ReactNode =>
    one.key === 'lessons' ? (
      <Lessons classId={row.id} className={row.name} onOpenAiSettings={onOpenAiSettings} onEditorChange={setEditingLesson} />
    ) : one.key === 'access' ? (
      <StudentAccess
        classId={row.id}
        className={row.name}
        onOpenDiagnostics={onOpenDiagnostics}
      />
    ) : one.key === 'overview' ? (
      <div className="min-h-0 max-w-180 grow overflow-auto">
        {/* قرار D10: مفتاح الفصل — والقاطع العام في T19 يبقى فوقه. */}
        <Card>
          <CardHeader>
            <CardTitle className="font-bold">مساعدة الذكاء الاصطناعي لطلاب هذا الفصل</CardTitle>
          </CardHeader>
          {/*
           * `items-start` لا `items-center`: الشرح ثلاثة أسطر على الحاسوب
           * الضيّق، ومفتاحٌ في منتصفها يبتعد عن العنوان الذي يصفه.
           */}
          <CardContent className="flex items-start gap-3.5">
            <p className="grow text-t-body text-text-2">
              مطفأة افتراضياً. حين تفتحها يستطيع طلاب هذا الفصل أن يسألوا عن محتوى دروسه
              المنشورة — وكل سؤال يُحتسب على مفتاحك أنت.
            </p>
            <Switch
              label="مساعدة الذكاء الاصطناعي لطلاب هذا الفصل"
              checked={studentAi}
              disabled={busy}
              onChange={(next) => {
                setStudentAi(next);
                setBusy(true);
                void bridge()
                  .classesStudentAi({ id: row.id, enabled: next })
                  .catch(() => setStudentAi(!next))
                  .finally(() => setBusy(false));
              }}
            />
          </CardContent>
          <CardContent>
            <p className="text-t-caption text-text-muted">
              وإن كان القاطع العام في «الذكاء الاصطناعي» مطفأً فلن تعمل هنا مهما فتحتها.
            </p>
          </CardContent>
        </Card>
      </div>
    ) : one.key === 'requests' ? (
      <Requests classId={row.id} />
    ) : one.key === 'students' ? (
      <Students classId={row.id} />
    ) : one.key === 'activities' ? (
      <Activities classId={row.id} className={row.name} onOpenAiSettings={onOpenAiSettings} />
    ) : (
      <Card className="grow items-center justify-center gap-2.5 text-text-muted">
        <Icon name="clock" size={22} />
        <div>{one.pending ?? 'لم يُبنَ هذا القسم بعد.'}</div>
      </Card>
    );

  return (
    <div className="flex min-h-0 grow flex-col gap-3.5">
      <header className={editingLesson ? 'hidden' : 'flex items-center gap-3.5'}>
        <Button variant="secondary" size="sm" onClick={onBack} icon={<Icon name="chevron-next" size={17} />}>
          الفصول
        </Button>
        <div>
          <h2 className="text-t-h2 font-bold">{row.name}</h2>
          <div className="text-t-label text-text-muted">
            {[row.subject, row.level].filter((part) => part !== null && part !== '').join(' · ') ||
              'بلا مادة أو مستوى'}
          </div>
        </div>
      </header>

      {/*
       * ستة عناوين عربية في صفٍّ واحد — و`TabsList` يمرّرها ولا يقصّها.
       *
       * والتفعيل يدويّ (وهو افتراض `Tabs` هنا): كلّ قسم يفتح نداءً على الجسر
       * عند تركيبه، فمرورُ المعلّم بالأسهم على الصفّ كان — لو كان تلقائياً —
       * يركّب الستّة ويطلق نداءاتها في طريقه.
       */}
      <Tabs
        value={section}
        onValueChange={(next) => setSection(next as Section)}
        className="min-h-0 grow gap-3.5"
      >
        <TabsList aria-label="أقسام الفصل" className={editingLesson ? 'hidden' : undefined}>
          {SECTIONS.map((one) => (
            <TabsTrigger key={one.key} value={one.key}>
              {one.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SECTIONS.map((one) => (
          /*
           * `flex flex-col` على اللوح لا زينة: أقسامُ الفصل كلّها تبدأ بعمودٍ
           * يطلب ارتفاع ما بقي (`grow`) ثمّ يمرّر في مكانه. ولوحٌ كتلـيّ
           * يُبطل ذلك الطلب، فيطول القسم بطول محتواه وتمرّر الصفحة كلّها.
           */
          <TabsContent key={one.key} value={one.key} className="flex min-h-0 flex-col">
            {panel(one)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
