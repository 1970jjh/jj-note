// 앱 셸: 사이드바 트리 · 라우팅 · 페이지 화면 · 검색 · 휴지통 · 설정
import {
  load, state, bus, page, save, saveNow, touch, createPage, createDatabase, trashPage, restorePage, destroyPage,
  duplicatePage, toggleFavorite, visit, crumbs, titleOf, iconOf, isTrashed, moveTo, toMarkdown, replaceState, resetAll,
} from './store.js';
import { h, $, menu, modal, toast, download, emojiPicker, stripHtml, fmtDate } from './ui.js';
import { mountEditor, focusFirstBlock, setCaret } from './editor.js';
import { mountDatabase, propsPanel } from './database.js';

const COVERS = [
  'linear-gradient(120deg,#a1c4fd,#c2e9fb)', 'linear-gradient(120deg,#fbc2eb,#a6c1ee)',
  'linear-gradient(120deg,#fdcbf1,#e6dee9)', 'linear-gradient(120deg,#84fab0,#8fd3f4)',
  'linear-gradient(120deg,#f6d365,#fda085)', 'linear-gradient(120deg,#d4fc79,#96e6a1)',
  'linear-gradient(120deg,#30cfd0,#330867)', 'linear-gradient(120deg,#434343,#000000)',
  '#e9e5e3', '#fbecdd', '#ddebf1', '#eae4f2',
];

let currentId = null;

const nav = (id) => {
  if (location.hash === '#/p/' + id) route();
  else location.hash = '#/p/' + id;
};

// ---------- 테마 ----------
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ---------- 사이드바 ----------
function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  const favs = state.favorites.filter((id) => page(id) && !isTrashed(id));
  const roots = state.root.filter((id) => page(id) && !isTrashed(id));
  sb.append(
    h('div', { class: 'sb-top' },
      h('div', { class: 'ws' }, h('span', { class: 'ws-badge' }, 'J'),
        h('span', { class: 'ws-name', title: '이름을 바꾸려면 더블클릭', ondblclick: () => {
          const n = prompt('워크스페이스 이름', state.settings.workspace);
          if (n?.trim()) { state.settings.workspace = n.trim(); save(); renderSidebar(); }
        } }, state.settings.workspace)),
      h('button', { class: 'icon-btn', title: '사이드바 닫기 (Ctrl+\\)', onclick: toggleSidebar }, '«')),
    h('div', { class: 'sb-actions' },
      sbBtn('🔍', '검색', openSearch, 'Ctrl+K'),
      sbBtn('🏠', '홈', () => (location.hash = '#/')),
      sbBtn('📝', '새 페이지', () => nav(createPage().id)),
      sbBtn('🗂️', '새 데이터베이스', () => nav(createDatabase().id))),
    favs.length ? h('div', { class: 'sb-section' }, h('div', { class: 'sb-label' }, '즐겨찾기'),
      favs.map((id) => treeItem(id, 0, true))) : null,
    h('div', { class: 'sb-section grow' },
      h('div', { class: 'sb-label' }, '개인 페이지',
        h('button', { class: 'icon-btn sm', title: '페이지 추가', onclick: () => nav(createPage().id) }, '+')),
      roots.map((id) => treeItem(id, 0)),
      roots.length ? null : h('div', { class: 'sb-empty' }, '페이지가 없습니다'),
      rootDropZone()),
    h('div', { class: 'sb-bottom' },
      sbBtn('🗑️', '휴지통', openTrash),
      sbBtn('⚙️', '설정 · 백업', openSettings)));
  markActive();
}

function sbBtn(icon, label, onClick, hint) {
  return h('button', { class: 'sb-btn', onclick: onClick }, h('span', { class: 'sb-ic' }, icon), h('span', { class: 'sb-txt' }, label), hint ? h('span', { class: 'kbd' }, hint) : null);
}

function rootDropZone() {
  const z = h('div', { class: 'root-drop' }, '여기에 놓으면 최상위로 이동');
  z.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); z.classList.add('over'); } });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('over'); moveTo(e.dataTransfer.getData('text/x-page'), null); });
  return z;
}

