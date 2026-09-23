/* ============================================================================
   theme.js · 書荀运营驾驶舱深浅色主题引擎（2026-09-23）
   在 <head> 内同步执行（紧跟 apple.css 之后），所以首屏不会闪一下白。

   三态：auto（跟随系统） / light / dark，选择记在本机 localStorage。
   · 写入 <html data-theme="light|dark">，apple.css 据此切换整套令牌
   · 往 .sx-nav 末尾注入切换按钮，点击在 auto → light → dark 之间循环
   · 暴露 window.SX.ink() 供 Chart.js 取色；主题变化时即时重刷已有图表
   · 派发 window 事件 'sx:theme'，页面可监听做自定义响应
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'sx-theme';
  var MODES = ['auto', 'light', 'dark'];
  var LABEL = { auto: '自动', light: '浅色', dark: '深色' };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { }
  if (MODES.indexOf(pref) < 0) pref = 'auto';

  function resolved(p) {
    return p === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : p;
  }

  /* ---------- 取色：给页面脚本 / Chart.js 用 ---------- */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  var SX = {
    mode: function () { return pref; },
    isDark: function () { return resolved(pref) === 'dark'; },
    set: function (p) { apply(p === 'auto' ? cycle() : p); },
    cycle: function () { apply(cycle()); },
    on: function (fn) { window.addEventListener('sx:theme', function (e) { fn(e.detail); }); },
    ink: function () {
      var d = resolved(pref) === 'dark';
      return {
        dark: d,
        tick: cssVar('--sx-chart-tick', d ? 'rgba(235,235,245,.60)' : 'rgba(60,60,67,.62)'),
        grid: cssVar('--sx-chart-grid', d ? 'rgba(84,84,88,.55)' : 'rgba(60,60,67,.12)'),
        legend: cssVar('--sx-chart-legend', d ? 'rgba(235,235,245,.72)' : 'rgba(60,60,67,.72)')
      };
    }
  };
  window.SX = SX;

  function cycle() { return MODES[(MODES.indexOf(pref) + 1) % MODES.length]; }

  /* ---------- 应用到 DOM ---------- */
  function apply(p) {
    pref = (MODES.indexOf(p) >= 0) ? p : 'auto';
    var r = resolved(pref);
    var d = document.documentElement;
    d.setAttribute('data-theme', r);
    try { d.style.colorScheme = r; } catch (e) { }   // 让原生控件（滚动条/日期选择器）跟着变
    try { localStorage.setItem(KEY, pref); } catch (e) { }
    paint();
    repaintCharts();
    try {
      window.dispatchEvent(new CustomEvent('sx:theme', { detail: { mode: pref, resolved: r } }));
    } catch (e) { }
  }

  /* ---------- 图表：主题变了要重刷，否则网格线/刻度还是旧色 ---------- */
  function repaintCharts() {
    if (typeof window.Chart === 'undefined') return;
    var ink = SX.ink();
    var cvs = document.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) {
      var ch = null;
      try { ch = window.Chart.getChart ? window.Chart.getChart(cvs[i]) : null; } catch (e) { }
      if (!ch || !ch.options) continue;
      var o = ch.options;
      if (o.plugins && o.plugins.legend && o.plugins.legend.labels) o.plugins.legend.labels.color = ink.legend;
      if (o.scales) {
        Object.keys(o.scales).forEach(function (k) {
          var s = o.scales[k]; if (!s) return;
          if (s.ticks) s.ticks.color = ink.tick;
          if (s.grid) s.grid.color = ink.grid;
        });
      }
      try { ch.update('none'); } catch (e) { }   // 'none'：不做动画，避免主题切换时图表乱跳
    }
  }

  /* ---------- 导航壳里的切换按钮 ---------- */
  var ICON = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  function paint() {
    var b = document.getElementById('sxThemeBtn');
    if (!b) return;
    b.innerHTML = ICON[pref] + '<span>' + LABEL[pref] + '</span>';
    b.setAttribute('title', '外观：' + LABEL[pref] + '（点击切换）');
    b.setAttribute('aria-label', '外观：' + LABEL[pref]);
  }

  function mount() {
    if (document.getElementById('sxThemeBtn')) return true;
    var nav = document.getElementById('sxNav') || document.querySelector('.sx-nav');
    if (!nav) return false;
    var b = document.createElement('button');
    b.id = 'sxThemeBtn';
    b.className = 'sx-theme-btn';
    b.type = 'button';
    b.onclick = function (e) { e.preventDefault(); apply(cycle()); };
    nav.appendChild(b);
    paint();
    return true;
  }

  /* 导航可能是登录后才渲染的，观察一会儿再挂 */
  function ensure() {
    if (mount()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (mount() || ++tries > 20) clearInterval(t);
    }, 250);
  }

  /* ---------- 跟随系统：auto 模式下系统改了就立刻跟 ---------- */
  if (mq) {
    var onSys = function () { if (pref === 'auto') apply('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  apply(pref);                                    // 首屏同步生效，防闪烁
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
})();
