import { app, BrowserWindow, net, protocol, session, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { registerIpc, setAllowedOrigin } from './ipc.js';
import { installCrashHandlers } from './crash.js';
import { killPortal } from './portal.js';
import { closeStore } from './store.js';
import { startAgentScheduler, stopAgentScheduler } from './specialist-agents.js';
import { initializeUpdates, updateState } from './updates/service.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
if (isDev && process.env['CUBECROOM_DEV_HOT_RELOAD'] === '1') {
  process.on('message', message => { if (message === 'cubecroom:dev-restart') app.quit(); });
}
// Windows uses the multi-resolution ICO; Linux and the macOS dock use the PNG.
const appIcon = path.join(
  isDev ? path.join(app.getAppPath(), 'build') : process.resourcesPath,
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);

/** خادم Next في التطوير. في الإنتاج تُقدَّم الحزمة الثابتة عبر بروتوكول app://. */
const DEV_SERVER_ORIGIN = 'http://localhost:3000';
const APP_ORIGIN = 'app://bundle';
const ALLOWED_ORIGIN = isDev ? DEV_SERVER_ORIGIN : APP_ORIGIN;
// Isolated test profiles never share Electron configuration or secrets with the teacher.
if (process.env['CUBECROOM_USER_DATA_DIR']) {
  const profileDirectory = path.resolve(process.env['CUBECROOM_USER_DATA_DIR']);
  mkdirSync(profileDirectory, { recursive: true });
  app.setPath('userData', profileDirectory);
}

/**
 * جذر واجهة المعلم بعد `next build` (output: export).
 * في التطوير: مجلد التطبيق المجاور. بعد التغليف: داخل resources.
 */
function teacherUiRoot(): string {
  return isDev
    ? path.join(dirname, '..', '..', 'teacher-ui', 'out-next')
    // `extraResource` ينسخ المجلد باسمه كما هو — فالاسم هنا هو `out-next`.
    : path.join(process.resourcesPath, 'out-next');
}

/**
 * SEC-002 — سياسة محتوى مقيَّدة.
 * تُفرض من العملية الرئيسية لا من وسم meta، فتغطي التطوير والإنتاج معاً
 * ولا يمكن لصفحة أن تُرخّي شروطها على نفسها.
 */
/**
 * بصمات السكربتات المضمّنة في مخرَج Next.
 *
 * **لماذا هذه الدالة موجودة أصلاً:** `next build` بوضع التصدير يضع في الصفحة
 * سكربتات مضمّنة تحمل حمولة React — وبلاها لا يُركَّب شيء، فتبقى الشاشة بيضاء.
 * وسياسة `script-src 'self'` تمنعها. والحلّ ليس فتح `'unsafe-inline'` — ذلك
 * يسمح بكل سكربت مضمّن، بما فيه ما قد يُحقن يوماً — بل **إدراج بصمة كل سكربت
 * موجود بالاسم**: ما لم نبنِه نحن لا تطابق بصمته، فلا يعمل.
 *
 * وتُحسب عند الإقلاع من الملفات المشحونة لا في خطوة بناء: خطوةٌ تُنسى تترك
 * التطبيق أبيضَ على جهاز المعلم، وهذه تصحّح نفسها مع كل بناء.
 */
function inlineScriptHashes(root: string): string[] {
  const hashes = new Set<string>();
  const inline = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

  const walk = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        const html = readFileSync(full, 'utf8');
        for (const match of html.matchAll(inline)) {
          const body = match[1] ?? '';
          if (body === '') continue;
          hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
        }
      }
    }
  };

  walk(root);
  return [...hashes];
}

let scriptHashes: string[] = [];

function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ` ${scriptHashes.join(' ')}`}`,
    "style-src 'self' 'unsafe-inline'", // CSS Modules تُحقن أنماطاً مضمّنة
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ` ${DEV_SERVER_ORIGIN} ws://localhost:3000` : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// يجب أن يُسجَّل قبل جاهزية التطبيق.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function registerAppProtocol(): void {
  const root = teacherUiRoot();

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    // منع الخروج من جذر الحزمة عبر مسارات نسبية.
    const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
    const target = path.join(root, relative || 'index.html');

    if (!target.startsWith(root)) {
      return new Response('forbidden', { status: 403 });
    }

    const response = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', contentSecurityPolicy());
    return new Response(response.body, { status: response.status, headers });
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    // قاعدة العرض المعتمدة — docs/design/05-foundations.md
    width: 1280,
    height: 800,
    // «يجب أن تبقى العمليات الأساسية usable حتى 1024×768»
    minWidth: 1024,
    minHeight: 768,
    icon: appIcon,
    show: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { color: '#F8FAFC', symbolColor: '#334155', height: 40 } }),
    backgroundColor: '#F8FAFC', // ‎--canvas: يمنع وميض الأبيض قبل أول رسم
    webPreferences: {
      // SEC-001 — الثلاثة معاً، بلا استثناء.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(dirname, 'preload.cjs'),
    },
  });

  // T01: لا تظهر النافذة قبل أن تجهز الواجهة — لا إطار فارغ ولا وميض.
  win.once('ready-to-show', () => win.show());
  win.on('close', (event) => {
    if (updateState().phase === 'preparing') event.preventDefault();
  });

  // SEC-002 — لا انتقال خارج أصل التطبيق، ولا نوافذ جديدة.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ALLOWED_ORIGIN)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // الروابط الخارجية تُفتح في متصفح النظام لا داخل نافذة ذات صلاحيات (SEC-003).
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(isDev ? DEV_SERVER_ORIGIN : `${APP_ORIGIN}/index.html`);
}

// §22: يُركَّب قبل كل شيء — عطلٌ أثناء الإقلاع نفسه يجب أن يُغلق القاعدة.
installCrashHandlers();

void app.whenReady().then(() => {
  // The packaged macOS bundle has its own ICNS; this also brands the development dock.
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
  // تُحسب قبل تسجيل البروتوكول: أول صفحة تُقدَّم تحمل السياسة كاملةً.
  if (!isDev) scriptHashes = inlineScriptHashes(teacherUiRoot());

  registerAppProtocol();
  setAllowedOrigin(ALLOWED_ORIGIN);
  registerIpc();
  startAgentScheduler();
  initializeUpdates();

  // في التطوير تأتي الصفحات من خادم Next، فتُحقن السياسة على استجاباته.
  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [contentSecurityPolicy()],
        },
      });
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// إغلاق نظيف: SQLite في وضع WAL يحتاج إغلاق الاتصال لدمج السجل.
app.on('before-quit', (event) => {
  if (updateState().phase === 'preparing') {
    event.preventDefault();
    return;
  }
  // العملية اليتيمة تُبقي المنفذ محجوزاً بعد إغلاق التطبيق.
  killPortal();
  stopAgentScheduler();
  closeStore();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
