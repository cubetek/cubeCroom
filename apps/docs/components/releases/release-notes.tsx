'use client';

import Markdown from 'react-markdown';
import { safeReleaseNoteUrl, type PublishedRelease } from '@/lib/releases/data';

export function ReleaseNotes({ release }: { release: PublishedRelease }) {
  return release.body ? (
    <div className="min-w-0 break-words text-sm leading-8 text-slate-700 [&_p]:my-3 [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-1 [&_blockquote]:border-s-2 [&_blockquote]:border-teal-300 [&_blockquote]:ps-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-100 [&_pre]:p-4 [&_pre]:text-start [&_pre]:[direction:ltr] [&_code]:break-words [&_code]:font-mono [&_a]:text-teal-800 [&_a]:underline [&_a]:underline-offset-4">
      <Markdown skipHtml urlTransform={(value) => safeReleaseNoteUrl(value, release.releaseUrl) ?? ''}
        components={{
          a: ({ href, children }) => href ? <a href={href} rel="noreferrer">{children}</a> : <span>{children}</span>,
          // Release history is text; external Markdown images do not make background requests.
          img: ({ alt }) => alt ? <span>{alt}</span> : null,
          h1: ({ children }) => <h3 className="mb-3 mt-6 text-xl font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-3 mt-6 text-lg font-semibold">{children}</h3>,
        }}
      >{release.body}</Markdown>
    </div>
  ) : <p className="text-sm leading-8 text-slate-500">لم تُضف ملاحظات لهذا الإصدار بعد. يمكنك فتح صفحته على GitHub للاطّلاع على تفاصيله.</p>;
}
