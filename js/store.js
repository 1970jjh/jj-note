// 데이터 모델 · 영속화(localStorage) · 페이지 조작
// 모델: pages[id] = { id, title, icon, cover, parent, children[], blocks[], isRow, props{}, db?, trashed, ... }
//       블록 = { id, type, html, indent, ...타입별 필드 }  (노션의 block tree 를 평탄 배열 + indent 로 표현)

const KEY = 'jjnote.v1';
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const now = () => Date.now();

export let state = null;

const blank = () => ({
  version: 1,
  pages: {},
  root: [],
  favorites: [],
  recent: [],
  expanded: {},
  settings: { theme: 'system', workspace: 'JJ 노트' },
});

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.pages && Array.isArray(s.root)) {
      state = { ...blank(), ...s, settings: { ...blank().settings, ...s.settings } };
      return;
    }
  } catch (e) {
    console.error('저장 데이터 읽기 실패', e);
  }
  state = blank();
  seed();
  saveNow();
}

let timer;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 250);
}
export function saveNow() {
  clearTimeout(timer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error(e);
    if (!saveNow.warned) alert('저장 공간이 가득 찼습니다. 큰 이미지를 지우거나 설정 → JSON 내보내기로 백업하세요.');
    saveNow.warned = true;
    return false;
  }
}
addEventListener('beforeunload', saveNow);

export function replaceState(next) {
  if (!next || typeof next !== 'object' || !next.pages || !Array.isArray(next.root)) {
    throw new Error('JJ 노트 백업 파일 형식이 아닙니다.');
  }
  for (const p of Object.values(next.pages)) {
    for (const b of p.blocks || []) {
      b.html = sanitize(b.html);
      if (b.caption) b.caption = sanitize(b.caption);
      if (b.url && !/^https?:\/\//.test(b.url)) b.url = '';
      if (b.src && !/^(https?:|data:image\/)/.test(b.src)) b.src = '';
    }
  }
  state = { ...blank(), ...next };
  saveNow();
}
export function resetAll() {
  state = blank();
  seed();
  saveNow();
}

// 사용자 HTML 에서 스크립트·이벤트 속성·javascript: 링크 제거 (실행되지 않는 DOMParser 사용)
export function sanitize(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('script,style,iframe,object,embed,link,meta,form,svg').forEach((n) => n.remove());
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  }
  return doc.body.innerHTML;
}

export const page = (id) => (id ? state.pages[id] : null);
export const blk = (type = 'text', extra = {}) => ({ id: uid(), type, html: '', indent: 0, ...extra });
export const opt = (name, color = 'gray') => ({ id: uid(), name, color });

export function touch(p) {
  p.updatedAt = now();
  save();
}

export function createPage({ parent = null, title = '', icon = '', isRow = false, props = {}, index = null, blocks } = {}) {
  const p = {
    id: uid(), title, icon, cover: '', parent, children: [],
    blocks: blocks || [blk()], isRow, props, db: null,
    createdAt: now(), updatedAt: now(), fullWidth: false, trashed: false,
  };
  state.pages[p.id] = p;
  if (isRow) state.pages[parent].db.rows.push(p.id);
  else {
    const list = parent ? state.pages[parent].children : state.root;
    if (index == null) list.push(p.id);
    else list.splice(index, 0, p.id);
  }
  save();
  emit('structure');
  return p;
}

export function createDatabase({ parent = null, title = '새 데이터베이스', index = null } = {}) {
  const p = createPage({ parent, title, icon: '🗂️', index, blocks: [] });
  const status = uid();
  const opts = [opt('시작 전', 'gray'), opt('진행 중', 'blue'), opt('완료', 'green')];
  p.db = {
    schema: [
      { id: 'title', name: '이름', type: 'title' },
      { id: status, name: '상태', type: 'select', options: opts },
      { id: uid(), name: '날짜', type: 'date' },
    ],
    views: [
      { id: uid(), name: '표', type: 'table', sorts: [], filters: [] },
      { id: uid(), name: '보드', type: 'board', groupBy: status, sorts: [], filters: [] },
    ],
    rows: [],
  };
  p.db.activeView = p.db.views[0].id;
  save();
  return p;
}

export function addRow(db, props = {}, title = '') {
  return createPage({ parent: db.id, isRow: true, props: { ...props }, title });
}

// 조상 중 하나라도 휴지통이면 숨김
export function isTrashed(id) {
  for (let p = page(id); p; p = page(p.parent)) if (p.trashed) return true;
  return !page(id);
}

export function descendants(id) {
  const p = page(id);
  if (!p) return [];
  return [...p.children, ...(p.db?.rows || [])].flatMap((c) => [c, ...descendants(c)]);
}

