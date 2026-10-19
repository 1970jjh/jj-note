// 데이터베이스: 표 · 보드 · 목록 · 갤러리 · 캘린더 보기, 필터 · 정렬 · 검색, 속성 편집
import { page, uid, opt, addRow, touch, save, titleOf, iconOf, trashPage, duplicatePage, emit } from './store.js';
import { h, menu, closeMenu, COLORS, COLOR_LABEL, fmtDate, stripHtml, toast } from './ui.js';

export const PROP_TYPES = [
  { type: 'text', label: '텍스트', icon: '≡' },
  { type: 'number', label: '숫자', icon: '#' },
  { type: 'select', label: '선택', icon: '◉' },
  { type: 'multi', label: '다중 선택', icon: '☰' },
  { type: 'date', label: '날짜', icon: '📅' },
  { type: 'checkbox', label: '체크박스', icon: '☑' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'email', label: '이메일', icon: '@' },
  { type: 'phone', label: '전화번호', icon: '☎' },
  { type: 'person', label: '담당자', icon: '👤' },
  { type: 'created', label: '생성 일시', icon: '⏱' },
  { type: 'edited', label: '최종 편집 일시', icon: '✎' },
];
export const VIEW_TYPES = [
  { type: 'table', label: '표', icon: '▦' },
  { type: 'board', label: '보드', icon: '▥' },
  { type: 'list', label: '목록', icon: '☰' },
  { type: 'gallery', label: '갤러리', icon: '▣' },
  { type: 'calendar', label: '캘린더', icon: '📅' },
];
const typeIcon = (t) => (t === 'title' ? 'Aa' : PROP_TYPES.find((x) => x.type === t)?.icon || '≡');
const search = {}; // dbId → 검색어 (세션 한정)
const calMonth = {}; // viewId → Date

let ctx = null; // { db, el, nav }

export function mountDatabase(db, el, nav) {
  ctx = { db, el, nav };
  draw();
}

const D = () => ctx.db.db;
const activeView = () => D().views.find((v) => v.id === D().activeView) || D().views[0];
const commit = () => (ctx ? touch(ctx.db) : save());
const prop = (id) => D().schema.find((s) => s.id === id);

export function getVal(r, p) {
  if (p.type === 'title') return r.title;
  if (p.type === 'created') return r.createdAt;
  if (p.type === 'edited') return r.updatedAt;
  return r.props?.[p.id];
}
export function setVal(r, p, v) {
  if (p.type === 'title') r.title = v;
  else r.props = { ...r.props, [p.id]: v };
  touch(r);
  if (p.type === 'title') emit('titles');
}
function valText(r, p) {
  const v = getVal(r, p);
  if (v == null || v === '') return '';
  if (p.type === 'select') return p.options?.find((o) => o.id === v)?.name || '';
  if (p.type === 'multi') return (v || []).map((id) => p.options?.find((o) => o.id === id)?.name).filter(Boolean).join(', ');
  if (p.type === 'checkbox') return v ? 'true' : '';
  if (p.type === 'created' || p.type === 'edited') return new Date(v).toISOString();
  return String(v);
}

// ---------- 행 집합 (필터·정렬·검색) ----------
function rowsOf(view) {
  let rows = D().rows.map(page).filter((r) => r && !r.trashed);
  const q = (search[ctx.db.id] || '').toLowerCase().trim();
  if (q) rows = rows.filter((r) => D().schema.some((p) => valText(r, p).toLowerCase().includes(q)));
  for (const f of view.filters || []) {
    const p = prop(f.prop);
    if (!p) continue;
    rows = rows.filter((r) => matchFilter(r, p, f));
  }
  const sorts = (view.sorts || []).filter((s) => prop(s.prop));
  if (sorts.length)
    rows = [...rows].sort((a, b) => {
      for (const s of sorts) {
        const p = prop(s.prop);
        const c = compare(sortKey(a, p), sortKey(b, p));
        if (c) return s.dir === 'desc' ? -c : c;
      }
      return 0;
    });
  return rows;
}
function sortKey(r, p) {
  const v = getVal(r, p);
  if (p.type === 'number') return v === '' || v == null ? null : Number(v);
  if (p.type === 'select') return p.options?.findIndex((o) => o.id === v) ?? -1;
  if (p.type === 'checkbox') return v ? 1 : 0;
  return valText(r, p).toLowerCase() || null;
}
function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
export function matchFilter(r, p, f) {
  const t = valText(r, p).toLowerCase();
  const v = (f.value || '').toLowerCase();
  switch (f.op) {
    case 'empty': return !t;
    case 'notempty': return !!t;
    case 'is': return t === v;
    case 'isnot': return t !== v;
    case 'notcontains': return !t.includes(v);
    case 'checked': return !!getVal(r, p);
    case 'unchecked': return !getVal(r, p);
    default: return t.includes(v);
  }
}

