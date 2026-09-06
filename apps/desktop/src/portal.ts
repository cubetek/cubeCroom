import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import { readConfig } from './config.js';
import {
  awaitHttpReady,
  createJoinCode,
  findAvailablePort,
  isOnline,
  lanAddress,
  startHostnameResponder,
  DEFAULT_PORT,
  PortUnavailableError,
  type MdnsResponder,
} from '@cubecroom/core';
import type { PortalStatus } from '@cubecroom/contracts';
import { startInternalChannel, stopInternalChannel } from './internal.js';
import { repositories, storeState } from './store.js';

/**
 * بوابة الطالب: عملية Node مستقلة تُشغَّل وتُوقَف مع الحصة.
 *
 * عملية منفصلة لا خادم داخل Electron (PRD §8: `output: standalone`) — فسقوطها
 * لا يُسقط واجهة المعلم، وإيقافها يُغلق الباب فعلاً لا بحجب المسارات.
 *
 * الاستماع على `0.0.0.0` لا على `127.0.0.1`: الطالب يأتي من جهاز آخر على
 * الشبكة، والربط على العنوان المحلي وحده يجعل الرابط يعمل عند المعلم فقط.
 *
 * الجاهزية تُقاس بطلب حقيقي يردّ، لا بظهور العملية: العملية تحيا قبل أن
 * يصبح الخادم قادراً على الردّ، وإعطاء المعلم رابطاً قبل ذلك يعني طلاباً
 * يفتحونه فيرون خطأ.
 */

type Running = {
  readonly child: ChildProcess;
  readonly port: number;
  readonly startedAt: Date;
  readonly startupMs: number;
  readonly classId: string;
  readonly className: string;
  readonly joinCode: string;
  /** يبقى `null` حين تعذّر إعلان الاسم — والعنوان يعمل على أي حال. */
  readonly hostname: string | null;
};

let running: Running | null = null;
let starting: Promise<PortalStatus> | null = null;
let lastError: string | null = null;

/**
 * إعلان الاسم على الشبكة — يحيا مع الحصة ويموت معها.
 *
 * ولا يُترك بعد إنهائها: اسمٌ يشير إلى خادم أُغلق يعطي الطالب صفحةً لا تُفتح
 * بدل رسالة «انتهت الحصة».
 */
let responder: MdnsResponder | null = null;

/** مسار خادم الطلاب المبنيّ — يختلف بين التطوير والتغليف. */
/**
 * مدخل خادم الطلاب.
 *
 * بعد التغليف يُشحن مجلد `standalone` كاملاً عبر `extraResource`، فيصل باسمه
 * لا بمساره في المستودع — وشجرته الداخلية تبقى كما بناها Next.
 */
function serverEntry(): string {
  const inside = join('apps', 'student-web', 'server.js');
  return app.isPackaged
    ? join(process.resourcesPath, 'standalone', inside)
    : join(app.getAppPath(), '..', '..', 'apps', 'student-web', '.next', 'standalone', inside);
}

function counters(): { admitted: number; waiting: number } {
  if (storeState().status !== 'open') return { admitted: 0, waiting: 0 };
  const sessions = repositories().sessions;
  const active = sessions.active();
  if (active === undefined) return { admitted: 0, waiting: 0 };
  const lastSeen = sessions.lastSeenByStudent(active.id);
  let admitted = 0;
  for (const value of lastSeen.values()) if (isOnline(value)) admitted += 1;
  return { admitted, waiting: sessions.listRequests(active.id, 'pending').length };
}

export function portalStatus(): PortalStatus {
  if (starting !== null) return { state: 'starting' };
  if (running === null) {
    return lastError === null ? { state: 'stopped' } : { state: 'failed', message: lastError };
  }

  const lan = lanAddress();
  if (lan === null) {
    // الخادم يعمل، لكن لا شبكة تصل إليه — حالة T09NoLan بعينها.
    return {
      state: 'unreachable',
      port: running.port,
      startedAt: running.startedAt.toISOString(),
      classId: running.classId,
      className: running.className,
      ...counters(),
      message: 'هذا الجهاز غير متصل بشبكة Wi-Fi',
    };
  }

  return {
    state: 'running',
    address: lan.address,
    adapter: lan.adapter,
    port: running.port,
    url: `http://${lan.address}:${running.port}`,
    joinCode: running.joinCode,
    /*
     * العنوان يبقى المعوَّل عليه، والاسم راحةٌ فوقه.
     *
     * شبكةٌ تمنع البثّ المتعدد لا تُعطّل الحصة — تُعطّل الاسم وحده. ولهذا
     * تعرض الشاشة الاثنين لا الاسم وحده.
     */
    ...(running.hostname === null
      ? {}
      : { friendlyUrl: `http://${running.hostname}:${running.port}` }),
    startedAt: running.startedAt.toISOString(),
    startupMs: running.startupMs,
    classId: running.classId,
    className: running.className,
    ...counters(),
  };
}

export async function startPortal(classId: string): Promise<PortalStatus> {
  if (running !== null) return portalStatus();
  if (starting !== null) return starting;

  starting = launch(classId).finally(() => {
    starting = null;
  });
  return starting;
}