function treeItem(id, depth, fav = false) {
  const p = page(id);
  const kids = p.children.filter((c) => page(c) && !isTrashed(c));
  const key = (fav ? 'f:' : '') + id;
  const open = !!state.expanded[key];
  const row = h('div', { class: 'tree-row', 'data-page': id, style: { paddingLeft: 6 + depth * 14 + 'px' }, draggable: fav ? 'false' : 'true' },
    h('button', { class: 'tw-arrow' + (open ? ' open' : '') + (kids.length || p.db ? '' : ' leaf'), title: open ? '접기' : '펼치기',
      onclick: (e) => { e.stopPropagation(); state.expanded[key] = !open; save(); renderSidebar(); } }, '▶'),
    h('span', { class: 'tw-icon' }, iconOf(p)),
    h('span', { class: 'tw-title' }, titleOf(p)),
    h('span', { class: 'tw-tools' },
      h('button', { class: 'icon-btn sm', title: '삭제, 복제 등', onclick: (e) => { e.stopPropagation(); pageMenu(e.currentTarget, id); } }, '⋯'),
      p.db ? null : h('button', { class: 'icon-btn sm', title: '하위 페이지 추가', onclick: (e) => {
        e.stopPropagation();
        const c = createPage({ parent: id });
        p.blocks.push({ id: c.id + 'b', type: 'page', pageId: c.id, html: '', indent: 0 });
        state.expanded[key] = true;
        touch(p);
        nav(c.id);
      } }, '+')));
  row.addEventListener('click', () => nav(id));
  if (!fav) {
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-page', id); e.stopPropagation(); });
    row.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-page')) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      row.dataset.drop = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
    });
    row.addEventListener('dragleave', () => delete row.dataset.drop);
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = e.dataTransfer.getData('text/x-page');
      const where = row.dataset.drop;
      delete row.dataset.drop;
      if (!src || src === id) return;
      if (where === 'inside') { if (p.db) return toast('데이터베이스 안에는 페이지를 넣을 수 없어요'); state.expanded[id] = true; moveTo(src, id); }
      else {
        const sibs = (p.parent ? page(p.parent).children : state.root).filter((x) => x !== src);
        moveTo(src, p.parent, where === 'before' ? id : sibs[sibs.indexOf(id) + 1] || null);
      }
    });
  }
  const wrap = h('div', { class: 'tree-node' }, row);
  if (open) {
    if (p.db) {
      const rows = p.db.rows.filter((r) => page(r) && !page(r).trashed).slice(0, 30);
      rows.forEach((r) => wrap.append(h('div', { class: 'tree-row sub', 'data-page': r, style: { paddingLeft: 26 + depth * 14 + 'px' }, onclick: () => nav(r) },
        h('span', { class: 'tw-icon' }, iconOf(page(r))), h('span', { class: 'tw-title' }, titleOf(page(r))))));
      if (!rows.length) wrap.append(h('div', { class: 'tree-empty', style: { paddingLeft: 30 + depth * 14 + 'px' } }, '항목 없음'));
    } else if (kids.length) kids.forEach((c) => wrap.append(treeItem(c, depth + 1, fav)));
    else wrap.append(h('div', { class: 'tree-empty', style: { paddingLeft: 30 + depth * 14 + 'px' } }, '하위 페이지 없음'));
  }
  return wrap;
}

function markActive() {
  document.querySelectorAll('.tree-row').forEach((r) => r.classList.toggle('active', r.dataset.page === currentId));
}