export function trashPage(id) {
  const p = page(id);
  if (!p) return;
  p.trashed = true;
  p.trashedAt = now();
  save();
  emit('structure');
}
export function restorePage(id) {
  const p = page(id);
  if (!p) return;
  p.trashed = false;
  for (let a = page(p.parent); a; a = page(a.parent)) a.trashed = false;
  if (p.parent && !page(p.parent)) moveTo(id, null);
  save();
  emit('structure');
}

function detach(id) {
  const p = page(id);
  const par = page(p.parent);
  if (par) {
    par.children = par.children.filter((x) => x !== id);
    if (par.db) par.db.rows = par.db.rows.filter((x) => x !== id);
  }
  state.root = state.root.filter((x) => x !== id);
}

export function destroyPage(id) {
  const p = page(id);
  if (!p) return;
  for (const d of descendants(id)) delete state.pages[d];
  const par = page(p.parent);
  if (par) par.blocks = par.blocks.filter((b) => b.pageId !== id);
  detach(id);
  state.favorites = state.favorites.filter((x) => page(x) && x !== id);
  state.recent = state.recent.filter((x) => page(x) && x !== id);
  delete state.pages[id];
  save();
  emit('structure');
}

/** 페이지를 다른 부모(또는 최상위)로 옮긴다. before 가 있으면 그 앞에 넣는다. */
export function moveTo(id, parent, before = null) {
  const p = page(id);
  if (!p || p.isRow) return;
  if (parent === id || descendants(id).includes(parent)) return; // 자기 하위로 이동 금지
  const oldPar = page(p.parent);
  detach(id);
  if (oldPar && oldPar.id !== parent) oldPar.blocks = oldPar.blocks.filter((b) => b.pageId !== id);
  p.parent = parent;
  const list = parent ? page(parent).children : state.root;
  const i = before ? list.indexOf(before) : -1;
  if (i >= 0) list.splice(i, 0, id);
  else list.push(id);
  const np = page(parent);
  if (np && !np.db && !np.blocks.some((b) => b.pageId === id)) np.blocks.push(blk('page', { pageId: id }));
  save();
  emit('structure');
}

export function duplicatePage(id, parent) {
  const src = page(id);
  const top = parent === undefined;
  if (top) parent = src.parent;
  const copy = structuredClone(src);
  Object.assign(copy, {
    id: uid(), parent, children: [], createdAt: now(), updatedAt: now(),
    title: top && src.title ? src.title + ' (사본)' : src.title,
    blocks: copy.blocks.map((b) => ({ ...b, id: uid() })),
  });
  if (copy.db) copy.db.rows = [];
  state.pages[copy.id] = copy;
  if (src.isRow) page(parent).db.rows.push(copy.id);
  else {
    const list = parent ? page(parent).children : state.root;
    const i = top ? list.indexOf(id) : -1;
    if (i >= 0) list.splice(i + 1, 0, copy.id);
    else list.push(copy.id);
  }
  for (const c of src.children) {
    const n = duplicatePage(c, copy.id);
    copy.blocks.forEach((b) => b.pageId === c && (b.pageId = n.id));
  }
  for (const r of src.db?.rows || []) duplicatePage(r, copy.id);
  if (top) {
    const par = page(parent);
    if (par && !par.db) {
      const i = par.blocks.findIndex((b) => b.pageId === id);
      par.blocks.splice(i >= 0 ? i + 1 : par.blocks.length, 0, blk('page', { pageId: copy.id }));
    }
    save();
    emit('structure');
  }
  return copy;
}

export function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter((x) => x !== id)
    : [...state.favorites, id];
  save();
  emit('structure');
}

export function visit(id) {
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 12);
  save();
}

export function crumbs(id) {
  const out = [];
  for (let p = page(id); p; p = page(p.parent)) out.unshift(p);
  return out;
}

export const titleOf = (p) => (p?.title || '').trim() || '제목 없음';
export const iconOf = (p) => p?.icon || (p?.db ? '🗂️' : '📄');

