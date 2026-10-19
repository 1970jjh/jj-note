// 블록 에디터: 슬래시 명령어 · 마크다운 단축키 · 드래그 이동 · 들여쓰기/토글
import { page, blk, touch, saveNow, createPage, createDatabase, trashPage, titleOf, iconOf, isTrashed, emit } from './store.js';
import { h, menu, closeMenu, place, emojiPicker, COLORS, COLOR_LABEL, toast } from './ui.js';

export const TYPES = [
  { type: 'text', label: '텍스트', icon: 'Aa', keys: 'text paragraph 텍스트 본문' },
  { type: 'h1', label: '제목 1', icon: 'H1', keys: 'h1 heading title 제목1 큰제목' },
  { type: 'h2', label: '제목 2', icon: 'H2', keys: 'h2 heading 제목2 중간제목' },
  { type: 'h3', label: '제목 3', icon: 'H3', keys: 'h3 heading 제목3 소제목' },
  { type: 'bullet', label: '글머리 기호 목록', icon: '•', keys: 'bullet list ul 목록 글머리' },
  { type: 'number', label: '번호 매기기 목록', icon: '1.', keys: 'number ordered ol 번호' },
  { type: 'todo', label: '할 일 목록', icon: '☑', keys: 'todo check task 할일 체크' },
  { type: 'toggle', label: '토글 목록', icon: '▸', keys: 'toggle 토글 접기' },
  { type: 'quote', label: '인용', icon: '❝', keys: 'quote 인용' },
  { type: 'callout', label: '콜아웃', icon: '💡', keys: 'callout 콜아웃 강조 박스' },
  { type: 'code', label: '코드', icon: '</>', keys: 'code 코드' },
  { type: 'divider', label: '구분선', icon: '—', keys: 'divider hr line 구분선' },
  { type: 'image', label: '이미지', icon: '🖼', keys: 'image img picture 이미지 사진 그림' },
  { type: 'bookmark', label: '웹 북마크', icon: '🔗', keys: 'bookmark link url 링크 북마크' },
  { type: 'page', label: '페이지', icon: '📄', keys: 'page subpage 페이지 하위' },
  { type: 'database', label: '데이터베이스', icon: '🗂', keys: 'database table board db 데이터베이스 표 보드' },
];
const TEXTUAL = new Set(['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout', 'code']);
const LISTY = new Set(['bullet', 'number', 'todo', 'toggle', 'quote', 'callout']);
const MD = [
  [/^###\s/, 'h3'], [/^##\s/, 'h2'], [/^#\s/, 'h1'], [/^[-*+]\s/, 'bullet'], [/^1[.)]\s/, 'number'],
  [/^\[\s?\]\s/, 'todo'], [/^>\s/, 'toggle'], [/^["“]\s/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider'],
];
const PLACEHOLDER = {
  text: "글을 쓰거나 '/' 를 눌러 명령어 사용", h1: '제목 1', h2: '제목 2', h3: '제목 3',
  bullet: '목록', number: '목록', todo: '할 일', toggle: '토글', quote: '인용', callout: '내용', code: '코드',
};

let ctx = null; // { p, el, root, nav }
let slash = null; // { b, ce, start, m, items, sel }

export function mountEditor(p, el, root, nav) {
  ctx = { p, el, root, nav };
  if (!p.blocks.length) p.blocks.push(blk());
  render();
}

export function focusFirstBlock() {
  if (!ctx) return;
  const first = ctx.p.blocks[0];
  if (!first || !TEXTUAL.has(first.type)) {
    const nb = blk();
    ctx.p.blocks.unshift(nb);
    render({ id: nb.id, pos: 'start' });
  } else render({ id: first.id, pos: 'start' });
}

// ---------- 렌더 ----------
function render(focus) {
  const { p, el } = ctx;
  closeSlash();
  el.innerHTML = '';
  const list = h('div', { class: 'blocks' });
  let hideIndent = null;
  const num = {};
  for (const b of p.blocks) {
    if (hideIndent != null && b.indent > hideIndent) continue;
    hideIndent = null;
    for (const k of Object.keys(num)) if (+k > b.indent) delete num[k];
    if (b.type === 'number') num[b.indent] = (num[b.indent] || 0) + 1;
    else delete num[b.indent];
    list.append(blockEl(b, num[b.indent]));
    if (b.type === 'toggle' && !b.open) hideIndent = b.indent;
  }
  list.append(
    h('div', {
      class: 'blocks-tail',
      title: '클릭하여 새 블록 추가',
      onclick: () => {
        const last = p.blocks[p.blocks.length - 1];
        if (last && TEXTUAL.has(last.type) && !last.html) return render({ id: last.id, pos: 'end' });
        const nb = blk();
        p.blocks.push(nb);
        commit();
        render({ id: nb.id, pos: 'start' });
      },
    })
  );
  el.append(list);
  if (focus) {
    const ce = el.querySelector(`.block[data-id="${focus.id}"] .ce`);
    if (ce) setCaret(ce, focus.pos);
  }
}

const commit = () => touch(ctx.p);
const idx = (b) => ctx.p.blocks.indexOf(b);

function subtreeEnd(i) {
  const bs = ctx.p.blocks;
  let j = i + 1;
  while (j < bs.length && bs[j].indent > bs[i].indent) j++;
  return j;
}

function blockEl(b, n) {
  const row = h('div', {
    class: `block b-${b.type}` + (b.color && b.color !== 'default' ? ` c-${b.color}` : ''),
    'data-id': b.id,
    style: { marginLeft: (b.indent || 0) * 26 + 'px' },
  });
  const handle = h('div', { class: 'handle', draggable: 'true', title: '끌어서 이동 · 클릭하여 메뉴' }, '⋮⋮');
  handle.addEventListener('click', () => blockMenu(handle, b));
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/x-block', b.id);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-block')) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    row.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
    row.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
  row.addEventListener('drop', (e) => {
    const id = e.dataTransfer.getData('text/x-block');
    const after = row.classList.contains('drop-after');
    row.classList.remove('drop-before', 'drop-after');
    if (!id || id === b.id) return;
    e.preventDefault();
    moveBlock(id, b.id, after);
  });
  const plus = h('div', { class: 'plus', title: '아래에 블록 추가' }, '+');
  plus.addEventListener('click', () => {
    const nb = blk('text', { indent: b.indent });
    ctx.p.blocks.splice(subtreeEnd(idx(b)), 0, nb);
    commit();
    render({ id: nb.id, pos: 'start' });
    const ce = ctx.el.querySelector(`.block[data-id="${nb.id}"] .ce`);
    document.execCommand('insertText', false, '/');
    openSlash(nb, ce, 0);
  });
  row.append(h('div', { class: 'gutter' }, plus, handle));
  row.append(blockBody(b, n));
  return row;
}

function blockBody(b, n) {
  switch (b.type) {
    case 'divider':
      return h('div', { class: 'body', tabindex: 0 }, h('hr'));
    case 'image':
      return imageBody(b);
    case 'bookmark':
      return bookmarkBody(b);
    case 'page': {
      const tp = page(b.pageId);
      if (!tp || isTrashed(tp.id))
        return h('div', { class: 'body pagelink missing' }, '🗑️ 휴지통에 있거나 삭제된 페이지');
      return h('div', { class: 'body pagelink', onclick: () => ctx.nav(tp.id) },
        h('span', { class: 'pl-icon' }, iconOf(tp)), h('span', { class: 'pl-title' }, titleOf(tp)));
    }
  }
  const ce = editable(b);
  const body = h('div', { class: 'body' });
  if (b.type === 'todo') {
    body.append(h('input', {
      type: 'checkbox', class: 'todo-check', checked: !!b.checked,
      onchange: (e) => { b.checked = e.target.checked; commit(); body.classList.toggle('done', b.checked); },
    }));
    body.classList.toggle('done', !!b.checked);
  } else if (b.type === 'bullet') body.append(h('span', { class: 'marker' }, ['•', '◦', '▪'][(b.indent || 0) % 3]));
  else if (b.type === 'number') body.append(h('span', { class: 'marker num' }, `${n || 1}.`));
  else if (b.type === 'toggle')
    body.append(h('button', {
      class: 'toggle-arrow' + (b.open ? ' open' : ''), title: b.open ? '접기' : '펼치기',
      onclick: () => { b.open = !b.open; commit(); render(b.open ? { id: b.id, pos: 'end' } : null); },
    }, '▶'));
  else if (b.type === 'callout') {
    const ic = h('button', { class: 'callout-icon', title: '아이콘 변경' }, b.icon || '💡');
    ic.addEventListener('click', () => emojiPicker(ic, (e) => { b.icon = e || '💡'; commit(); render(); }));
    body.append(ic);
  }
  body.append(ce);
  if (b.type === 'code') {
    body.append(h('button', {
      class: 'copy-btn',
      onclick: () => navigator.clipboard?.writeText(ce.innerText).then(() => toast('코드를 복사했습니다')),
    }, '복사'));
  }
  return body;
}

function editable(b) {
  const ce = h('div', {
    class: 'ce', contenteditable: 'true', spellcheck: b.type === 'code' ? 'false' : 'true',
    'data-ph': PLACEHOLDER[b.type] || '', 'data-nav': '', html: b.html || '',
  });
  ce.addEventListener('input', (e) => onInput(e, b, ce));
  ce.addEventListener('keydown', (e) => onKey(e, b, ce));
  ce.addEventListener('paste', (e) => onPaste(e, b, ce));
  ce.addEventListener('blur', () => setTimeout(() => slash?.ce === ce && document.activeElement !== ce && closeSlash(), 150));
  return ce;
}

function imageBody(b) {
  if (b.src)
    return h('div', { class: 'body media' },
      h('img', { src: b.src, alt: b.caption || '이미지', loading: 'lazy' }),
      h('div', {
        class: 'caption', contenteditable: 'true', 'data-ph': '캡션 추가', html: b.caption || '',
        oninput: (e) => { b.caption = e.target.innerHTML; commit(); },
      }));
  const url = h('input', { class: 'inp', placeholder: '이미지 주소(URL) 붙여넣기 후 Enter' });
  url.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = url.value.trim();
    if (!/^(https?:|data:image\/)/.test(v)) return toast('http(s) 로 시작하는 이미지 주소를 넣어 주세요');
    b.src = v; commit(); render();
  });
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden-file' });
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) return toast('1.5MB 이하 이미지만 올릴 수 있어요 (브라우저 저장 용량 한계)');
    const rd = new FileReader();
    rd.onload = () => {
      b.src = rd.result;
      if (!saveNow()) { delete b.src; toast('저장 공간이 부족해 이미지를 넣지 못했습니다'); }
      render();
    };
    rd.readAsDataURL(f);
  });
  return h('div', { class: 'body placeholder-box' }, '🖼 ', url,
    h('button', { class: 'btn', onclick: () => file.click() }, '파일 업로드'), file);
}

