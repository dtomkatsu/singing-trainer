// ui.js — shared nav, canvas helpers, and small utilities.
'use strict';

const UI = (() => {
  const PAGES = [
    ['index.html', 'Home'],
    ['tuner.html', 'Tuner'],
    ['report.html', 'Voice Report'],
    ['exercises.html', 'Exercises'],
    ['compare.html', 'Compare'],
    ['warmup.html', 'Warm-up'],
    ['styles.html', 'Styles'],
  ];

  function nav(current) {
    const h = document.createElement('header');
    h.className = 'top';
    const row = document.createElement('div');
    row.className = 'row';
    for (const [href, label] of PAGES) {
      const a = document.createElement('a');
      a.href = href; a.textContent = label;
      if (href === current) a.className = 'on';
      row.appendChild(a);
    }
    h.appendChild(row);
    document.body.prepend(h);
    // keep active pill in view
    const on = row.querySelector('.on');
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /** HiDPI canvas setup; returns {ctx, w, h} in CSS pixels. */
  function canvas2d(el, cssHeight) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth || el.parentElement.clientWidth;
    const h = cssHeight || el.clientHeight || 160;
    el.style.height = h + 'px';
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    const ctx = el.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** Rating -> tag element html. */
  function tag(level, text) {
    return `<span class="tag ${level}">${text}</span>`;
  }

  const fmt = {
    hz: (v) => (v > 0 ? v.toFixed(1) + ' Hz' : '—'),
    cents: (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(0) + '¢'),
    db: (v) => (v == null || isNaN(v) ? '—' : v.toFixed(1) + ' dB'),
    pct: (v) => (v == null || isNaN(v) ? '—' : v.toFixed(1) + '%'),
    s: (v) => v.toFixed(1) + ' s',
  };

  /**
   * Draw a pitch trace (cents-vs-midi grid) onto a canvas.
   * points: array of {t, midiCents} (midiCents = midi*100), NaN = gap.
   */
  function drawTrace(ctx, w, h, points, opts = {}) {
    ctx.clearRect(0, 0, w, h);
    if (!points.length) return;
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      if (isNaN(p.v)) continue;
      if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v;
    }
    if (!isFinite(lo)) return;
    lo = Math.floor(lo / 100 - 2) * 100; hi = Math.ceil(hi / 100 + 2) * 100;
    if (opts.lo != null) lo = opts.lo; if (opts.hi != null) hi = opts.hi;
    const t0 = opts.t0 != null ? opts.t0 : points[0].t;
    const t1 = opts.t1 != null ? opts.t1 : points[points.length - 1].t;
    const X = (t) => ((t - t0) / Math.max(0.001, t1 - t0)) * w;
    const Y = (v) => h - ((v - lo) / (hi - lo)) * h;

    // semitone grid + note labels every semitone if room, else per octave C
    ctx.font = '10px -apple-system, sans-serif';
    for (let m = lo; m <= hi; m += 100) {
      const y = Y(m);
      const isC = Math.round(m / 100) % 12 === 0;
      ctx.strokeStyle = isC ? 'rgba(147,160,180,0.35)' : 'rgba(147,160,180,0.12)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if ((hi - lo) <= 1700 || isC) {
        ctx.fillStyle = 'rgba(147,160,180,0.6)';
        ctx.fillText(Notes.name(Math.round(m / 100)), 2, y - 2);
      }
    }
    if (opts.target != null) {
      ctx.strokeStyle = css('--good') || '#6fe3a5';
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      const y = Y(opts.target);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = opts.color || css('--accent') || '#4fc3f7';
    let pen = false;
    ctx.beginPath();
    for (const p of points) {
      if (isNaN(p.v)) { pen = false; continue; }
      const x = X(p.t), y = Y(p.v);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return { X, Y, lo, hi };
  }

  /** localStorage JSON helpers under one namespace. */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sing.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('sing.' + k, JSON.stringify(v)); } catch (_) {} },
  };

  return { nav, canvas2d, css, tag, fmt, drawTrace, store };
})();