async function launch(classId: string): Promise<PortalStatus> {
  lastError = null;
  const entry = serverEntry();

  try {
    await access(entry);
  } catch {
    lastError = 'تعذّر تشغيل دخول الطلاب على هذا الجهاز. أعد تثبيت التطبيق ثم حاول مرة أخرى.';
    return portalStatus();
  }

  let port: number;
  try {
    /*
     * المنفذ المفضَّل من إعدادات الجهاز — و`findAvailablePort` يتجاوزه إن
     * كان مشغولاً. فاختيارٌ خاطئ يُبطئ الإقلاع ولا يمنع الحصة.
     */
    const preferred = (await readConfig())?.studentPort ?? DEFAULT_PORT;
    port = await findAvailablePort(preferred);
  } catch (error) {
    lastError =
      error instanceof PortUnavailableError
        ? error.message
        : 'تعذّر فتح باب الدخول على هذا الجهاز.';
    return portalStatus();
  }

  const store = storeState();
  if (store.status !== 'open') {
    lastError = 'افتح بياناتك أولاً قبل تشغيل دخول الطلاب.';
    return portalStatus();
  }

  // الحصة تُفتح قبل الخادم: خادمٌ يعمل بلا حصة يعني رابطاً يقود إلى لا شيء.
  const klass = repositories().classes.get(classId);
  const joinCode = createJoinCode();
  repositories().sessions.start(classId, randomBytes(24).toString('base64url'), joinCode);

  // القناة الداخلية تُفتح قبل الابن ليصلها في بيئته — ولا تُعلَن لأحد غيره.
  const internal = await startInternalChannel();

  const began = Date.now();
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      /*
       * **بلا هذا لا يدخل طالب واحد.**
       *
       * `process.execPath` داخل Electron هو ملفّ التطبيق نفسه لا `node`. فبلا
       * هذا المتغيّر يُقلع الأمرُ **نسخةً ثانية من CubeCroom** بدل خادم الطلاب:
       * لا يستمع على المنفذ، ولا يظهر رابط، ولا يصل أحد.
       *
       * ولم يكشفه فحص الدخان لأنه يُقلع الخادم من عملية Node أصلاً — فالفرق
       * بين ما يُفحص وما يُشحن هو موضع العطل بعينه. كشفه أول تشغيل حقيقي.
       */
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
      // خادم الطلاب يقرأ القاعدة نفسها بوضع WAL — لا نسخة ولا جسر بين عمليتين.
      CUBECROOM_DATA_DIR: store.dataDirectory,
      ...(internal === null
        ? {}
        : {
            CUBECROOM_INTERNAL_URL: internal.url,
            CUBECROOM_INTERNAL_SECRET: internal.secret,
          }),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    // يُحتفظ به للتشخيص فقط ولا يُعرض للمعلم — «لا تعرض logs».
    stderr = `${stderr}${String(chunk)}`.slice(-2000);
  });

  let exited = false;
  child.once('exit', () => {
    exited = true;
    if (running?.child === child) running = null;
  });

  /*
   * الجاهزية بتعريفها الواحد في `@cubecroom/core` — هو نفسه الذي يقيس به
   * فحص الدخان الإقلاع. فما يُقاس في الفحص هو ما يحدث للمعلم، لا شيءٌ يشبهه.
   */
  const readyMs = await awaitHttpReady(`http://127.0.0.1:${port}/`, {
    hasExited: () => exited,
  });

  /*
   * **تجاوزُ الميزانية بطءٌ يُقاس، لا فشلٌ يُعلَن.**
   *
   * كان الانتظار يقف عند ثلاث ثوانٍ (`NFR-002`) ويقول للمعلم «لم يبدأ» — فلا
   * يدخل طالب واحد، والخادم يجهز بعد أربعمئة جزء من الألف. وقع ذلك مرتين على
   * جهازٍ مشغول، وكلّف الحصة كلها في كل مرة.
   *
   * والرقم لا يضيع: `startupMs` أدناه يحمله إلى حالة البوابة، فيقرؤه
   * «تشخيص الاتصال». فالمعلم تعمل حصّته، والبطء يبقى مرئياً لمن يبحث عنه.
   */
  if (readyMs === null) {
    child.kill();
    repositories().sessions.endActive();
    lastError =
      'لم يبدأ دخول الطلاب في الوقت المتوقّع. أغلق التطبيق وافتحه من جديد، ' +
      'وإن تكرر الأمر افتح «تشخيص الاتصال».';
    return portalStatus();
  }

  // الاسم يُعلَن بعد أن يردّ الخادم فعلاً: اسمٌ يسبق خادمه يقود إلى لا شيء.
  const announced = lanAddress();
  responder = announced === null ? null : startHostnameResponder(announced.address);

  running = {
    child,
    port,
    startedAt: new Date(),
    startupMs: Date.now() - began,
    classId,
    className: klass.name,
    joinCode,
    hostname: responder?.hostname ?? null,
  };
  return portalStatus();
}

/**
 * «إنهاء دخول الطلاب» — يوقف العملية فعلاً.
 * إبطال جلسات الطلاب يأتي في P2-5؛ هنا يُغلق الباب نفسه.
 */
export async function stopPortal(): Promise<PortalStatus> {
  const current = running;
  running = null;
  lastError = null;
  stopInternalChannel();

  // الاسم يسقط مع الحصة: إعلانٌ باقٍ يقود الطالب إلى باب مغلق.
  await responder?.stop();
  responder = null;

  if (storeState().status === 'open') repositories().sessions.endActive();
  if (current === null) return portalStatus();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      current.child.kill('SIGKILL');
      resolve();
    }, 2000);
    current.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    current.child.kill();
  });

  return portalStatus();
}

/** يُنادى عند إغلاق التطبيق: عملية يتيمة تُبقي المنفذ محجوزاً بعد الإغلاق. */
export function killPortal(): void {
  stopInternalChannel();
  void responder?.stop();
  responder = null;
  running?.child.kill();
  running = null;
}