// ---------- 화면 ----------
function draw() {
  const { el } = ctx;
  const view = activeView();
  el.innerHTML = '';
  el.append(toolbar(view));
  const body = h('div', { class: 'db-body' });
  el.append(body);
  const rows = rowsOf(view);
  ({ table, board, list, gallery, calendar }[view.type] || table)(body, rows, view);
}

function toolbar(view) {
  const tabs = h('div', { class: 'db-tabs', role: 'tablist' },
    D().views.map((v) => {
      const t = h('button', {
        class: 'db-tab' + (v.id === view.id ? ' active' : ''), role: 'tab',
        onclick: () => {
          if (v.id === view.id) return viewMenu(t, v);
          D().activeView = v.id; save(); draw();
        },
      }, h('span', { class: 'tab-icon' }, VIEW_TYPES.find((x) => x.type === v.type)?.icon), v.name);
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); viewMenu(t, v); });
      return t;
    }),
    h('button', { class: 'db-tab add', title: '보기 추가', onclick: (e) => addViewMenu(e.currentTarget) }, '+'));
  const nF = (view.filters || []).length;
  const nS = (view.sorts || []).length;
  const q = h('input', { class: 'db-search', type: 'search', placeholder: '검색…', value: search[ctx.db.id] || '' });
  q.addEventListener('input', () => {
    search[ctx.db.id] = q.value;
    const body = ctx.el.querySelector('.db-body');
    body.innerHTML = '';
    const rows = rowsOf(view);
    ({ table, board, list, gallery, calendar }[view.type] || table)(body, rows, view);
  });
  return h('div', { class: 'db-toolbar' }, tabs,
    h('div', { class: 'db-actions' },
      h('button', { class: 'tb-btn' + (nF ? ' on' : ''), onclick: (e) => filterMenu(e.currentTarget, view) }, '필터' + (nF ? ` ${nF}` : '')),
      h('button', { class: 'tb-btn' + (nS ? ' on' : ''), onclick: (e) => sortMenu(e.currentTarget, view) }, '정렬' + (nS ? ` ${nS}` : '')),
      q,
      h('button', { class: 'btn primary', onclick: () => newRow(view, {}, true) }, '새로 만들기')));
}

function newRow(view, presets = {}, open = false) {
  const props = { ...presets };
  for (const f of view.filters || []) {
    const p = prop(f.prop);
    if (p?.type === 'select' && f.op === 'is') {
      const o = p.options.find((x) => x.name.toLowerCase() === (f.value || '').toLowerCase());
      if (o) props[p.id] = o.id;
    }
    if (p?.type === 'checkbox' && f.op === 'checked') props[p.id] = true;
  }
  const r = addRow(ctx.db, props);
  commit();
  if (open) return ctx.nav(r.id);
  draw();
  ctx.el.querySelector(`[data-row="${r.id}"] .title-input`)?.focus();
  return r;
}

// ---------- 보기 메뉴 ----------
function addViewMenu(anchor) {
  menu(anchor, VIEW_TYPES.map((t) => ({
    icon: t.icon, label: t.label + ' 보기',
    onClick: () => {
      const v = { id: uid(), name: t.label, type: t.type, sorts: [], filters: [] };
      if (t.type === 'board') v.groupBy = D().schema.find((s) => s.type === 'select')?.id;
      if (t.type === 'calendar') v.dateProp = D().schema.find((s) => s.type === 'date')?.id;
      D().views.push(v);
      D().activeView = v.id;
      commit();
      draw();
    },
  })));
}