function pageMenu(anchor, id) {
  const p = page(id);
  menu(anchor, [
    { icon: state.favorites.includes(id) ? '★' : '☆', label: state.favorites.includes(id) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가', onClick: () => { toggleFavorite(id); renderTop(); } },
    { icon: '⧉', label: '복제', hint: 'Ctrl+D', onClick: () => nav(duplicatePage(id).id) },
    { icon: '✎', label: '이름 바꾸기', onClick: () => {
      const n = prompt('페이지 이름', p.title);
      if (n != null) { p.title = n; touch(p); renderSidebar(); if (currentId === id) route(); }
    } },
    { icon: '🔗', label: '링크 복사', onClick: () => copyLink(id) },
    { icon: '⬇', label: '마크다운으로 내보내기', onClick: () => download(`${titleOf(p)}.md`, toMarkdown(p), 'text/markdown') },
    'sep',
    { icon: '🗑', label: '휴지통으로 이동', danger: true, onClick: () => {
      trashPage(id);
      toast(`'${titleOf(p)}' 을(를) 휴지통으로 옮겼습니다`);
      if (currentId && isTrashed(currentId)) location.hash = '#/';
    } },
  ]);
}

function copyLink(id) {
  const url = location.origin + location.pathname + '#/p/' + id;
  navigator.clipboard?.writeText(url).then(() => toast('링크를 복사했습니다'), () => prompt('링크', url));
}

function toggleSidebar() {
  document.body.classList.toggle('sb-closed');
}

// ---------- 라우팅 ----------
function route() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  const id = m?.[1];
  document.body.classList.remove('sb-mobile-open');
  if (id && page(id) && !isTrashed(id)) {
    currentId = id;
    visit(id);
    const closed = crumbs(id).slice(0, -1).filter((c) => !state.expanded[c.id]);
    if (closed.length) {
      closed.forEach((c) => (state.expanded[c.id] = true));
      renderSidebar();
    }
    renderPage(page(id));
  } else {
    currentId = null;
    renderHome();
  }
  markActive();
}

// ---------- 상단 바 ----------
function renderTop() {
  const top = $('#topbar');
  top.innerHTML = '';
  top.append(h('button', { class: 'icon-btn menu-toggle', title: '사이드바', onclick: () => {
    if (innerWidth < 760) document.body.classList.toggle('sb-mobile-open');
    else toggleSidebar();
  } }, '☰'));
  const p = page(currentId);
  if (!p) { top.append(h('div', { class: 'crumbs' }, h('span', {}, '🏠 홈'))); return; }
  top.append(h('div', { class: 'crumbs' }, crumbs(p.id).flatMap((c, i, a) => [
    h('button', { class: 'crumb', onclick: () => nav(c.id) }, iconOf(c), ' ', titleOf(c)),
    i < a.length - 1 ? h('span', { class: 'sep' }, '/') : null,
  ])));
  top.append(h('div', { class: 'top-actions' },
    h('span', { class: 'muted small edited' }, '편집 ' + fmtDate(p.updatedAt, true)),
    h('button', { class: 'tb-btn', onclick: () => copyLink(p.id) }, '공유'),
    h('button', { class: 'icon-btn star' + (state.favorites.includes(p.id) ? ' on' : ''), title: '즐겨찾기', onclick: () => { toggleFavorite(p.id); renderTop(); } }, state.favorites.includes(p.id) ? '★' : '☆'),
    h('button', { class: 'icon-btn', title: '더보기', onclick: (e) => moreMenu(e.currentTarget, p) }, '⋯')));
}

function moreMenu(anchor, p) {
  menu(anchor, [
    { icon: '↔', label: p.fullWidth ? '기본 너비' : '전체 너비', onClick: () => { p.fullWidth = !p.fullWidth; touch(p); route(); } },
    { icon: '⧉', label: '복제', onClick: () => nav(duplicatePage(p.id).id) },
    { icon: '🔗', label: '링크 복사', onClick: () => copyLink(p.id) },
    { icon: '⬇', label: '마크다운으로 내보내기', onClick: () => download(`${titleOf(p)}.md`, toMarkdown(p), 'text/markdown') },
    { icon: '🖨', label: '인쇄 / PDF 저장', onClick: () => print() },
    'sep',
    { icon: '🗑', label: '휴지통으로 이동', danger: true, onClick: () => { trashPage(p.id); location.hash = p.parent && !isTrashed(p.parent) ? '#/p/' + p.parent : '#/'; } },
    h('div', { class: 'menu-foot' }, `생성 ${fmtDate(p.createdAt, true)}`, h('br'), `단어 ${p.blocks.map((b) => stripHtml(b.html)).join(' ').split(/\s+/).filter(Boolean).length}개`),
  ]);
}

