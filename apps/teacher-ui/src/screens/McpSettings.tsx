'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Switch } from '@cubecroom/ui';
import type { McpStatus } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * قراءة تطبيقات الذكاء الاصطناعي على هذا الجهاز عبر MCP (D36).
 *
 * التنبيه جزءٌ من المفتاح لا هامشٌ عليه: ما يقرؤه التطبيق يصل إلى نموذج مزوّده هو،
 * لا إلى المزوّد المختار في هذه الشاشة. فيُكتب بجانب المفتاح قبل تشغيله، لا بعده.
 */
export function McpSettings() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await bridge().mcpStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة حالة القراءة لتطبيقات الذكاء الاصطناعي.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // عدد التطبيقات المتصلة يتغيّر من خارج الشاشة، فيُقرأ دورياً ما دام الخادم يعمل.
  const running = status?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setStatus(await bridge().mcpSetEnabled({ enabled }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تغيير الإعداد.');
    } finally {
      setBusy(false);
    }
  };

  const snippet =
    status?.state === 'running'
      ? JSON.stringify(
          { mcpServers: { cubecroom: { command: status.launch.command, args: status.launch.args, env: status.launch.env } } },
          null,
          2,
        )
      : null;

  const copy = async (text: string) => {
    try {
      await bridge().copyText({ text });
      setCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر نسخ الإعداد.');
    }
  };

  return (
    <Card className="gap-2.25 py-4" data-mcp-settings>
      <CardHeader className="px-4.5">
        <CardTitle className="font-bold">تطبيقات الذكاء الاصطناعي على هذا الجهاز</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.25 px-4.5">
        <div className="flex items-center gap-3">
          <span className="grow">
            <span className="block text-t-body font-medium">السماح بالقراءة عبر MCP</span>
            <span className="text-t-caption text-text-muted">
              تطبيق مثل Claude Desktop أو Cursor على هذا الجهاز يقرأ دروسك وأنشطتك ونتائج فصولك، ولا
              يستطيع تغيير شيء.
            </span>
          </span>
          <Switch
            label="السماح لتطبيقات الذكاء الاصطناعي بالقراءة عبر MCP"
            checked={status !== null && status.state !== 'off'}
            disabled={status === null || busy}
            onChange={(next) => void toggle(next)}
          />
        </div>
        <p className="text-t-caption text-text-muted">
          لا تُعطى مفاتيح الإجابة ولا أسماء الطلاب ولا إجاباتهم، والنتائج مجاميع للفصل فقط. وفي فصلٍ صغير
          جداً قد يدلّ المجموع على طالبٍ بعينه. ما يقرؤه التطبيق يصل إلى نموذج الذكاء الاصطناعي الذي
          يستخدمه ذلك التطبيق، مثل Anthropic في Claude Desktop، وفق شروطه، لا إلى المزوّد المختار في هذه
          الصفحة. والإعداد لهذا الجهاز وحده، ولا يدخل النسخ الاحتياطية، ويعمل ما دام CubeCroom مفتوحاً.
        </p>
        {error !== null ? (
          <Alert tone="error" live>
            {error}
          </Alert>
        ) : null}
        {status?.state === 'failed' ? (
          <Alert tone="error" live>
            {status.message}
          </Alert>
        ) : null}
        {status?.state === 'running' && snippet !== null ? (
          <>
            <p className="text-t-body text-text-2">
              أضف هذا الإعداد إلى خوادم MCP في تطبيقك، مثل ‎claude_desktop_config.json في Claude Desktop
              أو ‎.cursor/mcp.json في Cursor، ثم أعد تشغيل التطبيق. فيه مسار CubeCroom على هذا الجهاز،
              فلا يصلح لجهاز آخر.
            </p>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-md border border-input bg-surface-2 p-3 font-mono text-t-caption text-text"
            >
              {snippet}
            </pre>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => void copy(snippet)}>
                {copied ? 'نُسخ الإعداد' : 'نسخ الإعداد'}
              </Button>
              <span className="text-t-caption text-text-muted">
                {status.connections === 0
                  ? 'لا تطبيق متصل الآن.'
                  : `اتصالات مفتوحة الآن: ${status.connections.toLocaleString('ar')}`}
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