function viewMenu(anchor, v) {
  const items = [
    { icon: '✎', label: '보기 이름 변경', onClick: () => {
      const n = prompt('보기 이름', v.name);
      if (n?.trim()) { v.name = n.trim(); commit(); draw(); }
    } },
    { header: '보기 유형' },
    ...VIEW_TYPES.map((t) => ({ icon: t.icon, label: t.label, active: v.type === t.type, onClick: () => {
      v.type = t.type;
      if (t.type === 'board' && !prop(v.groupBy)) v.groupBy = D().schema.find((s) => s.type === 'select')?.id;
      if (t.type === 'calendar' && !prop(v.dateProp)) v.dateProp = D().schema.find((s) => s.type === 'date')?.id;
      commit(); draw();
    } })),
  ];
  if (v.type === 'board') {
    items.push({ header: '그룹화 기준' });
    D().schema.filter((s) => s.type === 'select').forEach((s) =>
      items.push({ icon: '◉', label: s.name, active: v.groupBy === s.id, onClick: () => { v.groupBy = s.id; commit(); draw(); } }));
  }
  if (v.type === 'calendar') {
    items.push({ header: '날짜 기준' });
    D().schema.filter((s) => s.type === 'date').forEach((s) =>
      items.push({ icon: '📅', label: s.name, active: v.dateProp === s.id, onClick: () => { v.dateProp = s.id; commit(); draw(); } }));
  }
  items.push('sep',
    { icon: '⧉', label: '보기 복제', onClick: () => {
      const c = { ...structuredClone(v), id: uid(), name: v.name + ' (사본)' };
      D().views.splice(D().views.indexOf(v) + 1, 0, c);
      D().activeView = c.id; commit(); draw();
    } },
    { icon: '🗑', label: '보기 삭제', danger: true, onClick: () => {
      if (D().views.length === 1) return toast('보기는 최소 1개가 필요합니다');
      D().views = D().views.filter((x) => x !== v);
      D().activeView = D().views[0].id; commit(); draw();
    } });
  menu(anchor, items);
}

// ---------- 필터 / 정렬 ----------
const OPS = {
  text: [['contains', '포함'], ['notcontains', '포함하지 않음'], ['is', '일치'], ['isnot', '불일치'], ['empty', '비어 있음'], ['notempty', '비어 있지 않음']],
  select: [['is', '일치'], ['isnot', '불일치'], ['empty', '비어 있음'], ['notempty', '비어 있지 않음']],
  checkbox: [['checked', '체크됨'], ['unchecked', '체크 안 됨']],
};
const opsFor = (p) => OPS[p.type === 'multi' ? 'text' : p.type] || OPS.text;
const noValue = (op) => ['empty', 'notempty', 'checked', 'unchecked'].includes(op);