// ---------- 페이지 ----------
function renderPage(p) {
  renderTop();
  document.title = `${p.icon ? p.icon + ' ' : ''}${titleOf(p)} · JJ 노트`;
  const main = $('#content');
  main.innerHTML = '';
  main.scrollTop = 0;
  const wrap = h('div', { class: 'page' + (p.fullWidth || p.db ? ' full' : '') });
  if (p.cover) main.append(coverEl(p));
  const head = h('div', { class: 'page-head' + (p.cover ? ' has-cover' : '') });
  if (p.icon) {
    const ic = h('button', { class: 'page-icon', title: '아이콘 변경' }, p.icon);
    ic.addEventListener('click', () => emojiPicker(ic, (e) => { p.icon = e; touch(p); route(); renderSidebar(); }));
    head.append(ic);
  }
  head.append(h('div', { class: 'head-tools' },
    p.icon ? null : h('button', { class: 'ghost-btn', onclick: (e) => emojiPicker(e.currentTarget, (em) => { p.icon = em; touch(p); route(); renderSidebar(); }) }, '😀 아이콘 추가'),
    p.cover ? null : h('button', { class: 'ghost-btn', onclick: () => { p.cover = COVERS[Math.floor(Math.random() * COVERS.length)]; touch(p); route(); } }, '🖼 커버 추가')));
  const title = h('div', { class: 'page-title', contenteditable: 'true', 'data-ph': '제목 없음', 'data-nav': '', spellcheck: 'false' });
  title.textContent = p.title;
  title.addEventListener('input', () => {
    p.title = title.textContent;
    touch(p);
    document.title = `${titleOf(p)} · JJ 노트`;
    document.querySelectorAll(`.tree-row[data-page="${p.id}"] .tw-title`).forEach((t) => (t.textContent = titleOf(p)));
  });
  title.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); if (!p.db) focusFirstBlock(); }
    if (e.key === 'ArrowDown' && !p.db) { e.preventDefault(); focusFirstBlock(); }
  });
  title.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' ')); });
  head.append(title);
  wrap.append(head);
  if (p.isRow) {
    const panel = h('div');
    const redraw = () => { panel.innerHTML = ''; propsPanel(p, panel, redraw); };
    redraw();
    wrap.append(panel, h('hr', { class: 'props-sep' }));
  }
  if (p.db) {
    const dbEl = h('div', { class: 'database' });
    wrap.append(dbEl);
    mountDatabase(p, dbEl, nav);
  } else {
    const ed = h('div', { class: 'editor' });
    wrap.append(ed);
    main.append(wrap);
    mountEditor(p, ed, wrap, nav);
    if (!p.title && p.blocks.length <= 1 && !p.blocks[0]?.html) setCaret(title, 'end');
    return;
  }
  main.append(wrap);
  if (!p.title) setCaret(title, 'end');
}

function coverEl(p) {
  const isImg = /^(https?:|data:)/.test(p.cover);
  const c = h('div', { class: 'cover', style: { background: isImg ? `center/cover no-repeat url("${p.cover.replace(/"/g, '%22')}")` : p.cover } });
  c.append(h('div', { class: 'cover-tools' },
    h('button', { class: 'tb-btn', onclick: (e) => coverMenu(e.currentTarget, p) }, '커버 변경'),
    h('button', { class: 'tb-btn', onclick: () => { p.cover = ''; touch(p); route(); } }, '제거')));
  return c;
}

function coverMenu(anchor, p) {
  const url = h('input', { class: 'inp', placeholder: '이미지 URL 붙여넣고 Enter' });
  url.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!/^https?:\/\//.test(url.value.trim())) return toast('http(s):// 주소를 넣어 주세요');
    p.cover = url.value.trim(); touch(p); route();
  });
  menu(anchor, [
    h('div', { class: 'cover-grid' }, COVERS.map((cv) => h('button', { class: 'cover-swatch', style: { background: cv }, onclick: () => { p.cover = cv; touch(p); route(); } }))),
    url,
  ], { className: 'wide' });
}

