import { esc } from './ui.js';
import { money } from './format.js';

const niceMax = (v) => {
  if (!v || v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
};

const shortNum = (minor, currency) => money(minor, currency, { compact: true });

/* Grouped income / expense columns across months. */
export function trendChart(points, currency, { height = 230 } = {}) {
  const W = 720;
  const H = height;
  const pad = { l: 52, r: 14, t: 16, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...points.flatMap((p) => [p.income, p.expense])));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const slot = iw / Math.max(points.length, 1);
  const bw = Math.min(22, slot / 3.2);

  const ticks = [0, max / 2, max].map((v) => `
    <line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
    <text x="${pad.l - 9}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(shortNum(v, currency))}</text>`).join('');

  const bars = points.map((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const hIn = Math.max(p.income > 0 ? 3 : 0, (p.income / max) * ih);
    const hEx = Math.max(p.expense > 0 ? 3 : 0, (p.expense / max) * ih);
    return `
      <g>
        <rect class="bar" x="${(cx - bw - 2).toFixed(1)}" y="${(pad.t + ih - hIn).toFixed(1)}" width="${bw}" height="${hIn.toFixed(1)}" rx="4" fill="url(#gIn)">
          <title>${esc(p.label)} — earned ${esc(money(p.income, currency))}</title></rect>
        <rect class="bar" x="${(cx + 2).toFixed(1)}" y="${(pad.t + ih - hEx).toFixed(1)}" width="${bw}" height="${hEx.toFixed(1)}" rx="4" fill="url(#gEx)">
          <title>${esc(p.label)} — spent ${esc(money(p.expense, currency))}</title></rect>
        <text x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle" ${p.current ? 'style="fill:var(--text-dim)"' : ''}>${esc(p.short)}</text>
      </g>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly earnings and spending">
      <defs>
        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4ef0a8"/><stop offset="100%" stop-color="#1c7d57"/>
        </linearGradient>
        <linearGradient id="gEx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff7b86"/><stop offset="100%" stop-color="#8e2e38"/>
        </linearGradient>
      </defs>
      ${ticks}${bars}
    </svg>`;
}

export function sparkline(values, color = '#7c5cff') {
  const W = 120, H = 34;
  if (!values.length) return `<svg class="spark" viewBox="0 0 ${W} ${H}"></svg>`;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const step = W / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, H - 2 - ((v - min) / (max - min || 1)) * (H - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const id = `sp${Math.random().toString(36).slice(2, 8)}`;
  return `
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${esc(color)}" stop-opacity=".38"/>
        <stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

export const PALETTE = ['#7c5cff', '#3ddc97', '#4cc2ff', '#ffc857', '#ff8a5c', '#ff5c8a', '#9b8cff', '#2fd4c4', '#b0b0c0'];