function bookmarkBody(b) {
  if (b.url) {
    let host = b.url;
    try { host = new URL(b.url).hostname; } catch { /* 그대로 */ }
    return h('a', { class: 'body bookmark', href: /^https?:\/\//.test(b.url) ? b.url : '#', target: '_blank', rel: 'noopener noreferrer' },
      h('div', { class: 'bm-title' }, host), h('div', { class: 'bm-url' }, b.url));
  }
  const url = h('input', { class: 'inp', placeholder: '링크(URL) 붙여넣기 후 Enter' });
  url.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = url.value.trim();
    if (!/^https?:\/\//.test(v)) return toast('http(s):// 로 시작하는 주소를 넣어 주세요');
    b.url = v; commit(); render();
  });
  return h('div', { class: 'body placeholder-box' }, '🔗 ', url);
}

// ---------- 블록 메뉴 ----------
function blockMenu(anchor, b) {
  const i = idx(b);
  if (i < 0) return render();
  menu(anchor, [
    { icon: '🗑', label: '삭제', hint: 'Del', danger: true, onClick: () => removeBlock(b) },
    { icon: '⧉', label: '복제', onClick: () => {
      const end = subtreeEnd(i);
      const copies = ctx.p.blocks.slice(i, end).filter((x) => x.type !== 'page').map((x) => ({ ...structuredClone(x), id: Math.random().toString(36).slice(2) }));
      if (b.type === 'page') return toast('페이지 블록은 사이드바의 … 메뉴에서 복제하세요');
      ctx.p.blocks.splice(end, 0, ...copies); commit(); render();
    } },
    { icon: '↑', label: '위로 이동', onClick: () => i > 0 && moveBlock(b.id, prevSibling(i)?.id, false) },
    { icon: '↓', label: '아래로 이동', onClick: () => {
      const nx = ctx.p.blocks[subtreeEnd(i)];
      if (nx) moveBlock(b.id, nx.id, true);
    } },
    'sep',
    ...(TEXTUAL.has(b.type) ? [{ header: '전환' }, ...TYPES.filter((t) => TEXTUAL.has(t.type)).map((t) => ({
      icon: t.icon, label: t.label, active: t.type === b.type,
      onClick: () => { b.type = t.type; if (t.type === 'callout') b.icon ||= '💡'; commit(); render({ id: b.id, pos: 'end' }); },
    }))] : []),
    'sep',
    { header: '색' },
    h('div', { class: 'color-row' }, COLORS.map((c) => h('button', {
      class: `swatch c-${c}` + ((b.color || 'default') === c ? ' active' : ''), title: COLOR_LABEL[c],
      onclick: () => { closeMenu(); b.color = c; commit(); render(); },
    }, 'A'))),
  ]);
}

