const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const quote = value => JSON.stringify(String(value));
const mdxSafe = value => String(value).replace(/([{}<>])/g, '\\$1');

/** Generate navigation and pages together so their URLs cannot drift apart. */
export function renderGuide({ screens, copy, articles, sections, introductions }) {
  const files = new Map();
  const pages = [];
  function add(page, body) {
    if (!slugPattern.test(page.slug) || !Object.hasOwn(sections, page.section)) throw new Error(`Invalid guide page: ${page.section}/${page.slug}`);
    const file = `${page.section}/${page.slug}.mdx`;
    if (files.has(file)) throw new Error(`Duplicate guide page: ${file}`);
    files.set(file, body.trim() + '\n');
    pages.push(page);
  }
  for (const page of introductions.pages) add(page, page.body);
  for (const screen of screens) {
    const text = copy[screen.slug];
    if (!text) throw new Error(`Missing guide copy: ${screen.slug}`);
    const title = text.title ?? screen.title;
    const body = [
      '---', `title: ${quote(title)}`, `description: ${quote(text.summary)}`, '---', '',
      `<Device who=${quote(screen.device)} />`, '',
      '<Screen', `  src=${quote(screen.src)}`, `  alt=${quote(screen.title)}`,
      `  view={${JSON.stringify(screen.view)}}`, `  marks={${JSON.stringify(screen.marks)}}`, '/>', '',
    ];
    if (text.steps?.length) body.push('## ماذا تفعل هنا', '', ...text.steps.map(step => `- ${mdxSafe(step)}`), '');
    if (text.note) body.push('<Callout title="انتبه">', mdxSafe(text.note), '</Callout>', '');
    if (text.body) body.push(text.body, '');
    add({ slug: screen.slug, section: text.section, title }, body.join('\n'));
  }
  for (const page of articles) add(page, [
    '---', `title: ${quote(page.title)}`, `description: ${quote(page.description)}`, '---', '', page.body,
  ].join('\n'));

  files.set('index.mdx', introductions.index.trim() + '\n');
  const used = Object.keys(sections).filter(section => pages.some(page => page.section === section));
  files.set('meta.json', JSON.stringify({ title: 'دليل الاستخدام', pages: ['index', ...used] }, null, 2) + '\n');
  for (const section of used) {
    const sectionPages = pages.filter(page => page.section === section).map(page => page.slug);
    const first = (sections[section].first ?? []).filter(slug => sectionPages.includes(slug));
    files.set(`${section}/meta.json`, JSON.stringify({
      title: sections[section].title,
      description: sections[section].description,
      pages: [...first, ...sectionPages.filter(slug => !first.includes(slug))],
    }, null, 2) + '\n');
  }
  return files;
}
