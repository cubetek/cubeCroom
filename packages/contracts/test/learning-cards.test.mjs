import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_CARD_KINDS,
  RICH_TEXT_LIMITS,
  richTextDocumentSchema,
  richTextPlainText,
  lessonSectionDocument,
  replaceLessonSection,
  lessonBlocksSchema,
} from '../dist/index.js';

const paragraph = (text = 'محتوى') => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', content });
const cell = (text = 'قيمة', attrs = {}) => ({
  type: 'tableCell',
  attrs,
  content: [paragraph(text)],
});
const row = (...content) => ({ type: 'tableRow', content });
const table = (...content) => ({ type: 'table', content });
const card = (kind = 'concept', content = [paragraph()]) => ({
  type: 'learningCard',
  attrs: { kind, title: 'دورة الماء' },
  content,
});

test('all semantic learning cards survive saving, section editing and student validation', () => {
  const document = doc(...LEARNING_CARD_KINDS.map((kind) => card(kind)));
  const parsed = richTextDocumentSchema.parse(document);
  const blocks = replaceLessonSection(
    [{ type: 'paragraph', section: 'summary', text: 'خلاصة محفوظة' }],
    'content',
    parsed,
  );
  const saved = lessonBlocksSchema.parse(JSON.parse(JSON.stringify(blocks)));
  assert.deepEqual(lessonSectionDocument(saved, 'content'), document);
  assert.equal(saved[0].text, 'خلاصة محفوظة');
  assert.match(richTextPlainText(parsed), /دورة الماء\nمحتوى/);
});

test('table and task content remain semantic inside editable learning cards', () => {
  const document = doc(
    card('practice', [
      paragraph('قارن بين المرحلتين ثم أكمل الخطوات.'),
      table(
        row(
          { ...cell('المرحلة'), type: 'tableHeader' },
          { ...cell('التغيّر'), type: 'tableHeader' },
        ),
        row(cell('التبخّر'), cell('سائل إلى غاز')),
      ),
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [paragraph('اشرح السبب')] },
        ],
      },
    ]),
  );
  const parsed = richTextDocumentSchema.parse(document);
  assert.match(richTextPlainText(parsed), /المرحلة \| التغيّر/);
  assert.match(richTextPlainText(parsed), /☐ اشرح السبب/);
});

test('valid merged table cells preserve grid dimensions and safe attributes', () => {
  const document = doc(
    table(
      row(cell('مشترك', { rowspan: 2 }), cell('ب')),
      row(cell('ج')),
      row(cell('خلاصة', { colspan: 2, colwidth: [160, 160], align: 'center' })),
    ),
  );
  assert.equal(richTextDocumentSchema.safeParse(document).success, true);
});

test('ragged, overlapping, oversized or invalid table spans are rejected', () => {
  const invalid = [
    table(row(cell(), cell()), row(cell())),
    table(row(cell('أ', { rowspan: 3 })), row(cell())),
    table(row(cell(), cell('أ', { rowspan: 2 })), row(cell('ب', { colspan: 2 }))),
    table(row(cell('أ', { colspan: 0 }))),
    table(row(cell('أ', { colwidth: [100, 100] }))),
    table(row(...Array.from({ length: RICH_TEXT_LIMITS.tableColumns + 1 }, () => cell()))),
    table(...Array.from({ length: RICH_TEXT_LIMITS.tableRows + 1 }, () => row(cell()))),
  ];
  for (const value of invalid)
    assert.equal(richTextDocumentSchema.safeParse(doc(value)).success, false);
});

test('orphan structural nodes, missing card attributes and malformed tasks are rejected', () => {
  const invalid = [
    row(cell()),
    cell(),
    { type: 'taskItem', attrs: { checked: true }, content: [paragraph()] },
    { ...card(), attrs: { title: 'عنوان' } },
    { ...card(), attrs: { kind: 'html', title: 'عنوان' } },
    { ...card(), attrs: { kind: 'example', title: 'ع'.repeat(RICH_TEXT_LIMITS.cardTitle + 1) } },
    card('concept', []),
    card('concept', [{ type: 'text', text: 'نص مباشر غير صالح' }]),
    { type: 'taskList', content: [{ type: 'taskItem', content: [paragraph()] }] },
    { type: 'taskList', content: [paragraph()] },
  ];
  for (const value of invalid)
    assert.equal(richTextDocumentSchema.safeParse(doc(value)).success, false);
});

test('nested cards and tables cannot bypass validation through another block', () => {
  assert.equal(
    richTextDocumentSchema.safeParse(
      doc(card('example', [{ type: 'blockquote', content: [card()] }])),
    ).success,
    false,
  );
  assert.equal(
    richTextDocumentSchema.safeParse(doc(table(row({ ...cell(), content: [table(row(cell()))] }))))
      .success,
    false,
  );
});

test('raw HTML, executable attributes and links never survive semantic content validation', () => {
  const value = doc(card());
  value.content[0].attrs.onclick = 'alert(1)';
  value.content[0].attrs.style = 'position:fixed';
  const parsed = richTextDocumentSchema.parse(value);
  assert.equal(JSON.stringify(parsed).includes('onclick'), false);
  assert.equal(JSON.stringify(parsed).includes('position:fixed'), false);
  assert.equal(
    richTextDocumentSchema.safeParse(
      doc(card('concept', [{ type: 'html', text: '<script>alert(1)</script>' }])),
    ).success,
    false,
  );
  assert.equal(
    richTextDocumentSchema.safeParse(
      doc(
        card('concept', [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'رابط',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ]),
      ),
    ).success,
    false,
  );
});