function prevSibling(i) {
  const bs = ctx.p.blocks;
  for (let j = i - 1; j >= 0; j--) {
    if (bs[j].indent === bs[i].indent) return bs[j];
    if (bs[j].indent < bs[i].indent) return null;
  }
  return null;
}

function removeBlock(b) {
  const i = idx(b);
  if (i < 0) return render();
  if (b.type === 'page' && page(b.pageId)) {
    trashPage(b.pageId);
    toast('페이지를 휴지통으로 옮겼습니다');
  }
  ctx.p.blocks.splice(i, 1);
  if (!ctx.p.blocks.length) ctx.p.blocks.push(blk());
  commit();
  const prev = ctx.p.blocks[Math.max(0, i - 1)];
  render(TEXTUAL.has(prev.type) ? { id: prev.id, pos: 'end' } : null);
}

function moveBlock(id, targetId, after) {
  const bs = ctx.p.blocks;
  const from = bs.findIndex((x) => x.id === id);
  if (from < 0 || !targetId) return;
  const end = subtreeEnd(from);
  const chunk = bs.slice(from, end);
  if (chunk.some((x) => x.id === targetId)) return; // 자기 하위로 이동 금지
  bs.splice(from, end - from);
  let t = bs.findIndex((x) => x.id === targetId);
  const target = bs[t];
  const shift = target.indent - chunk[0].indent;
  chunk.forEach((x) => (x.indent = Math.max(0, x.indent + shift)));
  if (after) t = subtreeEnd(t);
  bs.splice(t, 0, ...chunk);
  commit();
  render();
}

