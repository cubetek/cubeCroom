import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { awaitHttpReady, median } from '@cubecroom/core';

/**
 * تشغيل خادم الطلاب للأدوات — تعريفٌ واحد لفحص الدخان واختبار الحِمل.
 *
 * كان الملفّان يحملان نسختين من الشيء نفسه: مسار المخرَج، وبيئة التشغيل،
 * وانتظار الجاهزية. وثلاث نسخ من «متى يجهز الخادم؟» تعني ثلاثة أجوبة تتباعد
 * بصمت — وقد تباعدت فعلاً: ٦٠ms في الإنتاج، و٢٠٠ms هنا، و٣٠٠ms هناك.
 *
 * **وما يُشغَّل هنا هو ما يُشحن**: مجلد `standalone` نفسه الذي يدخل الحزمة،
 * لا شيفرة المصدر. فالفرق بين ما يُفحص وما يُشحن هو موضع العطل بعينه —
 * وقد وقع من قبل.
 */

/** مدخل الخادم المبنيّ. */
export function studentServerEntry(root) {
  return join(root, 'apps', 'student-web', '.next', 'standalone', 'apps', 'student-web', 'server.js');
}

/** يتأكد أن البناء جرى — ورسالةٌ تقول ماذا يفعل، لا «ملف غير موجود». */
export async function assertBuilt(entry) {
  try {
    await access(entry);
  } catch {
    console.error(`مخرَج standalone غير موجود: ${entry}\nشغّل \`pnpm build\` أولاً.`);
    process.exit(1);
  }
}

/**
 * يُقلع الخادم ويجمع `stderr` للتشخيص.
 *
 * `stderr` يُحتفظ به ولا يُعرض إلا عند الفشل: نجاحٌ يطبع سجلّات يُغرق ما
 * يُقرأ فعلاً.
 */
export function spawnStudentServer({ entry, port, dataDirectory, host = '127.0.0.1' }) {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: host,
      CUBECROOM_DATA_DIR: dataDirectory,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const collected = { stderr: '' };
  child.stderr.on('data', (chunk) => {
    collected.stderr = `${collected.stderr}${String(chunk)}`.slice(-4000);
  });

  let exited = false;
  child.once('exit', () => {
    exited = true;
  });

  return {
    child,
    hasExited: () => exited,
    stderr: () => collected.stderr,
    /** يوقفه وينتظر موته فعلاً — فلا تتصادم محاولةٌ تالية على المنفذ نفسه. */
    stop: () =>
      new Promise((resolve) => {
        if (exited) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      }),
  };
}

/** ينتظر جاهزية خادمٍ يعمل — بمهلة الأدوات لا بميزانية NFR-002. */
export async function awaitStudentServer(port, hasExited, timeoutMs = 30_000) {
  return awaitHttpReady(`http://127.0.0.1:${port}/`, { timeoutMs, hasExited });
}

/**
 * يقيس زمن الإقلاع **بوسيط عدّة محاولات** لا بعيّنة واحدة.
 *
 * **ولماذا الوسيط:** أول إقلاع بارد على جهازٍ مشغول — بعد تغليفٍ وتشغيلتَي
 * Electron ومتصفّح — يقفز إلى ثلاثة أضعاف المعتاد. فكان حارس NFR-002 يسقط
 * حين يُشغَّل بعد الفحص البصريّ مباشرة، ويمرّ وحده. وحارسٌ يسقط بلا سبب
 * يُعطَّل بعد ثالث مرة، فيصير كأنه غير موجود.
 *
 * والوسيط لا المتوسّط: عيّنةٌ شاذّة واحدة تجرّ المتوسّط ولا تحرّك الوسيط.
 * والعيّنات كلّها تُعاد ليقرأها من يفحص — لا الوسيط وحده: تراجعٌ حقيقيّ
 * يُبطئ الثلاث معاً، وضجيجُ جهازٍ يُبطئ واحدة.
 */
export async function measureStartup({ entry, dataDirectory, port, attempts = 3 }) {
  const samples = [];
  let lastError = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const server = spawnStudentServer({ entry, port, dataDirectory });
    const ms = await awaitStudentServer(port, server.hasExited);
    if (ms === null) lastError = server.stderr();
    else samples.push(ms);
    await server.stop();
  }

  return { samples, median: median(samples), lastError };
}