// ---------- 홈 ----------
function renderHome() {
  renderTop();
  document.title = 'JJ 노트';
  const main = $('#content');
  main.innerHTML = '';
  const recent = state.recent.filter((id) => page(id) && !isTrashed(id));
  const hour = new Date().getHours();
  const greet = hour < 12 ? '좋은 아침입니다' : hour < 18 ? '좋은 오후입니다' : '좋은 저녁입니다';
  main.append(h('div', { class: 'page home' },
    h('h1', { class: 'home-title' }, greet),
    h('div', { class: 'home-label' }, '최근 방문'),
    h('div', { class: 'home-cards' },
      recent.map((id) => {
        const p = page(id);
        return h('button', { class: 'home-card', onclick: () => nav(id) },
          h('div', { class: 'hc-cover', style: { background: p.cover && !/^(https?:|data:)/.test(p.cover) ? p.cover : 'var(--bg-soft)' } }),
          h('div', { class: 'hc-icon' }, iconOf(p)),
          h('div', { class: 'hc-title' }, titleOf(p)),
          h('div', { class: 'hc-date muted small' }, fmtDate(p.updatedAt)));
      }),
      h('button', { class: 'home-card new', onclick: () => nav(createPage().id) }, h('div', { class: 'hc-plus' }, '+'), h('div', { class: 'hc-title' }, '새 페이지'))),
    h('div', { class: 'home-label' }, '빠른 시작'),
    h('div', { class: 'home-quick' },
      h('button', { class: 'btn', onclick: () => nav(createPage({ title: '회의록 ' + new Date().toLocaleDateString('ko-KR'), icon: '📒' }).id) }, '📒 회의록'),
      h('button', { class: 'btn', onclick: () => nav(createDatabase({ title: '프로젝트 관리' }).id) }, '🗂️ 프로젝트 데이터베이스'),
      h('button', { class: 'btn', onclick: openSearch }, '🔍 검색 (Ctrl+K)'))));
}

// ---------- 검색 ----------
function openSearch() {
  const inp = h('input', { class: 'search-input', placeholder: '페이지 제목과 내용 검색…' });
  const list = h('div', { class: 'search-list' });
  let sel = 0;
  let results = [];
  const all = () => Object.values(state.pages).filter((p) => !isTrashed(p.id));
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    results = q
      ? all().map((p) => {
          const body = p.blocks.map((b) => stripHtml(b.html)).join(' ');
          const t = titleOf(p).toLowerCase();
          const score = t.includes(q) ? 2 : body.toLowerCase().includes(q) ? 1 : 0;
          const i = body.toLowerCase().indexOf(q);
          return { p, score, snip: i >= 0 ? body.slice(Math.max(0, i - 20), i + 60) : '' };
        }).filter((x) => x.score).sort((a, b) => b.score - a.score || b.p.updatedAt - a.p.updatedAt).slice(0, 30)
      : state.recent.filter((id) => page(id) && !isTrashed(id)).map((id) => ({ p: page(id), snip: '' }));
    sel = Math.min(sel, Math.max(0, results.length - 1));
    list.innerHTML = '';
    if (!results.length) list.append(h('div', { class: 'menu-empty' }, q ? '결과가 없습니다' : '최근 페이지가 없습니다'));
    else list.append(h('div', { class: 'menu-header' }, q ? '검색 결과' : '최근 방문'));
    results.forEach((r, i) => list.append(h('button', { class: 'search-item' + (i === sel ? ' active' : ''), onclick: () => { m.close(); nav(r.p.id); } },
      h('span', { class: 'si-icon' }, iconOf(r.p)),
      h('span', { class: 'si-main' }, h('span', { class: 'si-title' }, titleOf(r.p)),
        h('span', { class: 'si-path muted small' }, crumbs(r.p.id).slice(0, -1).map(titleOf).join(' / ')),
        r.snip ? h('span', { class: 'si-snip muted small' }, '…' + r.snip + '…') : null))));
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    if (e.key === 'Enter' && results[sel]) { m.close(); nav(results[sel].p.id); }
  });
  const m = modal([h('div', { class: 'search-head' }, '🔍', inp), list], { className: 'search-modal' });
  draw();
  inp.focus();
}