// ---------- 입력 처리 ----------
function onInput(e, b, ce) {
  if (ce.innerHTML === '<br>') ce.innerHTML = '';
  b.html = ce.innerHTML;
  commit();
  if (slash) return updateSlash();
  if (e.inputType === 'insertText' && e.data === '/') {
    const off = caretOffset(ce);
    const before = ce.textContent.slice(0, off - 1);
    if (off - 1 === 0 || /\s$/.test(before)) openSlash(b, ce, off - 1);
    return;
  }
  if (b.type === 'text' && (e.data === ' ' || e.data === '`' || e.data === '-')) {
    const t = ce.textContent.replace(/ /g, ' ');
    for (const [re, type] of MD) {
      const m = t.match(re);
      if (!m || caretOffset(ce) !== m[0].length) continue;
      const r = rangeAt(ce, 0, m[0].length);
      r.deleteContents();
      b.html = ce.innerHTML === '<br>' ? '' : ce.innerHTML;
      applyType(b, type);
      return;
    }
  }
}

function onPaste(e, b, ce) {
  const text = e.clipboardData.getData('text/plain');
  e.preventDefault();
  if (!text) return;
  const lines = text.replace(/\r/g, '').split('\n');
  if (b.type === 'code' || lines.length === 1) return document.execCommand('insertText', false, text);
  const { after: tail } = splitAtCaret(ce);
  document.execCommand('insertText', false, lines[0]);
  b.html = ce.innerHTML;
  const fresh = lines.slice(1).filter((l, i, a) => l.trim() || i < a.length - 1).map((l) => {
    const raw = l.replace(/\t/g, '  ');
    const indent = Math.min(4, Math.floor((raw.match(/^ */)[0].length) / 2));
    let s = raw.trim();
    let type = 'text';
    let checked = false;
    const todo = s.match(/^[-*]\s\[( |x)\]\s/i);
    if (todo) { type = 'todo'; checked = todo[1].toLowerCase() === 'x'; s = s.slice(todo[0].length); }
    else for (const [re, t] of MD) { const m = s.match(re); if (m && t !== 'code' && t !== 'divider') { type = t; s = s.slice(m[0].length); break; } }
    if (/^---$/.test(s)) return blk('divider', { indent });
    const d = document.createElement('div');
    d.textContent = s;
    return blk(type, { html: d.innerHTML, indent, checked });
  });
  if (tail) {
    const lastText = fresh.at(-1);
    if (lastText && TEXTUAL.has(lastText.type)) lastText.html += tail;
    else fresh.push(blk('text', { html: tail, indent: b.indent }));
  }
  const i = subtreeEnd(idx(b));
  ctx.p.blocks.splice(i, 0, ...fresh);
  commit();
  const last = fresh[fresh.length - 1];
  render(last && TEXTUAL.has(last.type) ? { id: last.id, pos: 'end' } : null);
}