function selectEl(options, value, onChange, cls = 'sel') {
  const s = h('select', { class: cls }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function filterMenu(anchor, view) {
  const box = h('div', { class: 'fs-box' });
  const redraw = () => {
    box.innerHTML = '';
    view.filters ||= [];
    if (!view.filters.length) box.append(h('div', { class: 'menu-empty' }, '이 보기에 적용된 필터가 없습니다'));
    view.filters.forEach((f, i) => {
      const p = prop(f.prop) || D().schema[0];
      const valueEl = p.type === 'select' || p.type === 'multi'
        ? selectEl([['', '선택…'], ...(p.options || []).map((o) => [o.name, o.name])], f.value || '', (v) => { f.value = v; apply(); })
        : h('input', { class: 'inp sm', value: f.value || '', placeholder: '값', oninput: (e) => { f.value = e.target.value; apply(); } });
      box.append(h('div', { class: 'fs-row' },
        selectEl(D().schema.map((s) => [s.id, s.name]), p.id, (v) => { f.prop = v; f.op = opsFor(prop(v))[0][0]; f.value = ''; apply(); redraw(); }),
        selectEl(opsFor(p), f.op, (v) => { f.op = v; apply(); redraw(); }),
        noValue(f.op) ? null : valueEl,
        h('button', { class: 'icon-btn', title: '삭제', onclick: () => { view.filters.splice(i, 1); apply(); redraw(); } }, '✕')));
    });
    box.append(h('button', { class: 'link-btn', onclick: () => {
      const p = D().schema[0];
      view.filters.push({ prop: p.id, op: opsFor(p)[0][0], value: '' });
      apply(); redraw();
    } }, '+ 필터 추가'));
  };
  const apply = () => { commit(); redrawBody(view); };
  redraw();
  menu(anchor, [box], { className: 'wide', onClose: draw });
}

function sortMenu(anchor, view) {
  const box = h('div', { class: 'fs-box' });
  const redraw = () => {
    box.innerHTML = '';
    view.sorts ||= [];
    if (!view.sorts.length) box.append(h('div', { class: 'menu-empty' }, '정렬 기준이 없습니다'));
    view.sorts.forEach((s, i) =>
      box.append(h('div', { class: 'fs-row' },
        selectEl(D().schema.map((x) => [x.id, x.name]), s.prop, (v) => { s.prop = v; apply(); }),
        selectEl([['asc', '오름차순'], ['desc', '내림차순']], s.dir, (v) => { s.dir = v; apply(); }),
        h('button', { class: 'icon-btn', onclick: () => { view.sorts.splice(i, 1); apply(); redraw(); } }, '✕'))));
    box.append(h('button', { class: 'link-btn', onclick: () => { view.sorts.push({ prop: D().schema[0].id, dir: 'asc' }); apply(); redraw(); } }, '+ 정렬 추가'));
  };
  const apply = () => { commit(); redrawBody(view); };
  redraw();
  menu(anchor, [box], { className: 'wide', onClose: draw });
}

function redrawBody(view) {
  const body = ctx.el.querySelector('.db-body');
  if (!body) return;
  body.innerHTML = '';
  ({ table, board, list, gallery, calendar }[view.type] || table)(body, rowsOf(view), view);
}

// ---------- 속성(열) 메뉴 ----------
function propMenu(anchor, p, view) {
  const items = [
    { icon: '✎', label: '이름 변경', onClick: () => {
      const n = prompt('속성 이름', p.name);
      if (n?.trim()) { p.name = n.trim(); commit(); draw(); }
    } },
  ];
  if (p.type !== 'title') {
    items.push({ header: '유형' }, ...PROP_TYPES.map((t) => ({
      icon: t.icon, label: t.label, active: p.type === t.type,
      onClick: () => { convertProp(p, t.type); commit(); draw(); },
    })));
  }
  items.push('sep',
    { icon: '↑', label: '오름차순 정렬', onClick: () => { view.sorts = [{ prop: p.id, dir: 'asc' }]; commit(); draw(); } },
    { icon: '↓', label: '내림차순 정렬', onClick: () => { view.sorts = [{ prop: p.id, dir: 'desc' }]; commit(); draw(); } },
    { icon: '⏚', label: '이 속성으로 필터', onClick: () => {
      (view.filters ||= []).push({ prop: p.id, op: opsFor(p)[0][0], value: '' }); commit(); draw();
      filterMenu(ctx.el.querySelector('.db-actions .tb-btn'), view);
    } });
  if (p.type !== 'title')
    items.push({ icon: '🗑', label: '속성 삭제', danger: true, onClick: () => {
      if (!confirm(`'${p.name}' 속성과 모든 값을 삭제할까요?`)) return;
      D().schema = D().schema.filter((x) => x !== p);
      commit(); draw();
    } });
  menu(anchor, items);
}

function convertProp(p, type) {
  if (p.type === type) return;
  const rows = D().rows.map(page).filter(Boolean);
  const texts = new Map(rows.map((r) => [r.id, valText(r, p)]));
  if ((type === 'select' || type === 'multi') && !p.options) p.options = [];
  for (const r of rows) {
    const t = texts.get(r.id);
    let v = t;
    if (type === 'number') v = t === '' || isNaN(Number(t)) ? '' : Number(t);
    else if (type === 'checkbox') v = !!t && t !== 'false';
    else if (type === 'select' || type === 'multi') {
      const names = type === 'multi' ? t.split(',').map((s) => s.trim()).filter(Boolean) : t ? [t.split(',')[0].trim()] : [];
      const ids = names.map((n) => (p.options.find((o) => o.name === n) || (p.options.push(opt(n, COLORS[(p.options.length % 9) + 1])), p.options.at(-1))).id);
      v = type === 'multi' ? ids : ids[0] || '';
    } else if (type === 'date') v = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
    r.props = { ...r.props, [p.id]: v };
  }
  p.type = type;
}

function addPropMenu(anchor) {
  menu(anchor, [{ header: '속성 유형' }, ...PROP_TYPES.map((t) => ({
    icon: t.icon, label: t.label,
    onClick: () => {
      const p = { id: uid(), name: t.label, type: t.type };
      if (t.type === 'select' || t.type === 'multi') p.options = [];
      D().schema.push(p);
      commit(); draw();
    },
  }))]);
}

// ---------- 값 표시 / 편집 ----------
export function tag(o) {
  return h('span', { class: `tag c-${o.color || 'gray'}` }, o.name);
}

export function valueView(r, p, onChange) {
  const v = getVal(r, p);
  switch (p.type) {
    case 'select': { const o = p.options?.find((x) => x.id === v); return o ? tag(o) : empty(); }
    case 'multi': { const os = (v || []).map((id) => p.options?.find((x) => x.id === id)).filter(Boolean); return os.length ? h('span', { class: 'tags' }, os.map(tag)) : empty(); }
    case 'checkbox': return h('input', { type: 'checkbox', class: 'cell-check', checked: !!v, onclick: (e) => e.stopPropagation(), onchange: (e) => { setVal(r, p, e.target.checked); onChange?.(); } });
    case 'date': return v ? h('span', {}, fmtDate(v)) : empty();
    case 'created': case 'edited': return h('span', { class: 'muted' }, fmtDate(v, true));
    case 'url': return v ? h('a', { href: /^https?:/.test(v) ? v : 'https://' + v, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, v) : empty();
    case 'email': return v ? h('a', { href: 'mailto:' + v, onclick: (e) => e.stopPropagation() }, v) : empty();
    case 'number': return v === '' || v == null ? empty() : h('span', { class: 'num' }, Number(v).toLocaleString('ko-KR'));
    default: return v ? h('span', {}, v) : empty();
  }
}
const empty = () => h('span', { class: 'empty-val' }, '비어 있음');

/** 값 편집 팝업 */
export function editValue(anchor, r, p, onDone) {
  if (p.type === 'checkbox') { setVal(r, p, !getVal(r, p)); return onDone?.(); }
  if (p.type === 'created' || p.type === 'edited') return;
  if (p.type === 'select' || p.type === 'multi') return optionEditor(anchor, r, p, onDone);
  const inputType = { number: 'number', date: 'date', url: 'url', email: 'email', phone: 'tel' }[p.type] || 'text';
  const inp = h('input', { class: 'inp', type: inputType, value: getVal(r, p) ?? '' });
  const done = () => {
    let v = inp.value;
    if (p.type === 'number') v = v === '' ? '' : Number(v);
    setVal(r, p, v);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeMenu(); } });
  menu(anchor, [inp], { className: 'value-editor', onClose: () => { done(); onDone?.(); } });
  inp.focus();
  if (inp.select) inp.select();
}

function optionEditor(anchor, r, p, onDone) {
  p.options ||= [];
  const multi = p.type === 'multi';
  const box = h('div', { class: 'opt-box' });
  const cur = () => (multi ? getVal(r, p) || [] : getVal(r, p) ? [getVal(r, p)] : []);
  const inp = h('input', { class: 'inp', placeholder: '옵션 검색 또는 새로 만들기' });
  const choose = (o) => {
    if (multi) {
      const c = cur();
      setVal(r, p, c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]);
      redraw();
    } else {
      setVal(r, p, getVal(r, p) === o.id ? '' : o.id);
      closeMenu();
    }
  };
  const redraw = () => {
    box.innerHTML = '';
    const q = inp.value.trim();
    const sel = cur();
    box.append(h('div', { class: 'opt-current' }, sel.map((id) => p.options.find((o) => o.id === id)).filter(Boolean).map(tag)));
    p.options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase())).forEach((o) => {
      const row = h('div', { class: 'opt-row' + (sel.includes(o.id) ? ' on' : '') },
        h('button', { class: 'opt-pick', onclick: () => choose(o) }, tag(o)),
        h('button', { class: 'icon-btn', title: '옵션 편집', onclick: (e) => { e.stopPropagation(); optionMenu(row, p, o, redraw); } }, '⋯'));
      box.append(row);
    });
    if (q && !p.options.some((o) => o.name === q))
      box.append(h('button', { class: 'menu-item', onclick: () => create(q) }, h('span', { class: 'mi-icon' }, '+'), `'${q}' 만들기`));
  };
  const create = (name) => {
    const o = opt(name, COLORS[(p.options.length % 9) + 1]);
    p.options.push(o);
    commit();
    inp.value = '';
    choose(o);
    if (multi) redraw();
  };
  inp.addEventListener('input', redraw);
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = inp.value.trim();
    if (!q) return closeMenu();
    const ex = p.options.find((o) => o.name.toLowerCase() === q.toLowerCase());
    if (ex) { inp.value = ''; choose(ex); } else create(q);
  });
  redraw();
  menu(anchor, [inp, box], { className: 'value-editor', onClose: () => onDone?.() });
  inp.focus();
}