// ---------- 휴지통 ----------
function openTrash() {
  const box = h('div', { class: 'trash' });
  const draw = () => {
    box.innerHTML = '';
    const items = Object.values(state.pages).filter((p) => p.trashed).sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
    box.append(h('h3', {}, '휴지통'));
    if (!items.length) box.append(h('div', { class: 'menu-empty' }, '휴지통이 비어 있습니다'));
    items.forEach((p) => box.append(h('div', { class: 'trash-row' },
      h('span', {}, iconOf(p), ' ', titleOf(p)),
      h('span', { class: 'muted small' }, fmtDate(p.trashedAt, true)),
      h('button', { class: 'tb-btn', onclick: () => { restorePage(p.id); draw(); toast('복원했습니다'); } }, '복원'),
      h('button', { class: 'tb-btn danger', onclick: () => {
        if (confirm(`'${titleOf(p)}' 와 하위 페이지를 영구 삭제할까요? 되돌릴 수 없습니다.`)) { destroyPage(p.id); draw(); }
      } }, '영구 삭제'))));
  };
  draw();
  modal(box, { className: 'trash-modal' });
}

// ---------- 설정 ----------
function openSettings() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden-file' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('현재 데이터를 백업 파일 내용으로 바꿀까요?')) return;
      replaceState(data);
      m.close();
      boot();
      toast('가져오기를 마쳤습니다');
    } catch (e) {
      alert('가져오기 실패: ' + e.message);
    }
  });
  const themeBtn = (t, label) => h('button', { class: 'tb-btn' + (state.settings.theme === t ? ' on' : ''), onclick: () => { state.settings.theme = t; save(); applyTheme(); m.close(); openSettings(); } }, label);
  const used = new Blob([localStorage.getItem('jjnote.v1') || '']).size;
  const m = modal(h('div', { class: 'settings' },
    h('h3', {}, '설정 · 백업'),
    h('div', { class: 'set-row' }, h('span', {}, '테마'), h('div', {}, themeBtn('system', '시스템'), themeBtn('light', '라이트'), themeBtn('dark', '다크'))),
    h('div', { class: 'set-row' }, h('span', {}, '저장 위치'), h('span', { class: 'muted' }, `이 브라우저 (사용 ${(used / 1024).toFixed(0)}KB / 약 5MB)`)),
    h('div', { class: 'set-row' }, h('span', {}, '백업'), h('div', {},
      h('button', { class: 'tb-btn', onclick: () => { saveNow(); download(`jj-note-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state), 'application/json'); } }, 'JSON 내보내기'),
      h('button', { class: 'tb-btn', onclick: () => file.click() }, 'JSON 가져오기'), file)),
    h('div', { class: 'set-row' }, h('span', {}, '초기화'), h('button', { class: 'tb-btn danger', onclick: () => {
      if (!confirm('모든 페이지를 지우고 예시 데이터로 초기화할까요? 먼저 JSON 내보내기로 백업하세요.')) return;
      resetAll(); m.close(); boot();
    } }, '모두 지우기')),
    h('div', { class: 'set-help muted small' },
      '단축키 — Ctrl+K 검색 · Ctrl+\\ 사이드바 · / 명령어 · Tab 들여쓰기 · Ctrl+B/I/U 서식 · Ctrl+E 인라인 코드 · Ctrl+D 블록 복제')), { className: 'settings-modal' });
}

// ---------- 시작 ----------
function boot() {
  applyTheme();
  renderSidebar();
  route();
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
});
addEventListener('hashchange', route);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
let sbTimer;
bus.addEventListener('structure', () => { clearTimeout(sbTimer); sbTimer = setTimeout(renderSidebar, 30); });
bus.addEventListener('titles', () => { clearTimeout(sbTimer); sbTimer = setTimeout(renderSidebar, 300); });
addEventListener('storage', (e) => { if (e.key === 'jjnote.v1') { load(); boot(); } });

load();
boot();