function onKey(e, b, ce) {
  if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중
  if (slash && slashKey(e)) return;
  const sel = getSelection();
  const collapsed = sel.isCollapsed;
  const off = caretOffset(ce);
  const len = ce.textContent.length;

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (b.type === 'code') return document.execCommand('insertText', false, '\n');
    const empty = !ce.textContent.trim() && !ce.querySelector('img');
    if (empty && LISTY.has(b.type)) {
      if (b.indent > 0) b.indent--;
      else b.type = 'text';
      commit();
      return render({ id: b.id, pos: 'start' });
    }
    const { before, after } = splitAtCaret(ce);
    b.html = before;
    let type = ['bullet', 'number', 'todo', 'toggle'].includes(b.type) ? b.type : 'text';
    let indent = b.indent;
    let at = idx(b) + 1;
    if (b.type === 'toggle') {
      if (b.open && !after) { type = 'text'; indent = b.indent + 1; }
      else at = subtreeEnd(idx(b));
    }
    if (before === '' && after !== '' && off === 0) {
      // 맨 앞에서 Enter → 위에 빈 블록 삽입
      b.html = after;
      const nb = blk(b.type === 'toggle' ? 'text' : type, { indent: b.indent });
      ctx.p.blocks.splice(idx(b), 0, nb);
      commit();
      return render({ id: b.id, pos: 'start' });
    }
    const nb = blk(type, { html: after, indent });
    ctx.p.blocks.splice(at, 0, nb);
    commit();
    return render({ id: nb.id, pos: 'start' });
  }

  if (e.key === 'Backspace' && collapsed && off === 0) {
    e.preventDefault();
    if (b.type !== 'text') { b.type = 'text'; commit(); return render({ id: b.id, pos: 'start' }); }
    if (b.indent > 0) { b.indent--; commit(); return render({ id: b.id, pos: 'start' }); }
    const i = idx(b);
    const prev = visiblePrev(i);
    if (!prev) {
      if (!b.html && ctx.p.blocks.length > 1) { ctx.p.blocks.splice(i, 1); commit(); render(); }
      return focusTitle();
    }
    if (!TEXTUAL.has(prev.type)) {
      if (b.html) return toast('위 블록은 ⋮⋮ 메뉴에서 삭제하세요');
      ctx.p.blocks.splice(i, 1);
      commit();
      return render();
    }
    const pos = textLen(prev.html);
    prev.html = (prev.html || '') + (b.html || '');
    ctx.p.blocks.splice(i, 1);
    commit();
    return render({ id: prev.id, pos });
  }

  if (e.key === 'Delete' && collapsed && off === len) {
    const nx = ctx.p.blocks[idx(b) + 1];
    if (!nx || !TEXTUAL.has(nx.type) || !ctx.el.querySelector(`.block[data-id="${nx.id}"]`)) return;
    e.preventDefault();
    b.html = (b.html || '') + (nx.html || '');
    ctx.p.blocks.splice(idx(nx), 1);
    commit();
    return render({ id: b.id, pos: off });
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const i = idx(b);
    const prev = ctx.p.blocks[i - 1];
    const end = subtreeEnd(i);
    const delta = e.shiftKey ? -1 : 1;
    if (delta < 0 && b.indent === 0) return;
    if (delta > 0 && (!prev || b.indent > prev.indent)) return;
    for (let j = i; j < end; j++) ctx.p.blocks[j].indent += delta;
    if (delta > 0)
      for (let j = i - 1, lv = b.indent; j >= 0 && lv > 0; j--) {
        const a = ctx.p.blocks[j];
        if (a.indent < lv) { lv = a.indent; if (a.type === 'toggle') a.open = true; }
      }
    commit();
    return render({ id: b.id, pos: off });
  }

  if ((e.key === 'ArrowUp' && onEdgeLine(ce, 'top')) || (e.key === 'ArrowLeft' && collapsed && off === 0)) {
    const all = navTargets();
    const k = all.indexOf(ce);
    if (k > 0) { e.preventDefault(); setCaret(all[k - 1], 'end'); }
    return;
  }
  if ((e.key === 'ArrowDown' && onEdgeLine(ce, 'bottom')) || (e.key === 'ArrowRight' && collapsed && off === len)) {
    const all = navTargets();
    const k = all.indexOf(ce);
    if (k >= 0 && k < all.length - 1) { e.preventDefault(); setCaret(all[k + 1], e.key === 'ArrowDown' ? 'start' : 'start'); }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    const r = sel.rangeCount && sel.getRangeAt(0);
    if (!r || r.collapsed) return;
    const code = document.createElement('code');
    code.append(r.extractContents());
    r.insertNode(code);
    b.html = ce.innerHTML;
    commit();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    const i = idx(b);
    ctx.p.blocks.splice(subtreeEnd(i), 0, { ...structuredClone(b), id: Math.random().toString(36).slice(2) });
    commit();
    render({ id: b.id, pos: off });
  }
}

