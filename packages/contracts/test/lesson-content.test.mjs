import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonBlocksSchema,
  lessonDetailSchema,
  lessonSectionDocument,
  replaceLessonSection,
  lessonContentText,
  lessonExcerpt,
  readLessonBlocks,
  richTextDocumentSchema,
} from '../dist/index.js';

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const document = (text) => ({ type: 'doc', content: [paragraph(text)] });

test('legacy lessons convert without mutating their stored blocks or losing line breaks', () => {
  const blocks = [
    { type: 'heading', text: 'دورة الماء' },
    { type: 'paragraph', text: 'سطر أول\nسطر ثانٍ' },
    { type: 'list', items: ['تبخّر', 'تكاثف'] },
  ];
  const before = structuredClone(blocks);
  const converted = lessonSectionDocument(blocks, 'content');
  assert.equal(richTextDocumentSchema.safeParse(converted).success, true);
  assert.deepEqual(blocks, before);
  assert.match(
    lessonContentText('الدرس', [{ type: 'richText', document: converted }]),
    /سطر أول\nسطر ثانٍ/,
  );
  assert.equal(lessonExcerpt(blocks), 'سطر أول\nسطر ثانٍ');
});

test('editing one section preserves all other sections and formatting through student validation', () => {
  const content = document('شرح');
  content.content[0].content[0].marks = [{ type: 'bold' }];
  let blocks = replaceLessonSection([], 'content', content);
  blocks = replaceLessonSection(blocks, 'outcomes', document('يميّز الطالب المراحل'));
  blocks = replaceLessonSection(blocks, 'summary', document('الماء في دورة مستمرة'));
  blocks = replaceLessonSection(blocks, 'summary', document('خلاصة جديدة'));
  assert.equal(
    lessonSectionDocument(blocks, 'content'),
    content,
    'stable reference preserves selection and undo state',
  );
  const student = lessonDetailSchema.shape.blocks.parse(JSON.parse(JSON.stringify(blocks)));
  assert.deepEqual(lessonSectionDocument(student, 'content'), content);
  assert.match(lessonContentText('درس', student), /مخرجات التعلّم\n\nيميّز الطالب/);
  assert.equal(lessonExcerpt(student), 'شرح');
  assert.equal(student.filter((block) => block.section === 'summary').length, 1);
});

test('unsafe links, HTML nodes, excessive depth and oversized documents are rejected', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,bad', 'file:///secret']) {
    const unsafe = document('نص');
    unsafe.content[0].content[0].marks = [{ type: 'link', attrs: { href } }];
    assert.equal(richTextDocumentSchema.safeParse(unsafe).success, false);
  }
  assert.equal(
    richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [{ type: 'script', text: 'alert(1)' }],
    }).success,
    false,
  );
  let nested = paragraph('نص');
  for (let i = 0; i < 20; i++) nested = { type: 'blockquote', content: [nested] };
  assert.equal(richTextDocumentSchema.safeParse({ type: 'doc', content: [nested] }).success, false);
  assert.equal(
    richTextDocumentSchema.safeParse({
      type: 'doc',
      content: Array.from({ length: 6 }, () => paragraph('x'.repeat(50_000))),
    }).success,
    false,
  );
});

test('safe formatted lists and links survive parsing while unrelated attributes are removed', () => {
  const value = {
    type: 'doc',
    content: [
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('أولًا'),
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [paragraph('تفصيل')] }],
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        attrs: { onclick: 'bad' },
        content: [
          {
            type: 'text',
            text: 'مصدر',
            marks: [{ type: 'link', attrs: { href: 'https://example.com', onclick: 'bad' } }],
          },
        ],
      },
    ],
  };
  const parsed = richTextDocumentSchema.parse(value);
  assert.equal(parsed.content[0].attrs.start, 3);
  assert.equal(JSON.stringify(parsed).includes('onclick'), false);
  assert.equal(
    lessonBlocksSchema.safeParse([{ type: 'richText', document: parsed }]).success,
    true,
  );
  assert.equal(
    readLessonBlocks([{ type: 'unknown' }, { type: 'paragraph', text: 'محتوى سليم' }]).length,
    1,
  );
});
