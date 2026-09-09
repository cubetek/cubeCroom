'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, ar } from '@cubecroom/ui';
import type { HomeState, RequestRow } from '@cubecroom/contracts';
import { Shell } from '../shell/Shell';
import { useTabs } from '../shell/tabs';
import { Dashboard } from './Dashboard';
import { Classes, type OpenTarget } from './Classes';
import { AiSettings } from './AiSettings';
import { LearningStudio } from './LearningStudio';
import { AgentTeam } from './AgentTeam';
import { Files } from './Files';
import { Settings } from './Settings';
import { Backup } from './Backup';
import { Diagnostics } from './Diagnostics';
import { bridge } from '../lib/bridge';

/**
 * قشرة المعلم بحالتها الحيّة — FR-004 · FR-006.
 *
 * «الحالة مرئية من أي شاشة»: حالة الحصة وعدّاد الطلبات يعيشان هنا لا داخل
 * الرئيسية، فيراهما المعلم وهو في الدروس أو الإعدادات. ومصدرهما نداء واحد
 * يخدم الشريط والبطاقة معاً.
 *
 * كل ثلاث ثوانٍ: طلبٌ يصل أثناء الشرح يجب أن يظهر بلا أن يبحث المعلم عن زرّ
 * تحديث — والمصدر يشترط أن يظهر «فوراً دون تغيير الصفحة».
 */

const EMPTY: HomeState = { session: null, requests: [], classes: [], lastBackupAt: null };

export function Home({ teacherName }: { teacherName: string }) {
  /*
   * الوجهة صارت تبويباً — و`active` و`openTarget` تُشتقّان منه.
   *
   * الاسمان باقيان كما كانا، والشاشات أدناه تقرؤهما كما كانت: نموذج التبويبات
   * يعيش في القشرة، ولا تعرف به شاشةٌ واحدة.
   */
  const tabs = useTabs();
  const active = tabs.active.nav;
  const openTarget = tabs.active.target;

  const [home, setHome] = useState<HomeState>(EMPTY);
  const [aiConnected, setAiConnected] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  useEffect(() => {
    void bridge()
      .aiActiveModel()
      .then((model) => setAiConnected(model !== null))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setHome(await bridge().homeState());
    } catch {
      // انقطاع لحظي مع العملية الرئيسية: تبقى الحالة السابقة معروضة، ولا
      // تُمسح الشاشة برسالة خطأ لا يملك المعلم حيالها شيئاً وسط الحصة.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (row: RequestRow, decision: 'approve' | 'reject') => {
    setBusyRequestId(row.id);
    try {
      await bridge().requestDecide({ id: row.id, decision });
      await load();
    } catch {
      await load();
    } finally {
      setBusyRequestId(null);
    }
  };

  const endSession = async () => {
    try {
      await bridge().portalStop();
    } finally {
      await load();
    }
  };

  /*
   * اسم الفصل يُلتمس من الحالة المحمَّلة — وهو عنوان التبويب وكسرُ مساره.
   * وحين لا يوجد (فصلٌ أُنشئ للتوّ ولم تصل الحالة بعد) يُستعمل «فصل» بدل
   * تبويبٍ بلا عنوان: الاسم يصحّ عند أول تحديث بعد ثوانٍ.
   */
  const openClass = (classId: string, section: OpenTarget['section']) => {
    const name = home.classes.find((one) => one.id === classId)?.name ?? 'فصل';
    tabs.openClass(classId, section, name);
  };

  return (
    <Shell
      tabs={tabs}
      home={home}
      aiConnected={aiConnected}
      teacherName={`أ. ${teacherName}`}
      topbarExtra={
        <button
          type="button"
          className="relative flex size-8 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface text-text-2 hover:bg-surface-2"
          aria-label={`طلبات بانتظار الموافقة: ${home.requests.length}`}
          onClick={() => {
            if (home.session !== null) openClass(home.session.classId, 'requests');
          }}
        >
          <Icon name="bell" size={17} />
          {home.requests.length > 0 ? (
            /*
             * عدّاد الطلبات بلون التنبيه لا الخطر: الطلب المعلّق ليس عطلاً.
             *
             * والأبيض من `--color-surface` لا من لوحة Tailwind العامّة — وهو
             * نفسه الطرف الذي قِيست عليه 5.02:1 المكتوبة بجانب `--color-warning`.
             */
            <span className="absolute -top-1.25 -end-1.25 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-warning px-1 text-t-caption font-bold text-surface">
              {ar(home.requests.length)}
            </span>
          ) : null}
        </button>
      }
    >
      {active === 'home' ? (
        <Dashboard
          home={home}
          onOpenClass={openClass}
          onGoToClasses={() => tabs.openNav('classes')}
          onOpenBackup={() => tabs.openNav('backup')}
          onDecide={(row, decision) => void decide(row, decision)}
          onEndSession={() => void endSession()}
          busyRequestId={busyRequestId}
        />
      ) : active === 'classes' ? (
        <Classes
          openTarget={openTarget}
          // «رجوع» من شاشة الفصل يغلق تبويبه ويُركّز جاره — دلالةُ التبويب نفسها.
          onOpened={() => tabs.close(tabs.activeId)}
          onOpenAiSettings={() => tabs.openNav('ai')}
          onOpenDiagnostics={() => tabs.openNav('diagnostics')}
        />
      ) : active === 'files' ? (
        <Files />
      ) : active === 'learning' ? (
        <LearningStudio onOpenAgents={() => tabs.openNav('agents')} />
      ) : active === 'agents' ? (
        <AgentTeam onOpenLearning={() => tabs.openNav('learning')} />
      ) : active === 'ai' ? (
        <AiSettings onConnectionChange={setAiConnected} />
      ) : active === 'settings' ? (
        <Settings />
      ) : active === 'backup' ? (
        <Backup />
      ) : active === 'diagnostics' ? (
        <Diagnostics
          onOpenAccess={() => {
            // «تشغيل دخول الطلاب» يعيش في شاشة الفصل — والتشخيص يوصل إليه
            // لا يكرّره: زرّان يشغّلان الحصة من مكانين يفترقان يوماً.
            const target = home.session?.classId ?? home.classes[0]?.id;
            if (target !== undefined) openClass(target, 'access');
            else tabs.openNav('classes');
          }}
        />
      ) : (
        <div className="flex grow flex-col items-center justify-center gap-2.5 rounded-lg border border-hairline bg-surface text-text-muted">
          <Icon name="pencil" size={22} />
          <div>هذا القسم لم يُبنَ بعد — التصميم جاهز في لوح الشاشات.</div>
        </div>
      )}
    </Shell>
  );
}