function visiblePrev(i) {
  const bs = ctx.p.blocks;
  for (let j = i - 1; j >= 0; j--) {
    const row = ctx.el.querySelector(`.block[data-id="${bs[j].id}"]`);
    if (row) return bs[j];
  }
  return null;
}

const navTargets = () => [...ctx.root.querySelectorAll('[data-nav]')];
function focusTitle() {
  const t = ctx.root.querySelector('.page-title');
  if (t) setCaret(t, 'end');
}

function onEdgeLine(ce, edge) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  if (!ce.textContent) return true;
  const r = sel.getRangeAt(0).cloneRange();
  let rect = r.getClientRects()[0];
  if (!rect) {
    const tmp = document.createElement('span');
    tmp.textContent = '​';
    r.insertNode(tmp);
    rect = tmp.getBoundingClientRect();
    tmp.remove();
    ce.normalize();
  }
  const box = ce.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(ce).lineHeight) || 24;
  return edge === 'top' ? rect.top - box.top < lh * 0.8 : box.bottom - rect.bottom < lh * 0.8;
}

// ---------- 타입 적용 ----------
function applyType(b, type) {
  const p = ctx.p;
  const empty = !b.html || !b.html.replace(/<br>|&nbsp;|\s/g, '');
  if (TEXTUAL.has(type)) {
    b.type = type;
    if (type === 'callout') b.icon ||= '💡';
    if (type === 'toggle') b.open = true;
    commit();
    return render({ id: b.id, pos: 'end' });
  }
  let target = b;
  if (!empty) {
    target = blk(type, { indent: b.indent });
    p.blocks.splice(idx(b) + 1, 0, target);
  }
  target.type = type;
  target.html = '';
  if (type === 'page' || type === 'database') {
    const child = type === 'page'
      ? createPage({ parent: p.id })
      : createDatabase({ parent: p.id });
    target.type = 'page';
    target.pageId = child.id;
    commit();
    emit('structure');
    return ctx.nav(child.id);
  }
  const after = blk('text', { indent: target.indent });
  p.blocks.splice(idx(target) + 1, 0, after);
  commit();
  render(type === 'divider' ? { id: after.id, pos: 'start' } : null);
  if (type !== 'divider') ctx.el.querySelector(`.block[data-id="${target.id}"] input.inp`)?.focus();
}