function optionMenu(anchor, p, o, redraw) {
  const name = h('input', { class: 'inp', value: o.name });
  name.addEventListener('change', () => { if (name.value.trim()) { o.name = name.value.trim(); commit(); redraw(); } });
  const colors = h('div', { class: 'color-list' }, COLORS.filter((c) => c !== 'default').map((c) =>
    h('button', { class: 'menu-item' + (o.color === c ? ' active' : ''), onclick: () => { o.color = c; commit(); redraw(); colors.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('active', b.textContent.includes(COLOR_LABEL[c]))); } },
      h('span', { class: `swatch-dot c-${c}` }), COLOR_LABEL[c])));
  // 중첩 메뉴는 지원하지 않으므로 같은 팝업 아래에 펼친다
  const host = anchor.closest('.menu');
  host.querySelector('.opt-edit')?.remove();
  host.append(h('div', { class: 'opt-edit' }, name,
    h('button', { class: 'menu-item danger', onclick: () => {
      p.options = p.options.filter((x) => x !== o);
      commit();
      host.querySelector('.opt-edit')?.remove();
      redraw();
    } }, h('span', { class: 'mi-icon' }, '🗑'), '옵션 삭제'), colors));
}

// ---------- 행 메뉴 ----------
function rowMenu(anchor, r) {
  menu(anchor, [
    { icon: '↗', label: '페이지로 열기', onClick: () => ctx.nav(r.id) },
    { icon: '⧉', label: '복제', onClick: () => { duplicatePage(r.id); draw(); } },
    { icon: '🗑', label: '삭제', danger: true, onClick: () => { trashPage(r.id); draw(); toast('휴지통으로 옮겼습니다'); } },
  ]);
}

