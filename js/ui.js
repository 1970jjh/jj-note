// 공용 DOM 도우미 · 팝업 메뉴 · 이모지 선택기

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const stripHtml = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return d.textContent || '';
};

// ---------- 팝업 메뉴 ----------
let openMenu = null;
let onCloseCb = null;

function outside(e) {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
}

export function closeMenu() {
  if (!openMenu) return;
  openMenu.remove();
  openMenu = null;
  document.removeEventListener('mousedown', outside, true);
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}

export const menuOpen = () => !!openMenu;

/** items: {label, icon, onClick, danger, hint} | 'sep' | {header} | HTMLElement */
export function menu(anchor, items, { onClose, className = '' } = {}) {
  closeMenu();
  const m = h('div', { class: 'menu ' + className, role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') m.append(h('div', { class: 'menu-sep' }));
    else if (it.nodeType) m.append(it);
    else if (it.header) m.append(h('div', { class: 'menu-header' }, it.header));
    else
      m.append(
        h(
          'button',
          {
            class: 'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : ''),
            role: 'menuitem',
            onclick: (e) => {
              if (!it.keepOpen) closeMenu();
              it.onClick?.(e);
            },
          },
          h('span', { class: 'mi-icon' }, it.icon || ''),
          h('span', { class: 'mi-label' }, it.label),
          it.hint ? h('span', { class: 'mi-hint' }, it.hint) : null
        )
      );
  }
  place(m, anchor);
  openMenu = m;
  onCloseCb = onClose || null;
  setTimeout(() => document.addEventListener('mousedown', outside, true));
  return m;
}

export function place(m, anchor) {
  document.body.append(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  let x = r.left;
  let y = r.bottom + 4;
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  if (x + mw > innerWidth - 8) x = Math.max(8, innerWidth - mw - 8);
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
}

// ---------- 모달 ----------
export function modal(content, { className = '' } = {}) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal ' + className, role: 'dialog' }, content);
  back.append(box);
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onEsc, true);
  };
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  back.addEventListener('mousedown', (e) => e.target === back && close());
  document.addEventListener('keydown', onEsc, true);
  document.body.append(back);
  return { close, box };
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 1800);
}

export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 이모지 ----------
export const EMOJIS =
  '📄 📝 📒 📓 📔 📕 📗 📘 📙 📚 🗂️ 📁 📂 🗒️ 📌 📍 📎 🔖 🏷️ 💡 🔥 ⭐ ✨ 🎯 🚀 ✅ ☑️ ❗ ❓ 💬 📣 🔔 📅 🗓️ ⏰ ⌛ 🧭 🗺️ 🏠 🏢 🏫 💼 💰 📈 📊 📉 🧾 🛠️ ⚙️ 🔧 🔑 🔒 🧪 🔬 🎨 🎬 🎵 📷 💻 🖥️ 📱 🌐 🤖 🧠 💪 🙌 👋 👍 ❤️ 🌱 🌳 🌈 ☀️ 🌙 ⚡ 🍀 🍎 ☕ 🎁 🏆 🎓 ✏️ 🖊️ 📮 🚂 🐳 🦄'.split(' ');

export function emojiPicker(anchor, onPick) {
  const grid = h(
    'div',
    { class: 'emoji-grid' },
    EMOJIS.map((e) =>
      h('button', { class: 'emoji-btn', onclick: () => (closeMenu(), onPick(e)) }, e)
    )
  );
  menu(anchor, [
    h(
      'div',
      { class: 'emoji-top' },
      h('button', { class: 'link-btn', onclick: () => (closeMenu(), onPick(EMOJIS[Math.floor(Math.random() * EMOJIS.length)])) }, '무작위'),
      h('button', { class: 'link-btn', onclick: () => (closeMenu(), onPick('')) }, '제거')
    ),
    grid,
  ], { className: 'emoji-menu' });
}

export const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const COLOR_LABEL = {
  default: '기본', gray: '회색', brown: '갈색', orange: '주황', yellow: '노랑',
  green: '초록', blue: '파랑', purple: '보라', pink: '분홍', red: '빨강',
};

export function fmtDate(ts, withTime = false) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
}