// ---------- 슬래시 메뉴 ----------
function openSlash(b, ce, start) {
  closeSlash();
  slash = { b, ce, start, sel: 0, items: TYPES, m: h('div', { class: 'menu slash-menu' }) };
  drawSlash();
  const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : ce.getBoundingClientRect();
  place(slash.m, r.width || r.height ? r : ce.getBoundingClientRect());
}

function updateSlash() {
  const { ce, start } = slash;
  const off = caretOffset(ce);
  const t = ce.textContent;
  if (off <= start || t[start] !== '/') return closeSlash();
  const q = t.slice(start + 1, off).toLowerCase().trim();
  if (q.length > 24) return closeSlash();
  slash.items = TYPES.filter((x) => !q || (x.label + ' ' + x.keys).toLowerCase().includes(q));
  slash.sel = 0;
  if (!slash.items.length && t.slice(start + 1, off).endsWith('  ')) return closeSlash();
  drawSlash();
}

function drawSlash() {
  const { m, items, sel } = slash;
  m.innerHTML = '';
  if (!items.length) m.append(h('div', { class: 'menu-empty' }, '결과 없음'));
  else m.append(h('div', { class: 'menu-header' }, '기본 블록'));
  items.forEach((t, i) =>
    m.append(h('button', {
      class: 'menu-item' + (i === sel ? ' active' : ''),
      onmousedown: (e) => { e.preventDefault(); chooseSlash(i); },
      onmouseenter: () => { slash.sel = i; m.querySelectorAll('.menu-item').forEach((x, k) => x.classList.toggle('active', k === i)); },
    }, h('span', { class: 'mi-icon big' }, t.icon), h('span', { class: 'mi-label' }, t.label)))
  );
  m.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function slashKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = slash.items.length;
    if (n) slash.sel = (slash.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    drawSlash();
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (!slash.items.length) { closeSlash(); return false; }
    e.preventDefault();
    chooseSlash(slash.sel);
    return true;
  }
  if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
  return false;
}

function chooseSlash(i) {
  const { b, ce, start, items } = slash;
  const t = items[i];
  const end = caretOffset(ce);
  closeSlash();
  if (!t) return;
  if (end > start) {
    rangeAt(ce, start, end).deleteContents();
    b.html = ce.innerHTML === '<br>' ? '' : ce.innerHTML;
  }
  applyType(b, t.type);
}

function closeSlash() {
  slash?.m.remove();
  slash = null;
}

// ---------- 캐럿 도우미 ----------
export function caretOffset(el) {
  const s = getSelection();
  if (!s.rangeCount) return 0;
  const r = s.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}

function locate(el, pos) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n;
  while ((n = w.nextNode())) {
    if (acc + n.length >= pos) return { node: n, off: pos - acc };
    acc += n.length;
  }
  return null;
}

export function setCaret(el, pos = 'end') {
  el.focus();
  const s = getSelection();
  const r = document.createRange();
  const loc = typeof pos === 'number' ? locate(el, pos) : null;
  if (loc) {
    r.setStart(loc.node, loc.off);
    r.collapse(true);
  } else {
    r.selectNodeContents(el);
    r.collapse(pos === 'start' || pos === 0);
  }
  s.removeAllRanges();
  s.addRange(r);
}

function rangeAt(el, a, b) {
  const r = document.createRange();
  const s = locate(el, a);
  const e = locate(el, b);
  if (!s || !e) { r.selectNodeContents(el); return r; }
  r.setStart(s.node, s.off);
  r.setEnd(e.node, e.off);
  return r;
}

const clean = (html) => (html === '<br>' ? '' : html);
function splitAtCaret(ce) {
  const sel = getSelection();
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const tail = document.createRange();
  tail.setStart(r.endContainer, r.endOffset);
  tail.setEnd(ce, ce.childNodes.length);
  const box = document.createElement('div');
  box.append(tail.extractContents());
  return { before: clean(ce.innerHTML), after: clean(box.innerHTML) };
}

function textLen(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return d.textContent.length;
}