// ---------- 표 ----------
function table(body, rows, view) {
  const schema = D().schema;
  const head = h('div', { class: 'tr th-row' },
    schema.map((p) => h('div', {
      class: 'th' + (p.type === 'title' ? ' title-col' : ''),
      onclick: (e) => propMenu(e.currentTarget, p, view),
    }, h('span', { class: 'th-icon' }, typeIcon(p.type)), p.name)),
    h('div', { class: 'th add', title: '속성 추가', onclick: (e) => addPropMenu(e.currentTarget) }, '+'));
  const tbl = h('div', { class: 'table' }, head);
  for (const r of rows) {
    const tr = h('div', { class: 'tr', 'data-row': r.id });
    for (const p of schema) {
      if (p.type === 'title') {
        const inp = h('input', { class: 'title-input', value: r.title, placeholder: '제목 없음' });
        inp.addEventListener('input', () => setVal(r, p, inp.value));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); newRow(view); } });
        tr.append(h('div', { class: 'td title-col' },
          h('span', { class: 'row-icon' }, r.icon || '📄'), inp,
          h('button', { class: 'open-btn', onclick: () => ctx.nav(r.id) }, '열기'),
          h('button', { class: 'icon-btn row-more', title: '행 메뉴', onclick: (e) => rowMenu(e.currentTarget, r) }, '⋯')));
      } else {
        const td = h('div', { class: `td t-${p.type}` });
        td.append(valueView(r, p, () => redrawBody(view)));
        if (p.type !== 'checkbox') td.addEventListener('click', () => editValue(td, r, p, () => redrawBody(view)));
        tr.append(td);
      }
    }
    tr.append(h('div', { class: 'td add' }));
    tbl.append(tr);
  }
  tbl.append(h('button', { class: 'add-row', onclick: () => newRow(view) }, '+ 새로 만들기'));
  body.append(h('div', { class: 'table-wrap' }, tbl), h('div', { class: 'db-count' }, `개수 ${rows.length}`));
}

