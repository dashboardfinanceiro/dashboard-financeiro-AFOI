// ─── App.js — Lógica principal da UI ─────────────────────────────────────────
import * as State from './state.js';
import { autoCategory, applyRules, fmt, fmtAbs, parseCSV } from './categorize.js';
import * as Storage from './storage.js';

// ─── Filtros ──────────────────────────────────────────────────────────────────
function filterByType(data, type) {
  if (type === 'in') return data.filter(r => r.amount > 0);
  if (type === 'out') return data.filter(r => r.amount < 0);
  return data;
}

function getFiltered() {
  let data = State.allData;
  if (State.activeTableMonth !== 'all') {
    data = data.filter(r => r.date.slice(0, 7) === State.activeTableMonth);
  }
  if (State.activeSearch) {
    const q = State.activeSearch.toUpperCase();
    data = data.filter(r => r.desc.toUpperCase().includes(q) || r.cat.toUpperCase().includes(q));
  }
  return filterByType(data, State.activeType);
}

function getFilteredData() {
  let data = State.allData;
  if (State.activeTableMonth !== 'all') {
    data = data.filter(r => r.date.slice(0, 7) === State.activeTableMonth);
  }
  return data;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(data) {
  const ent = data.filter(r => r.amount > 0 && r.cat === 'Rendimentos').reduce((s, r) => s + r.amount, 0);
  const sai = data.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const reembolsos = data.filter(r => r.amount > 0 && r.cat !== 'Rendimentos').reduce((s, r) => s + r.amount, 0);
  const saiLiq = Math.abs(sai) - reembolsos;
  document.getElementById('kpiEnt').textContent = '+' + fmtAbs(ent);
  document.getElementById('kpiEntN').textContent = data.filter(r => r.amount > 0 && r.cat === 'Rendimentos').length + ' movimentos';
  document.getElementById('kpiSai').textContent = '-' + fmtAbs(Math.max(0, saiLiq));
  document.getElementById('kpiSaiN').textContent = data.filter(r => r.amount < 0).length + ' movimentos';
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts(data) {
  const catTotals = {};
  data.filter(r => r.amount < 0).forEach(r => { catTotals[r.cat] = (catTotals[r.cat] || 0) + Math.abs(r.amount); });
  const catLabels = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const catVals   = catLabels.map(c => parseFloat(catTotals[c].toFixed(2)));
  const catCols   = catLabels.map(c => State.CAT_COLORS[State.CATS.indexOf(c)] || '#888');

  if (State.chartDona) State.chartDona.destroy();
  State.setChartDona(new Chart(document.getElementById('chartDona'), {
    type: 'doughnut',
    data: { labels: catLabels, datasets: [{ data: catVals, backgroundColor: catCols, borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fmtAbs(ctx.parsed) } } } }
  }));
  document.getElementById('legendDona').innerHTML = catLabels.map((l, i) =>
    `<span><span class="legend-dot" style="background:${catCols[i]}"></span>${l}</span>`).join('');

  const months = {};
  data.forEach(r => {
    const m = r.date.slice(0, 7);
    if (!months[m]) months[m] = { ent: 0, sai: 0 };
    if (r.amount > 0) months[m].ent += r.amount; else months[m].sai += Math.abs(r.amount);
  });
  const mLabels = Object.keys(months).sort();
  const mFmt = mLabels.map(m => { const [, mo] = m.split('-'); return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1]; });
  if (State.chartBar) State.chartBar.destroy();
  State.setChartBar(new Chart(document.getElementById('chartBar'), {
    type: 'bar',
    data: { labels: mFmt, datasets: [
      { label: 'Entradas', data: mLabels.map(m => parseFloat(months[m].ent.toFixed(2))), backgroundColor: '#1D9E75' },
      { label: 'Saídas',   data: mLabels.map(m => parseFloat(months[m].sai.toFixed(2))), backgroundColor: '#D85A30' }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8a8680', autoSkip: false, maxRotation: 0, font: { size: 11 } } }, y: { ticks: { color: '#8a8680', font: { size: 11 }, callback: v => v + '€' } } } }
  }));

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const lineL = [], lineV = [];
  sorted.forEach(r => { running += r.amount; lineL.push(r.date.slice(5).replace('-', '/')); lineV.push(parseFloat(running.toFixed(2))); });
  if (State.chartLine) State.chartLine.destroy();
  State.setChartLine(new Chart(document.getElementById('chartLine'), {
    type: 'line',
    data: { labels: lineL, datasets: [{ data: lineV, borderColor: '#1a3a2a', backgroundColor: 'rgba(26,58,42,0.07)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8a8680', autoSkip: true, maxTicksLimit: 8, font: { size: 11 } } }, y: { ticks: { color: '#8a8680', font: { size: 11 }, callback: v => v + '€' } } } }
  }));
}

// ─── Tabela ───────────────────────────────────────────────────────────────────
function renderTable(data) {
  const body   = document.getElementById('movBody');
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    const msg = State.activeSearch
      ? `Sem resultados para "<strong>${State.activeSearch}</strong>"`
      : 'Sem movimentos para este filtro.';
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state">${msg}</div></td></tr>`;
    return;
  }
  const hl = (text) => {
    if (!State.activeSearch) return text;
    const re = new RegExp('(' + State.activeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(re, '<mark style="background:#fff3b0;border-radius:2px;padding:0 1px;">$1</mark>');
  };
  body.innerHTML = sorted.map((r) => {
    const globalIdx = State.allData.indexOf(r);
    const dateDisp  = r.date.slice(8,10) + '/' + r.date.slice(5,7) + '/' + r.date.slice(0,4);
    return `<tr>
      <td class="date-cell">${dateDisp}</td>
      <td>${hl(r.desc)}</td>
      <td><select class="cat-sel" onchange="window._changecat(this,${globalIdx})">
        ${State.CATS.map(c => `<option value="${c}" ${c === r.cat ? 'selected' : ''}>${c}</option>`).join('')}
      </select></td>
      <td class="amt-cell ${r.amount > 0 ? 'pos' : 'neg'}">${fmt(r.amount)}</td>
    </tr>`;
  }).join('');
}

window._changecat = function(sel, idx) {
  State.allData[idx].cat = sel.value;
  State.allData[idx].manual = true;
  Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  const f = getFiltered();
  renderPilares(f);
  renderResumo(f);
};

// ─── Resumo por Categoria ─────────────────────────────────────────────────────
function buildResumoRows(cats, keys, maxVal, isNeg) {
  let html = '';
  keys.forEach(cat => {
    const color = State.CAT_COLORS[State.CATS.indexOf(cat)] || '#888';
    const pct   = (cats[cat].total / maxVal * 100).toFixed(0);
    const sign  = isNeg ? '-' : '+';
    const cls   = isNeg ? 'neg' : 'pos';
    const id    = 'exp-' + (isNeg ? 's' : 'e') + '-' + cat.replace(/\s/g,'_');
    html += `<tr class="resumo-cat-row" onclick="window._toggleExp('${id}')" style="cursor:pointer;">
      <td class="cat-name"><span class="exp-arrow" id="arr-${id}">▶</span><span class="cat-dot" style="background:${color}"></span>${cat}</td>
      <td class="bar-cell"><div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${pct}%;background:${color}"></div></div></td>
      <td class="n-cell">${cats[cat].n}</td>
      <td class="val-cell ${cls}">${sign}${fmtAbs(cats[cat].total)}</td>
    </tr>`;
    const movsSorted = [...cats[cat].movs].sort((a,b) => b.date.localeCompare(a.date));
    html += `<tr id="${id}" class="exp-detail hidden"><td colspan="4" style="padding:0;">
      <table style="width:100%;border-collapse:collapse;">
        ${movsSorted.map(r => {
          const dd = r.date.slice(8,10)+'/'+r.date.slice(5,7);
          return `<tr style="background:var(--surface2);">
            <td style="width:48px;padding:6px 10px 6px 32px;font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);">${dd}</td>
            <td style="padding:6px 8px;font-size:12px;">${r.desc}</td>
            <td style="padding:6px 10px;font-family:'DM Mono',monospace;font-size:12px;font-weight:500;text-align:right;white-space:nowrap;" class="${cls}">${sign}${fmtAbs(r.amount)}</td>
          </tr>`;
        }).join('')}
      </table></td></tr>`;
  });
  return html;
}

window._toggleExp = function(id) {
  const row = document.getElementById(id);
  const arr = document.getElementById('arr-' + id);
  if (!row) return;
  const hidden = row.classList.toggle('hidden');
  if (arr) arr.textContent = hidden ? '▶' : '▼';
};

function renderResumo(data) {
  const resumoData = State.activeTableMonth === 'all' ? data : data.filter(r => r.date.slice(0,7) === State.activeTableMonth);
  const entCats = {};
  resumoData.filter(r => r.amount > 0 && r.cat === 'Rendimentos').forEach(r => {
    if (!entCats[r.cat]) entCats[r.cat] = { total: 0, n: 0, movs: [] };
    entCats[r.cat].total += r.amount; entCats[r.cat].n++; entCats[r.cat].movs.push(r);
  });
  const entKeys  = Object.keys(entCats).sort((a,b) => entCats[b].total - entCats[a].total);
  const entMax   = entKeys.length ? entCats[entKeys[0]].total : 1;
  const entTotal = entKeys.reduce((s,k) => s + entCats[k].total, 0);
  const entBody  = document.getElementById('resumoEntBody');
  if (entBody) {
    entBody.innerHTML = !entKeys.length
      ? '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;font-size:12px;">Sem rendimentos</td></tr>'
      : buildResumoRows(entCats, entKeys, entMax, false)
        + `<tr class="total-row"><td colspan="2"><strong>Total</strong></td><td class="n-cell">${resumoData.filter(r=>r.amount>0&&r.cat==='Rendimentos').length}</td><td class="val-cell pos"><strong>+${fmtAbs(entTotal)}</strong></td></tr>`;
  }

  const saiCats = {};
  resumoData.filter(r => r.amount < 0).forEach(r => {
    if (!saiCats[r.cat]) saiCats[r.cat] = { total: 0, n: 0, movs: [] };
    saiCats[r.cat].total += Math.abs(r.amount); saiCats[r.cat].n++; saiCats[r.cat].movs.push(r);
  });
  const saiKeys  = Object.keys(saiCats).sort((a,b) => saiCats[b].total - saiCats[a].total);
  const saiMax   = saiKeys.length ? saiCats[saiKeys[0]].total : 1;
  const saiTotal = saiKeys.reduce((s,k) => s + saiCats[k].total, 0);
  const saiBody  = document.getElementById('resumoSaiBody');
  if (saiBody) {
    saiBody.innerHTML = !saiKeys.length
      ? '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;font-size:12px;">Sem despesas</td></tr>'
      : buildResumoRows(saiCats, saiKeys, saiMax, true)
        + `<tr class="total-row"><td colspan="2"><strong>Total</strong></td><td class="n-cell">${resumoData.filter(r=>r.amount<0).length}</td><td class="val-cell neg"><strong>-${fmtAbs(saiTotal)}</strong></td></tr>`;
  }
}

// ─── Pilares ──────────────────────────────────────────────────────────────────
function renderPilares(data) {
  Storage.loadPilares();
  const months = [...new Set(State.allData.map(r => r.date.slice(0,7)))].sort();
  State.setActivePilarMonth(State.activeTableMonth !== 'all' ? State.activeTableMonth : (months[months.length-1] || 'all'));
  const d = State.activePilarMonth === 'all' ? State.allData : State.allData.filter(r => r.date.slice(0,7) === State.activePilarMonth);
  renderPilaresCards(d);
  renderPilaresChart();
}

function renderPilaresCards(data) {
  const gastoLiquidoCat = cat => {
    const saidas   = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s,r) => s + Math.abs(r.amount), 0);
    const entradas = data.filter(r => r.amount > 0 && r.cat === cat && r.cat !== 'Rendimentos').reduce((s,r) => s + r.amount, 0);
    return Math.max(0, saidas - entradas);
  };
  const catsDePilares = State.PILARES.flatMap(p => p.cats);
  const totalSai = catsDePilares.reduce((s, cat) => s + gastoLiquidoCat(cat), 0);
  const cardsEl  = document.getElementById('pilaresCards');
  if (!cardsEl) return;

  cardsEl.innerHTML = State.PILARES.map(p => {
    const total    = p.cats.reduce((s, cat) => s + gastoLiquidoCat(cat), 0);
    const pctPilar = totalSai > 0 ? (total / totalSai * 100).toFixed(1) : '0.0';
    const catRows  = p.cats.map(cat => {
      const gasto = gastoLiquidoCat(cat);
      if (gasto === 0) return '';
      const pctCat = total > 0 ? (gasto / total * 100).toFixed(1) : '0.0';
      const catIdx = State.CATS.indexOf(cat);
      const color  = State.CAT_COLORS[catIdx] || p.color;
      const movsId = 'catMovs_' + p.id + '_' + cat.replace(/\s/g,'_');
      const catMovs = data.filter(r => r.cat === cat).sort((a,b) => b.date.localeCompare(a.date));
      const movsHtml = catMovs.map(r => {
        const isReembolso = r.amount > 0;
        const cor   = isReembolso ? 'var(--green)' : 'var(--red)';
        const sinal = isReembolso ? '+' : '-';
        const label = isReembolso ? ' <span style="font-size:9px;background:var(--green);color:#fff;border-radius:3px;padding:1px 4px;vertical-align:middle;">reembolso</span>' : '';
        return `<tr style="border-top:1px solid var(--border);">
          <td style="padding:4px 8px 4px 24px;font-size:11px;color:var(--muted);">${r.date}</td>
          <td style="padding:4px 8px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${r.desc}${label}</td>
          <td style="padding:4px 8px;font-size:11px;font-family:'DM Mono',monospace;text-align:right;color:${cor};">${sinal}${fmtAbs(Math.abs(r.amount))}</td>
        </tr>`;
      }).join('');
      return `
        <tr onclick="window._toggleCatMovs('${movsId}')" style="cursor:pointer;border-top:1px solid var(--border);">
          <td style="padding:8px 0;display:flex;align-items:center;gap:8px;">
            <span style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;display:inline-block;"></span>
            <span style="font-size:13px;">${cat}</span>
            <span class="cat-arrow" style="font-size:10px;color:var(--muted);">▸</span>
          </td>
          <td style="font-size:12px;color:var(--muted);font-family:'DM Mono',monospace;text-align:right;padding:8px 12px;white-space:nowrap;">${pctCat}%</td>
          <td style="font-size:13px;font-family:'DM Mono',monospace;text-align:right;padding:8px 0;color:var(--red);white-space:nowrap;">-${fmtAbs(gasto)}</td>
        </tr>
        <tr id="${movsId}" style="display:none;"><td colspan="3" style="padding:0 0 4px 0;background:var(--surface2);">
          <table style="width:100%;border-collapse:collapse;">${movsHtml}</table>
        </td></tr>`;
    }).join('');

    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:0.75rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.9rem 1.25rem;background:${p.color}12;border-bottom:1px solid ${p.color}25;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.3rem;">${p.emoji}</span>
          <span style="font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${p.color};">${p.nome}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="font-size:13px;color:var(--muted);font-family:'DM Mono',monospace;">${pctPilar}% das saídas</span>
          <span style="font-size:1.2rem;font-weight:800;font-family:'DM Mono',monospace;">-${fmtAbs(total)}</span>
        </div>
      </div>
      ${p.cats.length > 0
        ? `<div style="padding:0 1.25rem 0.5rem;"><table style="width:100%;border-collapse:collapse;"><tbody>${catRows}</tbody></table></div>`
        : `<div style="padding:0.75rem 1.25rem;font-size:12px;color:var(--muted);font-style:italic;">Nenhuma categoria — usa ⚙️ Configurar para atribuir</div>`}
    </div>`;
  }).join('');
}

window._toggleCatMovs = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'table-row';
  const arrow = el.previousElementSibling?.querySelector('.cat-arrow');
  if (arrow) arrow.textContent = visible ? '▸' : '▾';
};

function renderPilaresChart() {
  const cardEl     = document.getElementById('pilaresChartCard');
  const hasPilarCats = State.PILARES.some(p => p.cats.length > 0);
  if (!State.allData.length || !hasPilarCats) { if (cardEl) cardEl.style.display = 'none'; return; }
  if (cardEl) cardEl.style.display = '';
  const currentYear = new Date().getFullYear().toString();
  const allMonths   = Array.from({length:12}, (_,i) => currentYear + '-' + String(i+1).padStart(2,'0'));
  const nomeMes     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labels      = allMonths.map(m => { const [,mo] = m.split('-'); return nomeMes[parseInt(mo)-1]; });
  const datasets = State.PILARES.filter(p => p.cats.length > 0).map(p => {
    const dataPoints = allMonths.map(m => {
      const gastoLiqMes = cat => {
        const sai = State.allData.filter(r => r.date.slice(0,7)===m && r.amount<0 && r.cat===cat).reduce((s,r)=>s+Math.abs(r.amount),0);
        const ent = State.allData.filter(r => r.date.slice(0,7)===m && r.amount>0 && r.cat===cat && r.cat!=='Rendimentos').reduce((s,r)=>s+r.amount,0);
        return Math.max(0, sai-ent);
      };
      const total = p.cats.reduce((s,cat) => s+gastoLiqMes(cat), 0);
      if (State.pilarChartMode === 'pct') {
        const rendMes = State.allData.filter(r => r.date.slice(0,7)===m && r.amount>0 && r.cat==='Rendimentos').reduce((s,r)=>s+r.amount,0);
        return rendMes > 0 ? parseFloat((total/rendMes*100).toFixed(1)) : null;
      }
      return total > 0 ? parseFloat(total.toFixed(2)) : null;
    });
    return { label: p.emoji+' '+p.nome, data: dataPoints, borderColor: p.color, backgroundColor: p.color+'22',
      pointBackgroundColor: p.color, pointRadius: ctx => ctx.parsed.y !== null ? 5 : 0,
      pointHoverRadius: 7, tension: 0.3, fill: false, borderWidth: 2, spanGaps: false };
  });
  if (State.chartPilares) State.chartPilares.destroy();
  State.setChartPilares(new Chart(document.getElementById('chartPilares'), {
    type: 'line', data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
        const v = ctx.parsed.y;
        return ' ' + ctx.dataset.label + ': ' + (State.pilarChartMode==='pct' ? v.toFixed(1)+'%' : v.toFixed(2).replace('.',',')+' €');
      }}}},
      scales: {
        x: { ticks: { color:'#8a8680', font:{size:11} }, grid:{color:'#e0dbd322'} },
        y: { ticks: { color:'#8a8680', font:{size:11}, callback: v => State.pilarChartMode==='pct' ? v+'%' : v+'€' }, grid:{color:'#e0dbd355'} }
      }
    }
  }));
  const leg = document.getElementById('legendPilares');
  if (leg) leg.innerHTML = datasets.map(d => `<span><span class="legend-dot" style="background:${d.borderColor}"></span>${d.label}</span>`).join('');
}

window._setPilarChartMode = function(mode) {
  State.setPilarChartMode(mode);
  document.getElementById('pilarChartEur').classList.toggle('active', mode==='eur');
  document.getElementById('pilarChartPct').classList.toggle('active', mode==='pct');
  renderPilaresChart();
};

// ─── Regras ───────────────────────────────────────────────────────────────────
function refreshCatSelects() {
  const ruleCatEl = document.getElementById('ruleCat');
  if (ruleCatEl) {
    const cur = ruleCatEl.value;
    ruleCatEl.innerHTML = State.CATS.map(c => `<option value="${c}">${c}</option>`).join('')
      + `<option value="__new__" style="color:var(--blue);font-style:italic;">+ Nova categoria...</option>`;
    if ([...ruleCatEl.options].some(o => o.value === cur)) ruleCatEl.value = cur;
  }
  document.querySelectorAll('.cat-sel').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = State.CATS.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  });
}

function renderRulesList() {
  const el = document.getElementById('rulesList');
  if (!State.userRules.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;padding:1rem;">Ainda não tens regras. Adiciona a primeira acima.</p>';
    return;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th style="font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;border-bottom:1px solid var(--border);text-align:left;">Ordem</th>
      <th style="font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;border-bottom:1px solid var(--border);text-align:left;">Se contiver…</th>
      <th style="font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;border-bottom:1px solid var(--border);text-align:left;">→ Categoria</th>
      <th style="font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;border-bottom:1px solid var(--border);"></th>
    </tr></thead>
    <tbody>
    ${State.userRules.map((r, i) => {
      const color = State.CAT_COLORS[State.CATS.indexOf(r.cat)] || '#888';
      return `<tr style="${i%2===0?'':'background:var(--surface2);'}">
        <td style="padding:8px 10px;font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);">
          ${i>0 ? `<button onclick="window._moveRule(${i},-1)" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0 4px;font-size:14px;">↑</button>` : '<span style="padding:0 4px;opacity:0">↑</span>'}
          ${i<State.userRules.length-1 ? `<button onclick="window._moveRule(${i},1)" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0 4px;font-size:14px;">↓</button>` : '<span style="padding:0 4px;opacity:0">↓</span>'}
        </td>
        <td style="padding:8px 10px;font-family:'DM Mono',monospace;font-size:13px;font-weight:500;">${r.keyword}</td>
        <td style="padding:8px 10px;"><span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">
          <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;"></span>${r.cat}
        </span></td>
        <td style="padding:8px 10px;text-align:right;">
          <button onclick="window._deleteRule(${i})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;" title="Apagar">×</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

window._addRule = function() {
  const kw = document.getElementById('ruleKeyword').value.trim();
  const catSel = document.getElementById('ruleCat').value;
  const newCatInput = document.getElementById('ruleNewCat').value.trim();
  let cat = catSel;
  if (catSel === '__new__') {
    if (!newCatInput) { document.getElementById('ruleNewCat').focus(); return; }
    cat = newCatInput.charAt(0).toUpperCase() + newCatInput.slice(1);
    if (!State.CATS.includes(cat)) { State.CATS.push(cat); State.CUSTOM_CATS.push(cat); }
  }
  if (!kw) { document.getElementById('ruleKeyword').focus(); return; }
  if (State.userRules.some(r => r.keyword.toUpperCase() === kw.toUpperCase())) { alert('Já tens uma regra com essa palavra-chave.'); return; }
  State.userRules.unshift({ keyword: kw, cat });
  Storage.saveRules();
  document.getElementById('ruleKeyword').value = '';
  document.getElementById('ruleNewCat').value = '';
  document.getElementById('ruleNewCat').style.display = 'none';
  refreshCatSelects(); renderRulesList(); renderCatChips(); reapplyCategories();
};

window._deleteRule = function(idx) {
  State.userRules.splice(idx, 1);
  Storage.saveRules(); renderRulesList(); reapplyCategories();
};

window._moveRule = function(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= State.userRules.length) return;
  [State.userRules[idx], State.userRules[newIdx]] = [State.userRules[newIdx], State.userRules[idx]];
  Storage.saveRules(); renderRulesList(); reapplyCategories();
};

window._toggleNewCat = function(sel) {
  const input = document.getElementById('ruleNewCat');
  input.style.display = sel.value === '__new__' ? '' : 'none';
  if (sel.value === '__new__') input.focus();
};

function renderCatChips() {
  const el = document.getElementById('catChipsList');
  if (!el) return;
  el.innerHTML = State.CATS.map(cat => {
    const color = State.CAT_COLORS[State.CATS.indexOf(cat)] || '#888';
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:3px 8px 3px 10px;font-size:12px;font-family:'DM Mono',monospace;">
      <span style="width:7px;height:7px;border-radius:2px;background:${color};display:inline-block;flex-shrink:0;"></span>
      ${cat}
      <button onclick="window._deleteCategory('${cat}')" title="Eliminar categoria" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;line-height:1;padding:0 2px;" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">×</button>
    </span>`;
  }).join('');
}

window._deleteCategory = function(cat) {
  if (cat === 'Diversos') { alert('A categoria «Diversos» não pode ser eliminada.'); return; }
  const inUse  = State.allData.filter(r => r.cat === cat).length;
  const inRules = State.userRules.filter(r => r.cat === cat).length;
  let msg = `Eliminar a categoria «${cat}»?`;
  if (inUse > 0) msg += `\n\n${inUse} movimento(s) serão reassociados a «Diversos».`;
  if (inRules > 0) msg += `\n${inRules} regra(s) que usam esta categoria também serão removidas.`;
  if (!confirm(msg)) return;
  State.allData.forEach(r => { if (r.cat === cat) { r.cat = 'Diversos'; r.manual = false; } });
  State.setUserRules(State.userRules.filter(r => r.cat !== cat));
  State.setCats(State.CATS.filter(c => c !== cat));
  if (!State.CUSTOM_CATS.includes(cat)) { if (!State.DELETED_BASE_CATS.includes(cat)) State.DELETED_BASE_CATS.push(cat); }
  State.setCustomCats(State.CUSTOM_CATS.filter(c => c !== cat));
  State.PILARES.forEach(p => { p.cats = p.cats.filter(c => c !== cat); });
  delete State.budgetLimits[cat];
  Storage.savePilares(); Storage.saveRules(); Storage.saveBudget(); Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  refreshCatSelects(); renderRulesList(); renderCatChips(); refresh();
};

function reapplyCategories() {
  State.allData.forEach(r => { if (!r.manual) r.cat = autoCategory(r.desc); });
  Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  refresh();
}

window._toggleRegras = function() {
  const p = document.getElementById('regrasPainel');
  const btn = document.getElementById('regrasToggleBtn');
  const hidden = p.classList.toggle('hidden');
  btn.textContent = hidden ? 'Mostrar regras' : 'Esconder regras';
  if (!hidden) renderCatChips();
};

// ─── Pilares Config ───────────────────────────────────────────────────────────
function renderPilaresConfig() {
  const grid = document.getElementById('pilaresConfigGrid');
  if (!grid) return;
  const catsComSaidas = new Set(State.allData.filter(r => r.amount < 0).map(r => r.cat));
  const catValida = c => !State.allData.length || catsComSaidas.has(c) || State.CUSTOM_CATS.includes(c);
  if (State.allData.length) State.PILARES.forEach(p => { p.cats = p.cats.filter(c => catValida(c)); });
  const unassigned = State.CATS.filter(c => !State.PILARES.flatMap(p => p.cats).includes(c) && catValida(c));
  const cols = [
    ...State.PILARES.map(p => ({ id: p.id, title: `${p.emoji} ${p.nome}`, color: p.color, cats: p.cats, isPilar: true })),
    { id: 'outros', title: '⬜ Sem pilar', color: '#8a8680', cats: unassigned, isPilar: false }
  ];
  grid.innerHTML = cols.map(col => `
    <div class="pilar-config-col">
      <div class="pcol-title" style="color:${col.color};">${col.title}</div>
      <div>${col.cats.map(cat =>
        `<span class="pilar-cat-chip ${col.isPilar?'':'unassigned'}"
          style="${col.isPilar?`background:${col.color}20;border-color:${col.color}50;color:${col.color}`:''}"
          onclick="window._moveCatPilar('${cat}','${col.id}')">${cat} ${col.isPilar?'×':'→'}</span>`
      ).join('')}
      ${col.cats.length===0?'<span style="font-size:11px;color:var(--muted);font-style:italic;">Nenhuma categoria</span>':''}
      </div>
    </div>`).join('');
}

window._moveCatPilar = function(cat, fromId) {
  if (fromId !== 'outros') {
    const p = State.PILARES.find(x => x.id === fromId);
    if (p) p.cats = p.cats.filter(c => c !== cat);
    Storage.savePilares(); renderPilaresConfig();
    const d = State.activePilarMonth === 'all' ? State.allData : State.allData.filter(r => r.date.slice(0,7) === State.activePilarMonth);
    renderPilaresCards(d); return;
  }
  const opts = State.PILARES.map((p,i) => `${i+1}: ${p.emoji} ${p.nome}`).join('\n');
  const choice = prompt(`Para qual pilar mover «${cat}»?\n\n${opts}\n\nEscreve o número:`);
  if (!choice) return;
  const idx = parseInt(choice)-1;
  if (isNaN(idx)||idx<0||idx>=State.PILARES.length) { alert('Número inválido.'); return; }
  State.PILARES.forEach(p => { p.cats = p.cats.filter(c => c !== cat); });
  State.PILARES[idx].cats.push(cat);
  Storage.savePilares(); renderPilaresConfig();
  const d = State.activePilarMonth === 'all' ? State.allData : State.allData.filter(r => r.date.slice(0,7) === State.activePilarMonth);
  renderPilaresCards(d);
};

window._togglePilaresConfig = function() {
  const cfg = document.getElementById('pilaresConfig');
  const btn = document.getElementById('pilaresConfigBtn');
  if (cfg.classList.contains('hidden')) { cfg.classList.remove('hidden'); btn.textContent='✕ Fechar'; renderPilaresConfig(); }
  else { cfg.classList.add('hidden'); btn.textContent='⚙️ Configurar'; }
};

// ─── Budget ───────────────────────────────────────────────────────────────────
function getRendimentoEfetivo() {
  const filtered = getFilteredData();
  const total = filtered.filter(r => r.amount > 0 && r.cat === 'Rendimentos').reduce((s,r) => s+r.amount, 0);
  return total > 0 ? total : State.budgetRendimento;
}

function updateRendimentoLabel() {
  const el = document.getElementById('rendimentoEfetivoLabel');
  if (!el) return;
  const rend = getRendimentoEfetivo();
  el.textContent = rend > 0 ? fmt(rend).replace('+','') + ' €' : '—';
}

function updateBudgetOverview() {
  const strat = State.STRATEGIES[State.activeStrategy];
  const rend  = getRendimentoEfetivo();
  updateRendimentoLabel();
  const ovEl = document.getElementById('budgetOverview');
  if (!ovEl) return;
  if (!strat.groups || !rend) { ovEl.style.display='none'; return; }
  ovEl.style.display = 'grid';
  const filtered = getFilteredData();
  const gastos = { necessidades: 0, desejos: 0, poupanca: 0 };
  filtered.filter(r => r.amount < 0 && r.cat !== 'Transferências').forEach(r => {
    const pilar = State.CAT_PILAR[r.cat] || 'desejos';
    if (pilar) gastos[pilar] += Math.abs(r.amount);
  });
  [{ id:'Necessidades', key:'necessidades' }, { id:'Desejos', key:'desejos' }, { id:'Poupanca', key:'poupanca' }].forEach(({id,key}) => {
    const limite = rend * (strat.groups[key] || 0);
    const gasto  = gastos[key];
    const pct    = strat.groups[key] * 100;
    const valEl  = document.getElementById('ov'+id);
    const subEl  = document.getElementById('ov'+id+'Pct');
    if (valEl) {
      const restante = limite - gasto;
      valEl.textContent = (restante>=0?'+':'')+restante.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' €';
      valEl.className = 'budget-overview-val ' + (restante>=0 ? 'pos' : 'neg');
    }
    if (subEl) subEl.textContent = pct+'% do rendimento · '+fmt(limite).replace('+','')+' limite';
  });
}

function renderBudgetCats() {
  const grid = document.getElementById('budgetCatsGrid');
  if (!grid) return;
  const filtered = getFilteredData();
  const gastosCat = {};
  filtered.filter(r => r.amount < 0).forEach(r => { gastosCat[r.cat] = (gastosCat[r.cat]||0) + Math.abs(r.amount); });
  grid.innerHTML = State.CATS.filter(c => c !== 'Rendimentos').map(cat => {
    const color    = State.CAT_COLORS[State.CATS.indexOf(cat)] || '#888';
    const limite   = State.budgetLimits[cat] || 0;
    const gasto    = gastosCat[cat] || 0;
    const pct      = limite > 0 ? Math.min((gasto/limite)*100, 100) : 0;
    const over     = gasto > limite && limite > 0;
    const barColor = over ? 'var(--red)' : (pct > 80 ? 'var(--gold)' : color);
    const restante = limite - gasto;
    let status = '';
    if (limite > 0) {
      if (over)      status = `<span class="neg">▲ ${Math.abs(restante).toFixed(2).replace('.',',')} € acima</span>`;
      else if (pct>=80) status = `<span style="color:var(--gold)">⚠ ${restante.toFixed(2).replace('.',',')} € restantes</span>`;
      else           status = `<span class="pos">✓ ${restante.toFixed(2).replace('.',',')} € restantes</span>`;
    } else {
      status = gasto > 0
        ? `<span style="color:var(--muted)">${gasto.toFixed(2).replace('.',',')} € gastos · sem limite</span>`
        : `<span style="color:var(--muted)">sem limite definido</span>`;
    }
    return `<div class="budget-cat-item">
      <div class="budget-cat-header">
        <span class="budget-cat-name"><span class="budget-cat-dot" style="background:${color};"></span>${cat}</span>
        <div class="budget-input-wrap">
          <input type="number" class="budget-input" data-cat="${cat}" value="${limite||''}" placeholder="—" min="0" step="10"
            oninput="window._onBudgetCatInput(this)" onchange="window._saveBudgetUI()"/>
          <span class="budget-input-sym">€</span>
        </div>
      </div>
      <div class="budget-bar-wrap"><div class="budget-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
      <div class="budget-status">${status}</div>
    </div>`;
  }).join('');
}

window._onBudgetCatInput = function(input) {
  State.budgetLimits[input.dataset.cat] = parseFloat(input.value) || 0;
  State.setActiveStrategy('custom');
  document.querySelectorAll('.budget-strategy-tab').forEach(t => t.classList.toggle('active', t.dataset.strategy==='custom'));
  window._saveBudgetUI();
};

window._saveBudgetUI = function() {
  Storage.saveBudget();
  renderBudgetCats();
  updateBudgetOverview();
};

window._toggleBudget = function() {
  const p = document.getElementById('budgetPainel');
  const btn = document.getElementById('budgetToggleBtn');
  const hidden = p.classList.toggle('hidden');
  btn.textContent = hidden ? 'Mostrar objetivos' : 'Esconder objetivos';
  if (!hidden) renderBudgetCats();
};

window._applyStrategy = function(strategy) {
  State.setActiveStrategy(strategy);
  document.querySelectorAll('.budget-strategy-tab').forEach(t => t.classList.toggle('active', t.dataset.strategy===strategy));
  const desc = document.getElementById('budgetStrategyDesc');
  if (desc) desc.textContent = State.STRATEGIES[strategy]?.label || '';
  const rend  = State.budgetRendimento;
  const strat = State.STRATEGIES[strategy];
  if (strat.groups && rend > 0) {
    State.CATS.forEach(cat => {
      if (cat === 'Rendimentos') return;
      const pilar = State.CAT_PILAR[cat] || 'desejos';
      const pct   = strat.groups[pilar] || 0;
      const catsNoPilar = State.CATS.filter(c => (State.CAT_PILAR[c]||'desejos')===pilar && c!=='Rendimentos');
      State.budgetLimits[cat] = Math.round((rend*pct)/catsNoPilar.length);
    });
  }
  window._saveBudgetUI();
};

window._onBudgetRendimentoChange = function() {
  State.setBudgetRendimento(parseFloat(document.getElementById('budgetRendimento').value) || 0);
  updateBudgetOverview();
};

window._usarEntradasComoRendimento = function() {
  const filtered  = getFilteredData();
  const total = filtered.filter(r => r.amount > 0 && r.cat !== 'Transferências').reduce((s,r) => s+r.amount, 0);
  if (!total) { alert('Sem entradas no período atual.'); return; }
  State.setBudgetRendimento(Math.round(total));
  document.getElementById('budgetRendimento').value = State.budgetRendimento;
  window._saveBudgetUI(); updateBudgetOverview();
};

// ─── Meses UI ─────────────────────────────────────────────────────────────────
function renderMonthFilterChips() {
  const el  = document.getElementById('monthFilterChips');
  const sep = document.getElementById('monthFilterSep');
  if (!el) return;
  if (!State.loadedMonths.length) { el.innerHTML=''; if (sep) sep.classList.add('hidden'); return; }
  const mkBtn = (key, label, active) =>
    `<button onclick="window._setMonthFilter('${key}')" style="padding:4px 12px;font-size:12px;font-family:'DM Sans',sans-serif;font-weight:500;border-radius:20px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent)':'transparent'};color:${active?'#fff':'var(--muted)'};cursor:pointer;">${label}</button>`;
  el.innerHTML = mkBtn('all','Todos',State.activeTableMonth==='all')
    + State.loadedMonths.map(m => mkBtn(m.key, m.label, State.activeTableMonth===m.key)).join('');
  if (sep) sep.classList.remove('hidden');
}

window._setMonthFilter = function(key) {
  State.setActiveTableMonth(key);
  State.setActiveResumoMonth(key);
  const months = [...new Set(State.allData.map(r => r.date.slice(0,7)))].sort();
  State.setActivePilarMonth(key==='all' ? (months[months.length-1] || 'all') : key);
  renderMonthFilterChips(); refresh();
};

function updateMonthsUI() {
  const listEl  = document.getElementById('monthsList');
  const chipsEl = document.getElementById('monthsChips');
  if (!State.loadedMonths.length) { listEl.classList.add('hidden'); return; }
  listEl.classList.remove('hidden');
  chipsEl.innerHTML = State.loadedMonths.map(m => `
    <span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:4px 10px 4px 12px;font-size:12px;font-family:'DM Mono',monospace;">
      ${m.label} <span style="color:var(--muted);font-size:11px;">(${m.count})</span>
      <button onclick="window._removeMonth('${m.key}')" title="Remover este mês" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:0 2px;" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">×</button>
    </span>`).join('');
}

window._removeMonth = function(key) {
  const m = State.loadedMonths.find(lm => lm.key === key);
  if (!m) return;
  if (!confirm(`Remover os dados de ${m.label}?`)) return;
  State.setAllData(State.allData.filter(r => r.date.slice(0,7) !== key));
  State.setLoadedMonths(State.loadedMonths.filter(lm => lm.key !== key));
  if (!State.allData.length) { doReset(); return; }
  Storage.save();
  updateMonthsUI();
  document.getElementById('fileInfoText').textContent = State.allData.length + ' movimentos no total';
  refresh();
};

// ─── Refresh principal ────────────────────────────────────────────────────────
function refresh() {
  const f = getFiltered();
  renderKPIs(f);
  renderCharts(f);
  renderMonthFilterChips();
  renderPilares(f);
  renderResumo(f);
  renderTable(f);
  const budgetPainel = document.getElementById('budgetPainel');
  if (budgetPainel && !budgetPainel.classList.contains('hidden')) {
    updateRendimentoLabel(); renderBudgetCats(); updateBudgetOverview();
  }
}

function showDash(label, detail, isBankFmt) {
  document.getElementById('fileInfoText').textContent = label + (detail ? ' · ' + detail : '');
  document.getElementById('fileInfo').classList.remove('hidden');
  document.getElementById('hintBox').classList.add('hidden');
  document.getElementById('clearBtn').classList.remove('hidden');
  document.getElementById('savedPill').classList.remove('hidden');
  refresh();
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function doReset() {
  try { localStorage.removeItem('finDash_v3'); } catch(e) {}
  State.setAllData([]); State.setMetaInfo({}); State.setLoadedMonths([]);
  State.setActiveTableMonth('all'); State.setActiveResumoMonth('all'); State.setActiveSearch('');
  const si  = document.getElementById('searchInput');    if (si)  si.value = '';
  const scb = document.getElementById('searchClearBtn'); if (scb) scb.style.display = 'none';
  const src = document.getElementById('searchResultCount'); if (src) src.style.display = 'none';
  document.getElementById('fileInfo').classList.add('hidden');
  document.getElementById('hintBox').classList.remove('hidden');
  document.getElementById('clearBtn').classList.add('hidden');
  document.getElementById('savedPill').classList.add('hidden');
  document.getElementById('monthsList').classList.add('hidden');
  document.getElementById('monthsChips').innerHTML = '';
  const mfc = document.getElementById('monthFilterChips'); if (mfc) mfc.innerHTML = '';
  document.getElementById('movBody').innerHTML = '<tr><td colspan="4"><div class="empty-state">Sem dados<p>Carrega um extrato CSV ou usa o demo.</p></div></td></tr>';
  if (State.chartDona)    { State.chartDona.destroy();    State.setChartDona(null); }
  if (State.chartBar)     { State.chartBar.destroy();     State.setChartBar(null); }
  if (State.chartLine)    { State.chartLine.destroy();    State.setChartLine(null); }
  if (State.chartPilares) { State.chartPilares.destroy(); State.setChartPilares(null); }
  document.getElementById('fileInput').value = '';
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function handleFile(file, isLast, onDone) {
  const reader = new FileReader();
  reader.onload = ev => {
    const { rows, isBankFormat, meta } = parseCSV(ev.target.result);
    if (rows.length === 0) {
      alert('Não foi possível ler o ficheiro.\n\nVerifica se é um extrato CSV exportado pelo banco.');
      if (onDone) onDone(); return;
    }
    Object.assign(State.metaInfo, meta);
    const monthsInFile = [...new Set(rows.map(r => r.date.slice(0,7)))].sort();
    const manualEdits  = {};
    monthsInFile.forEach(m => {
      State.allData.filter(r => r.date.slice(0,7)===m && r.manual)
        .forEach(r => { manualEdits[r.date+'|'+r.desc+'|'+r.amount] = r.cat; });
    });
    monthsInFile.forEach(m => {
      State.setAllData(State.allData.filter(r => r.date.slice(0,7) !== m));
      State.setLoadedMonths(State.loadedMonths.filter(lm => lm.key !== m));
    });
    rows.forEach(r => {
      const key = r.date+'|'+r.desc+'|'+r.amount;
      if (manualEdits[key] !== undefined) { r.cat = manualEdits[key]; r.manual = true; }
    });
    State.setAllData(State.allData.concat(rows));
    monthsInFile.forEach(m => {
      const count = rows.filter(r => r.date.slice(0,7)===m).length;
      const [y, mo] = m.split('-');
      const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];
      State.loadedMonths.push({ key: m, label: nomeMes+' '+y, count });
    });
    State.loadedMonths.sort((a,b) => a.key.localeCompare(b.key));
    Storage.save();
    if (isLast && Storage.gAccessToken) Storage.driveSave();
    else if (Storage.gAccessToken) Storage.scheduleDriveSave();
    updateMonthsUI();
    showDash(State.allData.length+' movimentos no total', monthsInFile.length+' mês(es) adicionado(s)', isBankFormat);
    if (onDone) onDone();
  };
  reader.readAsText(file, 'windows-1252');
}

// ─── Pesquisa ─────────────────────────────────────────────────────────────────
let _searchTimer = null;
window._onSearchInput = function(val) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    State.setActiveSearch(val.trim());
    const clearBtn = document.getElementById('searchClearBtn');
    const countEl  = document.getElementById('searchResultCount');
    if (State.activeSearch) {
      clearBtn.style.display = '';
      const total = State.allData.filter(r => {
        if (State.activeTableMonth !== 'all' && r.date.slice(0,7) !== State.activeTableMonth) return false;
        const q = State.activeSearch.toUpperCase();
        return r.desc.toUpperCase().includes(q) || r.cat.toUpperCase().includes(q);
      });
      const filt = filterByType(total, State.activeType);
      countEl.style.display = '';
      countEl.textContent = filt.length===0 ? `Nenhum resultado para "${State.activeSearch}"` : `${filt.length} resultado${filt.length!==1?'s':''} para "${State.activeSearch}"`;
      renderTable(getFiltered());
    } else {
      clearBtn.style.display = 'none'; countEl.style.display = 'none'; renderTable(getFiltered());
    }
  }, 200);
};

window._clearSearch = function() {
  const inp = document.getElementById('searchInput');
  inp.value = ''; State.setActiveSearch('');
  document.getElementById('searchClearBtn').style.display = 'none';
  document.getElementById('searchResultCount').style.display = 'none';
  renderTable(getFiltered()); inp.focus();
};

// ─── Exports para backup manual ───────────────────────────────────────────────
const uiCallbacks = { refreshCatSelects, renderRulesList, updateMonthsUI, showDash };
window._exportData  = Storage.exportData;
window._importData  = (input) => Storage.importData(input, uiCallbacks);
window._forceDriveSave = Storage.forceDriveSave;
window._startGoogleLogin = Storage.startGoogleLogin;
window._gSignOut    = () => Storage.gSignOut({ updateSessionUI: Storage.updateSessionUI, doReset });

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  // Tabs tipo
  document.querySelectorAll('.tab[data-t]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-t]').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      State.setActiveType(btn.dataset.t);
      refresh();
    });
  });

  // Upload
  document.getElementById('fileInput').addEventListener('change', e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (!Storage.gAccessToken) {
      if (!confirm('⚠️ Não estás com sessão iniciada.\n\nSem login, os dados NÃO ficam guardados na tua conta Google — perdes-os ao fechar o separador.\n\nQueres continuar mesmo assim?')) {
        e.target.value = ''; return;
      }
    }
    let i = 0;
    function next() { if (i < files.length) handleFile(files[i++], i===files.length, next); }
    next(); e.target.value = '';
  });

  // Drag & Drop
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor='var(--accent)'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor=''; });
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.style.borderColor='';
    if (!Storage.gAccessToken) {
      if (!confirm('⚠️ Não estás com sessão iniciada.\n\nSem login, os dados NÃO ficam guardados.\n\nQueres continuar mesmo assim?')) return;
    }
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(csv|txt)$/i));
    files.forEach((f, idx) => handleFile(f, idx===files.length-1));
  });
  dz.addEventListener('click', () => document.getElementById('fileInput').click());

  // Limpar
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('Apagar todos os dados guardados?')) return;
    doReset();
  });

  // Demo
  document.getElementById('demoBtn').addEventListener('click', () => {
    State.setMetaInfo({ conta: 'DEMO - EUR', dataInicio: '01-03-2026', dataFim: '30-04-2026', saldoFinal: '741,41' });
    State.setAllData([
      { date:'2026-04-30', desc:'TRF CXDAPP', amount:500, cat:'Transferências' },
      { date:'2026-04-30', desc:'CARDINAL GARRIDO UNIP', amount:-17.60, cat:'Habitação' },
      { date:'2026-04-30', desc:'COMPRAS C.DEB CELEIRO', amount:-10.47, cat:'Supermercado' },
      { date:'2026-04-30', desc:'COMPRAS C.DEB LASERUM', amount:-29.00, cat:'Saúde' },
      { date:'2026-04-29', desc:'COMPRAS C.DEB ALDI', amount:-11.79, cat:'Supermercado' },
      { date:'2026-04-29', desc:'COMPRAS C.DEB KFC', amount:-7.75, cat:'Restaurantes' },
      { date:'2026-04-28', desc:'AGUAS DE ALENQUER', amount:-22.17, cat:'Habitação' },
      { date:'2026-04-27', desc:'Conta Condominio', amount:-291.00, cat:'Habitação' },
      { date:'2026-04-27', desc:'FIDELIDADE COMPANHI', amount:-11.72, cat:'Seguros' },
      { date:'2026-04-26', desc:'TFI DR ANTONIO MAXIMO', amount:40, cat:'Transferências' },
      { date:'2026-04-26', desc:'Trf Mbway', amount:-40, cat:'Transferências' },
      { date:'2026-04-22', desc:'COMPRA CONTINENTE MOD', amount:-8.69, cat:'Supermercado' },
      { date:'2026-04-22', desc:'COMPRA INTERMARCHE', amount:-12.42, cat:'Supermercado' },
      { date:'2026-04-21', desc:'COMPRA HONEST GREENS', amount:-46.15, cat:'Restaurantes' },
      { date:'2026-04-20', desc:'COMPRA AUCHAN', amount:-5.58, cat:'Supermercado' },
      { date:'2026-04-20', desc:'TFI DR ANTONIO MAXIMO', amount:100, cat:'Transferências' },
      { date:'2026-04-20', desc:'FIDELIDADE COMPANHI', amount:-25.00, cat:'Seguros' },
      { date:'2026-04-18', desc:'COMPRA KFC', amount:-8.05, cat:'Restaurantes' },
      { date:'2026-04-14', desc:'VODAFONE PORTUGAL', amount:-37.60, cat:'Telecomunicações' },
      { date:'2026-04-14', desc:'COMPRA KFC', amount:-7.75, cat:'Restaurantes' },
      { date:'2026-03-31', desc:'SALARIO EMPRESA XYZ', amount:1800, cat:'Rendimentos' },
      { date:'2026-03-30', desc:'COMPRA PINGO DOCE', amount:-45.20, cat:'Supermercado' },
      { date:'2026-03-28', desc:'RENDA APARTAMENTO', amount:-650.00, cat:'Habitação' },
      { date:'2026-03-25', desc:'VODAFONE PORTUGAL', amount:-37.60, cat:'Telecomunicações' },
      { date:'2026-03-22', desc:'NETFLIX', amount:-15.99, cat:'Lazer' },
      { date:'2026-03-20', desc:'COMPRA LIDL', amount:-32.10, cat:'Supermercado' },
      { date:'2026-03-18', desc:'FARMACIA SAUDE', amount:-18.50, cat:'Saúde' },
      { date:'2026-03-15', desc:'COMPRA HONEST GREENS', amount:-38.00, cat:'Restaurantes' },
      { date:'2026-03-10', desc:'UBER', amount:-12.40, cat:'Transportes' },
      { date:'2026-03-05', desc:'SPOTIFY', amount:-9.99, cat:'Lazer' },
    ]);
    State.setLoadedMonths([
      { key:'2026-03', label:'Mar 2026', count:10 },
      { key:'2026-04', label:'Abr 2026', count:20 },
    ]);
    Storage.save();
    updateMonthsUI();
    showDash(State.allData.length+' movimentos — 2 meses de demo', '', true);
  });

  // Google Auth init
  setTimeout(() => {
    Storage.initGoogleAuth({
      onLogin: () => {
        Storage.updateSessionUI();
        Storage.loadRules();
        refreshCatSelects();
        renderRulesList();
        Storage.loadBudget();
        Storage.driveLoad(uiCallbacks).then(() => {
          updateMonthsUI();
        });
      },
      updateSessionUI: Storage.updateSessionUI,
      doReset
    });
  }, 400);
});