// ---------- 마크다운 내보내기 ----------
const MD_PREFIX = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', quote: '> ', todo: '', toggle: '- ', callout: '> ' };
function htmlToMd(html) {
  const d = document.createElement('div');
  d.innerHTML = (html || '')
    .replace(/<(b|strong)>(.*?)<\/\1>/g, '**$2**')
    .replace(/<(i|em)>(.*?)<\/\1>/g, '*$2*')
    .replace(/<s>(.*?)<\/s>/g, '~~$1~~')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
    .replace(/<br\s*\/?>/g, '\n');
  return d.textContent;
}
export function toMarkdown(p) {
  const lines = [`# ${p.icon ? p.icon + ' ' : ''}${titleOf(p)}`, ''];
  let n = 0;
  for (const b of p.blocks) {
    const pad = '  '.repeat(b.indent || 0);
    const t = htmlToMd(b.html);
    n = b.type === 'number' ? n + 1 : 0;
    if (b.type === 'divider') lines.push('---');
    else if (b.type === 'code') lines.push('```', t, '```');
    else if (b.type === 'image') lines.push(b.src ? `![](${b.src.startsWith('data:') ? '이미지' : b.src})` : '');
    else if (b.type === 'bookmark') lines.push(b.url || '');
    else if (b.type === 'page') lines.push(`${pad}[${titleOf(page(b.pageId))}]`);
    else if (b.type === 'todo') lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${t}`);
    else if (b.type === 'number') lines.push(`${pad}${n}. ${t}`);
    else lines.push(pad + (MD_PREFIX[b.type] || '') + (b.type === 'callout' ? (b.icon || '💡') + ' ' : '') + t);
  }
  return lines.join('\n');
}

// ---------- 초기 예시 데이터 ----------
function seed() {
  const welcome = createPage({ title: 'JJ 노트에 오신 것을 환영합니다', icon: '👋' });
  welcome.cover = 'linear-gradient(120deg,#a1c4fd,#c2e9fb)';
  const meeting = createPage({ parent: welcome.id, title: '회의록 템플릿', icon: '📒' });
  meeting.blocks = [
    blk('callout', { html: '회의 전 안건을 미리 적어 두세요.', icon: '🗓️' }),
    blk('h2', { html: '안건' }),
    blk('number', { html: '지난주 진행 사항 공유' }),
    blk('number', { html: '이번 주 우선순위' }),
    blk('h2', { html: '결정 사항' }),
    blk('todo', { html: '담당자 지정하기' }),
  ];
  const tasks = createDatabase({ title: '할 일 보드' });
  tasks.icon = '✅';
  const [st] = tasks.db.schema.slice(1);
  const dateProp = tasks.db.schema[2];
  const pri = { id: uid(), name: '우선순위', type: 'select', options: [opt('높음', 'red'), opt('보통', 'yellow'), opt('낮음', 'gray')] };
  const tag = { id: uid(), name: '태그', type: 'multi', options: [opt('기획', 'purple'), opt('디자인', 'pink'), opt('개발', 'blue')] };
  tasks.db.schema.push(pri, tag, { id: uid(), name: '완료', type: 'checkbox' });
  tasks.db.views.push({ id: uid(), name: '캘린더', type: 'calendar', dateProp: dateProp.id, sorts: [], filters: [] });
  const today = new Date();
  const ymd = (d) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + d).toISOString().slice(0, 10);
  [
    ['제안서 초안 작성', 0, 0, [0], 1],
    ['교육 자료 디자인', 1, 1, [1], 3],
    ['웹 앱 배포', 1, 0, [2], 5],
    ['고객사 회신 메일', 2, 2, [0], -1],
  ].forEach(([title, s, pr, tg, d]) =>
    addRow(tasks, {
      [st.id]: st.options[s].id, [pri.id]: pri.options[pr].id,
      [tag.id]: tg.map((i) => tag.options[i].id), [dateProp.id]: ymd(d), }, title)
  );
  welcome.blocks = [
    blk('text', { html: '노션처럼 쓰는 <b>블록 기반 워크스페이스</b>입니다. 모든 내용은 이 브라우저에 자동 저장됩니다.' }),
    blk('h2', { html: '시작하기' }),
    blk('todo', { html: '아무 줄에서 <code>/</code> 를 입력해 블록 종류를 바꿔 보세요', checked: true }),
    blk('todo', { html: '<code>#</code> + 스페이스는 제목, <code>-</code> + 스페이스는 목록, <code>[]</code> + 스페이스는 할 일' }),
    blk('todo', { html: '왼쪽 <b>⋮⋮</b> 손잡이를 끌어 블록 순서를 바꿔 보세요' }),
    blk('todo', { html: '<b>Ctrl+K</b> 로 전체 검색' }),
    blk('toggle', { html: '토글을 눌러 펼쳐 보세요', open: false }),
    blk('text', { html: '숨겨져 있던 내용입니다. Tab 키로 들여쓰기하면 토글 안에 넣을 수 있어요.', indent: 1 }),
    blk('callout', { html: '데이터베이스는 표·보드·목록·갤러리·캘린더 보기로 볼 수 있습니다.', icon: '💡' }),
    blk('page', { pageId: meeting.id }),
    blk('divider'),
    blk('quote', { html: '작은 기록이 큰 성과를 만든다.' }),
    blk('code', { html: 'console.log("Hello, JJ 노트!")' }),
  ];
  state.favorites = [welcome.id, tasks.id];
  state.expanded[welcome.id] = true;
}