// ---------- 보드 ----------
function cardEl(r, view, skip) {
  const props = D().schema.filter((p) => p.type !== 'title' && p.id !== skip);
  const card = h('div', { class: 'card', draggable: 'true', 'data-row': r.id, onclick: () => ctx.nav(r.id) },
    h('div', { class: 'card-title' }, r.icon ? r.icon + ' ' : '', titleOf(r)),
    props.map((p) => {
      const v = getVal(r, p);
      if (v == null || v === '' || (Array.isArray(v) && !v.length) || p.type === 'created' || p.type === 'edited' || (p.type === 'checkbox' && !v)) return null;
      return h('div', { class: 'card-prop' }, valueView(r, p, () => redrawBody(view)));
    }));
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-row', r.id); card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function board(body, rows, view) {
  const g = prop(view.groupBy);
  if (!g || g.type !== 'select') {
    body.append(h('div', { class: 'db-empty' }, '보드 보기는 «선택» 유형 속성으로 그룹을 나눕니다. ',
      h('button', { class: 'btn', onclick: () => {
        const p = { id: uid(), name: '상태', type: 'select', options: [opt('시작 전', 'gray'), opt('진행 중', 'blue'), opt('완료', 'green')] };
        D().schema.push(p); view.groupBy = p.id; commit(); draw();
      } }, '«상태» 속성 만들기')));
    return;
  }
  const groups = [{ id: '', name: `${g.name} 없음`, color: 'default' }, ...g.options];
  const wrap = h('div', { class: 'board' });
  for (const o of groups) {
    const items = rows.filter((r) => (o.id ? getVal(r, g) === o.id : !g.options.some((x) => x.id === getVal(r, g))));
    if (!o.id && !items.length) continue;
    const col = h('div', { class: `col col-${o.color}` },
      h('div', { class: 'col-head' }, o.id ? tag(o) : h('span', { class: 'muted' }, o.name), h('span', { class: 'count' }, items.length)),
      items.map((r) => cardEl(r, view, g.id)),
      h('button', { class: 'add-card', onclick: () => newRow(view, { [g.id]: o.id }, true) }, '+ 새로 만들기'));
    col.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-row')) { e.preventDefault(); col.classList.add('over'); } });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const r = page(e.dataTransfer.getData('text/x-row'));
      if (r) { setVal(r, g, o.id); commit(); redrawBody(view); }
    });
    wrap.append(col);
  }
  wrap.append(h('button', { class: 'add-group', onclick: () => {
    const n = prompt('새 그룹 이름');
    if (n?.trim()) { g.options.push(opt(n.trim(), COLORS[(g.options.length % 9) + 1])); commit(); draw(); }
  } }, '+ 그룹 추가'));
  body.append(wrap);
}

// ---------- 목록 ----------
function list(body, rows, view) {
  const props = D().schema.filter((p) => p.type !== 'title').slice(0, 4);
  body.append(h('div', { class: 'list-view' },
    rows.map((r) => h('div', { class: 'list-row', 'data-row': r.id, onclick: () => ctx.nav(r.id) },
      h('span', { class: 'row-icon' }, iconOf(r)), h('span', { class: 'list-title' }, titleOf(r)),
      h('span', { class: 'list-props' }, props.map((p) => {
        const v = getVal(r, p);
        return v == null || v === '' || (Array.isArray(v) && !v.length) ? null : valueView(r, p, () => redrawBody(view));
      })))),
    h('button', { class: 'add-row', onclick: () => newRow(view, {}, true) }, '+ 새로 만들기')));
}

