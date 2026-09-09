import electron from 'electron';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { app } = electron;
const lab = process.env.CUBECROOM_GUIDE_LAB;
if (!lab) throw new Error('Use node scripts/guide-session.mjs.');
mkdirSync(join(lab, 'profile'), { recursive: true });
app.setPath('userData', join(lab, 'profile'));
process.env.CUBECROOM_DEV_HOT_RELOAD = '1';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.getAppPath = () => desktop;
const shots = join(desktop, 'screenshots');
mkdirSync(shots, { recursive: true });
let window;
let queue = Promise.resolve();
let demoMode = 'success';
let demoMaterials = {};
let demoCalls = [];
const notes = existsSync(join(lab,'teacher-notes.json')) ? JSON.parse(readFileSync(join(lab,'teacher-notes.json'),'utf8')) : [];
const respond = value => process.send?.(value);
const pause = ms => new Promise(done => setTimeout(done, ms));
const modelServer = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'documentation-demo' }] }));
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); demoCalls.push({ at: new Date().toISOString(), request: body });
  if (demoMode === 'failed') { res.writeHead(503); return res.end(JSON.stringify({ error: { message: 'Documentation connection interruption' } })); }
  if (demoMode === 'slow') await pause(15000);
  const task = body.messages.find(m => m.role === 'user')?.content;
  let parsed; try { parsed = JSON.parse(task); } catch { parsed = {}; }
  const material = demoMaterials[parsed.method] ?? demoMaterials.retrieval;
  const toolResults = body.messages.filter(m => m.role === 'tool');
  const last = toolResults.at(-1);
  let lastResult; try { lastResult = JSON.parse(last?.content); } catch { lastResult = {}; }
  let name = null, args = {}, content = 'تمت مراجعة المحتوى وفق المعلومات المتاحة.';
  if (!body.tools) content = task?.includes('"source"') ? '{"approved":true,"reason":"The example agrees with the supplied water-cycle source."}' : 'اربط كل سؤال بهدف واضح، وقدم تفسيراً بعد المحاولة.';
  else if (toolResults.length === 0) name = 'readLesson';
  else if (toolResults.length === 1) name = 'recallMemory';
  else if (toolResults.length === 2) { name = 'consultSpecialist'; args = { specialist: 'quality', question: 'راجع اتساق أهداف درس دورة الماء وصحة التفسيرات.' }; }
  else if (toolResults.length === 3) { name = 'saveExperience'; args = { key: 'water-practice', material }; }
  else if (toolResults.length === 4 && parsed.task?.includes('انشر')) { name = 'publishExperience'; args = { id: lastResult.id, version: lastResult.version }; }
  else content = `حفظت تجربة «${material?.title ?? 'مراجعة دورة الماء'}» بعد قراءة الدرس واستشارة مراجع الجودة. يمكنك فتحها من تجارب التعلّم.\n${toolResults.some(r => r.content?.includes('"published":true')) ? 'نُشرت التجربة وفق تفويض الفصل.' : 'تنتظر المسودة مراجعتك ونشرك.'}`;
  res.end(JSON.stringify({ id: 'documentation-demo', object: 'chat.completion', created: 1, model: 'documentation-demo', choices: [{ index: 0, message: name ? { role: 'assistant', content: null, tool_calls: [{ id: `step-${toolResults.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } : { role: 'assistant', content }, finish_reason: name ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 } }));
});
modelServer.listen(0, '127.0.0.1');
app.once('browser-window-created', (_, win) => {
  window = win; win.setSize(1280, 900); win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', () => { win.show(); win.focus(); respond({ ready: true, lab, modelUrl: `http://127.0.0.1:${modelServer.address().port}/v1` }); });
});
createRequire(import.meta.url)(join(desktop, 'dist-app/main.cjs'));
const evaluate = code => window.webContents.executeJavaScript(code);
const invoke = (method, input) => evaluate(`window.cubecroom[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
const snapshotCode = `(() => {
 const nodes=[...document.querySelectorAll('button,input,textarea,select,a,[role=tab],[role=radio],[contenteditable=true],summary')].filter(n=>n.getClientRects().length);
 window.__guideControls=nodes;
 return {text:document.body.innerText.slice(0,14000),controls:nodes.map((n,index)=>({index,tag:n.tagName,type:n.type,label:n.getAttribute('aria-label') || n.labels?.[0]?.innerText || n.closest('label')?.innerText || n.getAttribute('placeholder') || n.innerText,value:n.value,disabled:n.disabled,options:n.tagName==='SELECT'?[...n.options].map(o=>({value:o.value,text:o.text})):undefined}))};
})()`;
async function command(cmd) {
  if (cmd.action === 'snapshot') return evaluate(snapshotCode);
  if (cmd.action === 'diagnostics') return evaluate(`Array.from(document.querySelectorAll('nextjs-portal')).map(n=>n.shadowRoot?.innerText ?? '')`);
  if (cmd.action === 'onboard') { const result = await invoke('completeOnboarding', { name: 'أ. نورة — معلمة العلوم', dataDirectory: join(lab, 'data') }); window.reload(); return result; }
  if (cmd.action === 'read') {
    const allowed = ['classesList','lessonsList','learningList','learningGet','learningProgress','learningReview','agentProfiles','agentMemories','agentRuns','portalStatus','requestsList','homeState'];
    if (!allowed.includes(cmd.method)) throw new Error('Read method not allowed.');
    return invoke(cmd.method,cmd.input);
  }
  if (cmd.action === 'demo') { demoMode=cmd.mode ?? 'success'; if(cmd.materials)demoMaterials=cmd.materials; return { demoMode, modelUrl:`http://127.0.0.1:${modelServer.address().port}/v1` }; }
  if (cmd.action === 'capture') {
    if (!/^learning-[a-z0-9-]+$/.test(cmd.slug)) throw new Error('Invalid screenshot slug');
    await evaluate('document.fonts.ready'); await pause(350);
    const png = await window.webContents.capturePage();
    const file = `${cmd.slug}.png`; writeFileSync(join(shots,file),png.toPNG());
    const text = await evaluate('document.body.innerText');
    const note = { name: cmd.slug, title: cmd.title, device: 'المعلم', file, view: {...png.getSize(),dpr:1}, notes:[], text };
    const old = notes.findIndex(n=>n.name===cmd.slug); if(old<0)notes.push(note);else notes[old]=note;
    writeFileSync(join(lab,'teacher-notes.json'),JSON.stringify(notes,null,2));
    return {file:join(shots,file),view:note.view};
  }
  if (cmd.action === 'reload') { window.reload(); return { reloading:true }; }
  if (cmd.action === 'quit') { writeFileSync(join(lab,'model-calls.json'),JSON.stringify(demoCalls,null,2)); modelServer.close(); app.quit(); return {closed:true}; }
  if (cmd.action === 'batch') { const results=[]; for (const action of cmd.actions) results.push(await command(action)); return { steps:results.length, last:results.at(-1) }; }
  if (cmd.action === 'fixture') {
    // Declarative, auditable actions drive actual controls; fixtures cannot call IPC mutations.
    const file=join(lab,'walkthrough.json'); if(!existsSync(file))throw new Error('No walkthrough file');
    const actions=JSON.parse(readFileSync(file,'utf8'));
    return command({action:'batch',actions});
  }
  if (!['click','fill','select','scroll'].includes(cmd.action)) throw new Error('Unknown UI action');
  const nodeCode = cmd.index !== undefined ? `window.__guideControls?.[${Number(cmd.index)}]` : `Array.from(document.querySelectorAll('button,input,textarea,select,a,[role=tab],[role=radio],[contenteditable=true],summary')).filter(n=>n.getClientRects().length).find(n => [n.getAttribute('aria-label'),n.labels?.[0]?.innerText,n.closest('label')?.innerText,n.getAttribute('placeholder'),n.innerText].some(s => s && ${cmd.exact===false ? `s.trim().includes(${JSON.stringify(cmd.label)})` : `s.trim()===${JSON.stringify(cmd.label)}`}))`;
  await evaluate(`(() => {const n=${nodeCode};if(!n)throw new Error('Control missing: '+${JSON.stringify(cmd.label??cmd.index)}); n.scrollIntoView({block:'center'});n.focus();
    ${cmd.action==='click' ? `n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));n.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));n.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',button:0}));n.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));n.click();` : cmd.action==='scroll' ? '' : `if(n.isContentEditable){n.textContent=${JSON.stringify(cmd.value)};}else{const proto=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;const value=${cmd.optionText ? `[...n.options].find(o=>o.text===${JSON.stringify(cmd.optionText)})?.value` : JSON.stringify(cmd.value)};Object.getOwnPropertyDescriptor(proto,'value').set.call(n,value);}n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));`}
  })()`);
  await pause(450);
  return cmd.snapshot === false ? {ok:true} : evaluate(snapshotCode);
}
process.on('message', cmd => { queue=queue.then(async()=>{try{respond({result:await command(cmd)});}catch(e){respond({error:e.message,snapshot:await evaluate(snapshotCode).catch(()=>null)});}}); });