// ---------- 갤러리 ----------
function gallery(body, rows, view) {
  body.append(h('div', { class: 'gallery' },
    rows.map((r) => {
      const img = r.blocks.find((b) => b.type === 'image' && b.src);
      const preview = r.blocks.filter((b) => b.html).slice(0, 4).map((b) => stripHtml(b.html)).join(' ');
      const c = cardEl(r, view, null);
      c.prepend(img ? h('div', { class: 'g-cover', style: { backgroundImage: `url("${img.src.replace(/"/g, '%22')}")` } })
        : h('div', { class: 'g-cover text' }, preview || ' '));
      return c;
    }),
    h('button', { class: 'card add-card big', onclick: () => newRow(view, {}, true) }, '+ 새로 만들기')));
}

// ---------- 캘린더 ----------
function calendar(body, rows, view) {
  const dp = prop(view.dateProp);
  if (!dp || dp.type !== 'date') {
    body.append(h('div', { class: 'db-empty' }, '캘린더 보기에는 «날짜» 속성이 필요합니다. ',
      h('button', { class: 'btn', onclick: () => {
        const p = { id: uid(), name: '날짜', type: 'date' };
        D().schema.push(p); view.dateProp = p.id; commit(); draw();
      } }, '«날짜» 속성 만들기')));
    return;
  }
  const m = calMonth[view.id] || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  calMonth[view.id] = m;
  const y = m.getFullYear();
  const mo = m.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = (() => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })();
  const go = (d) => { calMonth[view.id] = new Date(y, mo + d, 1); redrawBody(view); };
  const head = h('div', { class: 'cal-head' },
    h('strong', {}, `${y}년 ${mo + 1}월`),
    h('div', {}, h('button', { class: 'tb-btn', onclick: () => go(-1) }, '‹'),
      h('button', { class: 'tb-btn', onclick: () => { calMonth[view.id] = null; redrawBody(view); } }, '오늘'),
      h('button', { class: 'tb-btn', onclick: () => go(1) }, '›')));
  const grid = h('div', { class: 'cal-grid' }, ['일', '월', '화', '수', '목', '금', '토'].map((d) => h('div', { class: 'cal-dow' }, d)));
  for (let i = 0; i < first; i++) grid.append(h('div', { class: 'cal-cell off' }));
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const items = rows.filter((r) => (getVal(r, dp) || '').slice(0, 10) === key);
    const cell = h('div', { class: 'cal-cell' + (key === todayKey ? ' today' : '') },
      h('div', { class: 'cal-day' }, h('span', {}, d),
        h('button', { class: 'cal-add', title: '이 날짜에 추가', onclick: () => newRow(view, { [dp.id]: key }, true) }, '+')),
      items.map((r) => {
        const it = h('div', { class: 'cal-item', draggable: 'true', onclick: () => ctx.nav(r.id) }, titleOf(r));
        it.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-row', r.id));
        return it;
      }));
    cell.addEventListener('dragover', (e) => e.dataTransfer.types.includes('text/x-row') && e.preventDefault());
    cell.addEventListener('drop', (e) => {
      const r = page(e.dataTransfer.getData('text/x-row'));
      if (r) { setVal(r, dp, key); commit(); redrawBody(view); }
    });
    grid.append(cell);
  }
  const undated = rows.filter((r) => !getVal(r, dp));
  body.append(head, grid, undated.length ? h('div', { class: 'db-count' }, `날짜 없음 ${undated.length}개: `,
    undated.map((r) => h('button', { class: 'link-btn', onclick: () => ctx.nav(r.id) }, titleOf(r)))) : null);
}

// ---------- 행 페이지의 속성 패널 ----------
export function propsPanel(r, el, rerender) {
  const db = page(r.parent);
  if (!db?.db) return;
  const schema = db.db.schema.filter((p) => p.type !== 'title');
  el.append(h('div', { class: 'props-panel' },
    schema.map((p) => {
      const val = h('div', { class: `prop-val t-${p.type}` }, valueView(r, p, rerender));
      if (p.type !== 'checkbox') val.addEventListener('click', () => editValue(val, r, p, rerender));
      return h('div', { class: 'prop-row' }, h('div', { class: 'prop-name' }, h('span', { class: 'th-icon' }, typeIcon(p.type)), p.name), val);
    })));
}
