// ─── App.js — Lógica principal da UI ─────────────────────────────────────────
import * as State from './state.js';
import { autoCategory, applyRules, fmt, fmtAbs, parseCSV } from './categorize.js';
import * as Storage from './storage.js';
import { initObjetivos, refreshObjetivos } from './objetivos.js';

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

  // Saídas líquidas: descontar reembolsos só dentro da MESMA categoria (não globalmente)
  const catsPresentes = new Set(data.map(r => r.cat));
  let sai = 0;
  catsPresentes.forEach(cat => {
    if (cat === 'Rendimentos') return;
    const saidasCat   = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s, r) => s + Math.abs(r.amount), 0);
    const entradasCat = data.filter(r => r.amount > 0 && r.cat === cat).reduce((s, r) => s + r.amount, 0);
    sai += Math.max(0, saidasCat - entradasCat);
  });

  document.getElementById('kpiEnt').textContent = '+' + fmtAbs(ent);
  document.getElementById('kpiEntN').textContent = '';
  document.getElementById('kpiSai').textContent = '-' + fmtAbs(sai);
  document.getElementById('kpiSaiN').textContent = '';

  const fluxo = ent - sai;
  const kpiFluxoEl = document.getElementById('kpiFluxo');
  kpiFluxoEl.textContent = (fluxo > 0 ? '+' : fluxo < 0 ? '-' : '') + fmtAbs(fluxo);
  kpiFluxoEl.classList.remove('pos', 'neg', 'neu');
  const fluxoColor = fluxo > 0 ? 'var(--green)' : fluxo === 0 ? 'var(--gold)' : 'var(--red)';
  kpiFluxoEl.style.color = fluxoColor;
}

// ─── Resumo de Pilares (quadrados de topo) ─────────────────────────────────────
function renderPilaresResumo(data) {
  const elRend = document.getElementById('pilaresResumoRend');
  const elSai  = document.getElementById('pilaresResumoSai');
  if (!elRend || !elSai) return;

  const hasPilarCats = State.PILARES.some(p => p.cats.length > 0);
  if (!data.length || !hasPilarCats) {
    elRend.classList.add('hidden');
    elSai.classList.add('hidden');
    return;
  }

  const gastoLiquidoCat = cat => {
    const saidas   = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s,r) => s + Math.abs(r.amount), 0);
    const entradas = data.filter(r => r.amount > 0 && r.cat === cat && r.cat !== 'Rendimentos').reduce((s,r) => s + r.amount, 0);
    return Math.max(0, saidas - entradas);
  };

  const totalRend = data.filter(r => r.amount > 0 && r.cat === 'Rendimentos').reduce((s, r) => s + r.amount, 0);
  const totalSai  = State.PILARES.flatMap(p => p.cats).reduce((s, cat) => s + gastoLiquidoCat(cat), 0);
  const porPilar  = State.PILARES.map(p => ({ p, total: p.cats.reduce((s, cat) => s + gastoLiquidoCat(cat), 0) }));

  const taxaPct   = totalRend > 0 ? (totalSai / totalRend * 100) : 0;
  const taxaColor = taxaPct < 80 ? 'var(--green)' : taxaPct <= 100 ? 'var(--accent2)' : taxaPct <= 110 ? 'var(--red)' : 'var(--red-dark)';

  // Cards unificados por pilar
  elRend.classList.remove('hidden');
  elRend.innerHTML = porPilar.map(({p, total}) => {
    const pctRend = totalRend > 0 ? (total / totalRend * 100) : 0;
    const pctSai  = totalSai  > 0 ? (total / totalSai  * 100) : 0;
    const barRend = Math.min(pctRend, 100);
    const barSai  = Math.min(pctSai,  100);
    return `<div class="kpi" style="padding:1rem 1.25rem;">
      <div class="kpi-label" style="margin-bottom:0.6rem;">${p.emoji} ${p.nome}</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px;">
        <span style="font-family:'DM Serif Display',serif;font-size:1.45rem;color:${p.color};line-height:1.1;">${pctRend.toFixed(1)}%</span>
        <span style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;">do rendimento</span>
      </div>
      <div style="height:4px;background:var(--border);border-radius:3px;margin-bottom:8px;overflow:hidden;">
        <div style="height:4px;width:${barRend}%;background:${p.color};border-radius:3px;transition:width .4s;"></div>
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px;">
        <span style="font-size:1rem;font-weight:600;color:${p.color};font-family:'DM Mono',monospace;">${pctSai.toFixed(1)}%</span>
        <span style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;">das saídas · ${fmtAbs(total)}</span>
      </div>
      <div style="height:3px;background:var(--border);border-radius:3px;overflow:hidden;">
        <div style="height:3px;width:${barSai}%;background:${p.color};opacity:0.45;border-radius:3px;transition:width .4s;"></div>
      </div>
    </div>`;
  }).join('') + `<div class="kpi" style="padding:1rem 1.25rem;">
    <div class="kpi-label" style="margin-bottom:0.6rem;display:flex;align-items:center;">Taxa de Alocação
      <span class="info-tip" tabindex="0">i<span class="info-tip-bubble">
        <strong>% do rendimento já alocada aos pilares.</strong>
        <div class="tip-row"><span><span class="tip-dot" style="background:var(--green);"></span>&lt; 80%</span><span>Saudável</span></div>
        <div class="tip-row"><span><span class="tip-dot" style="background:var(--accent2);"></span>80–100%</span><span>Equilibrado</span></div>
        <div class="tip-row"><span><span class="tip-dot" style="background:var(--red);"></span>100–110%</span><span>No limite</span></div>
        <div class="tip-row"><span><span class="tip-dot" style="background:var(--red-dark);"></span>&gt; 110%</span><span>Alerta</span></div>
      </span></span>
      <span class="edu-tip" tabindex="0">📖<span class="edu-tip-bubble">
        <strong>Como ler estas percentagens?</strong><br/>
        <strong>% do rendimento:</strong> que fatia do que ganhaste foi para este pilar — mostra o peso de cada área na tua vida financeira.<br/><br/>
        <strong>% das saídas:</strong> que fatia do que gastaste foi para este pilar — mostra onde o teu dinheiro realmente foi, independentemente de quanto ganhaste.<br/><br/>
        A <strong>Taxa de Alocação</strong> soma as saídas alocadas aos 3 pilares e compara com o rendimento total: mostra quanto do que ganhas já tem destino definido.
      </span></span>
    </div>
    <div style="font-family:'DM Serif Display',serif;font-size:1.45rem;color:${taxaColor};line-height:1.1;margin-bottom:4px;">${taxaPct.toFixed(1)}%</div>
    <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;">do rendimento · ${fmtAbs(totalSai)} alocados</div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;font-family:'DM Mono',monospace;">Total saídas<br/><span style="font-size:13px;font-weight:600;color:var(--text);">${fmtAbs(totalSai)}</span></div>
  </div>`;

  // Ocultar a segunda grelha — informação já integrada nos cards acima
  elSai.classList.add('hidden');
  elSai.innerHTML = '';
}

// ─── Tabela ───────────────────────────────────────────────────────────────────
function renderTable(data) {
  const body   = document.getElementById('movBody');
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    const msg = State.activeSearch
      ? `Sem resultados para "<strong>${State.activeSearch}</strong>"`
      : 'Sem movimentos para este filtro.';
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state">${msg}</div></td></tr>`;
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
      <td style="width:34px;text-align:center;">
        <button onclick="window._deleteMov(${globalIdx})" title="Apagar movimento"
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:15px;line-height:1;padding:2px 4px;"
          onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

window._deleteMov = function(idx) {
  const r = State.allData[idx];
  if (!r) return;
  const dateDisp = r.date.slice(8,10) + '/' + r.date.slice(5,7) + '/' + r.date.slice(0,4);
  if (!confirm(`Apagar este movimento?\n\n${dateDisp} — ${r.desc} — ${fmt(r.amount)}\n\nEsta ação não pode ser desfeita.`)) return;
  State.allData.splice(idx, 1);
  Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  refresh();
};

window._toggleAddMov = function() {
  const panel = document.getElementById('addMovPanel');
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (isHidden) {
    refreshCatSelects();
    const todayISO = new Date().toISOString().slice(0, 10);
    document.getElementById('addMovDate').value = todayISO;
    document.getElementById('addMovDesc').value = '';
    document.getElementById('addMovValor').value = '';
  }
};

window._addManualMov = function() {
  const dateEl = document.getElementById('addMovDate');
  const descEl = document.getElementById('addMovDesc');
  const valorEl = document.getElementById('addMovValor');
  const catEl = document.getElementById('addMovCat');

  const date = dateEl.value;
  const desc = descEl.value.trim();
  const amount = parseFloat(valorEl.value);
  const cat = catEl.value;

  if (!date) { alert('Indica uma data.'); dateEl.focus(); return; }
  if (!desc) { alert('Indica uma descrição.'); descEl.focus(); return; }
  if (isNaN(amount) || amount === 0) { alert('Indica um valor diferente de zero (positivo para entrada, negativo para saída).'); valorEl.focus(); return; }

  State.allData.push({ date, desc, amount, cat, manual: true, manualOnly: true });
  Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  window._toggleAddMov();
  refresh();
};

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
  if (false && saiBody) {
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
  const totalRend = data.filter(r => r.amount > 0 && r.cat === 'Rendimentos').reduce((s, r) => s + r.amount, 0);
  const cardsEl  = document.getElementById('pilaresCards');
  if (!cardsEl) return;

  cardsEl.innerHTML = State.PILARES.map(p => {
    const total    = p.cats.reduce((s, cat) => s + gastoLiquidoCat(cat), 0);
    const pctPilar = totalSai > 0 ? (total / totalSai * 100).toFixed(1) : '0.0';
    const pctRend  = totalRend > 0 ? (total / totalRend * 100).toFixed(1) : '0.0';
    const catRows  = p.cats.map(cat => {
      const saidasCat    = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s,r) => s + Math.abs(r.amount), 0);
      const reembolsoCat = data.filter(r => r.amount > 0 && r.cat === cat).reduce((s,r) => s + r.amount, 0);
      const gasto = Math.max(0, saidasCat - reembolsoCat);
      if (saidasCat === 0 && reembolsoCat === 0) return '';
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
          <td style="font-size:13px;font-family:'DM Mono',monospace;text-align:right;padding:8px 0;white-space:nowrap;">
            <div style="color:var(--red);">-${fmtAbs(gasto)}</div>
            ${reembolsoCat > 0 ? `<div style="color:var(--green);font-size:10px;font-weight:500;">+${fmtAbs(reembolsoCat)} reembolso</div>` : ''}
          </td>
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
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
            <span style="font-size:12px;color:var(--muted);font-family:'DM Mono',monospace;white-space:nowrap;">${pctPilar}% das saídas</span>
            <span style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;opacity:.65;white-space:nowrap;">${pctRend}% do rendimento</span>
          </div>
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
  // gráfico removido do UI
}

window._setPilarChartMode = function() {};

// ─── Regras ───────────────────────────────────────────────────────────────────
function refreshCatSelects() {
  const ruleCatEl = document.getElementById('ruleCat');
  if (ruleCatEl) {
    const cur = ruleCatEl.value;
    ruleCatEl.innerHTML = State.CATS.map(c => `<option value="${c}">${c}</option>`).join('')
      + `<option value="__new__" style="color:var(--blue);font-style:italic;">+ Nova categoria...</option>`;
    if ([...ruleCatEl.options].some(o => o.value === cur)) ruleCatEl.value = cur;
  }
  const addMovCatEl = document.getElementById('addMovCat');
  if (addMovCatEl) {
    const cur = addMovCatEl.value;
    addMovCatEl.innerHTML = State.CATS.map(c => `<option value="${c}">${c}</option>`).join('');
    if ([...addMovCatEl.options].some(o => o.value === cur)) addMovCatEl.value = cur;
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
  el.innerHTML = State.userRules.map((r, i) => {
    const color = State.CAT_COLORS[State.CATS.indexOf(r.cat)] || '#888';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border);">
      <span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.keyword}">${r.keyword}</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;flex-shrink:0;">
        <span style="width:7px;height:7px;border-radius:2px;background:${color};display:inline-block;"></span>${r.cat}
      </span>
      <button onclick="window._deleteRule(${i})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;flex-shrink:0;padding:0 2px;" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'" title="Apagar">×</button>
    </div>`;
  }).join('');
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
  State.allData.forEach(r => { if (r.cat === cat) { r.cat = 'Diversos'; r.manual = true; } });
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
  State.allData.forEach(r => {
    if (!r.manual || !State.CATS.includes(r.cat)) r.cat = autoCategory(r.desc, r.amount);
  });
  Storage.save();
  if (Storage.gAccessToken) Storage.scheduleDriveSave();
  refresh();
}

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
  const chipsEl = document.getElementById('monthsChips');
  if (!chipsEl) return;
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
  const fitEl = document.getElementById('fileInfoText');
  if (fitEl) fitEl.textContent = State.allData.length + ' movimentos no total';
  refresh();
};

// ─── Refresh principal ────────────────────────────────────────────────────────
function refresh() {
  const f = getFiltered();
  renderKPIs(f);
  renderPilaresResumo(f);
  renderMonthFilterChips();
  renderPilares(f);
  renderPilaresConfig();
  renderResumo(f);
  renderTable(f);
  const budgetPainel = document.getElementById('budgetPainel');
  if (budgetPainel && !budgetPainel.classList.contains('hidden')) {
    updateRendimentoLabel(); renderBudgetCats(); updateBudgetOverview();
  }
  refreshObjetivos();
}

function showDash(label, detail, isBankFmt) {
  const fileInfoTextEl = document.getElementById('fileInfoText');
  if (fileInfoTextEl) fileInfoTextEl.textContent = label + (detail ? ' · ' + detail : '');
  document.getElementById('uploadExpanded').style.display = 'none';
  document.getElementById('uploadCompact').classList.remove('hidden');
  document.getElementById('uploadCompact').style.display = 'flex';
  document.getElementById('fileInfo').classList.remove('hidden');
  document.getElementById('hintBox').classList.add('hidden');
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
  document.getElementById('uploadExpanded').style.display = '';
  document.getElementById('uploadCompact').classList.add('hidden');
  document.getElementById('fileInfo').classList.add('hidden');
  document.getElementById('hintBox').classList.remove('hidden');
  document.getElementById('savedPill').classList.add('hidden');
  const mc = document.getElementById('monthsChips'); if (mc) mc.innerHTML = '';
  const mfc = document.getElementById('monthFilterChips'); if (mfc) mfc.innerHTML = '';
  document.getElementById('movBody').innerHTML = '<tr><td colspan="5"><div class="empty-state">Sem dados<p>Carrega um extrato CSV ou usa o demo.</p></div></td></tr>';
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
    const manualOnlyRows = []; // linhas manuais que não vieram de nenhum CSV (criadas à mão) — preservam-se sempre
    monthsInFile.forEach(m => {
      State.allData.filter(r => r.date.slice(0,7)===m && r.manual)
        .forEach(r => {
          const key = r.date+'|'+r.desc+'|'+r.amount;
          manualEdits[key] = r.cat;
          if (r.manualOnly) manualOnlyRows.push(r);
        });
    });
    monthsInFile.forEach(m => {
      State.setAllData(State.allData.filter(r => r.date.slice(0,7) !== m));
      State.setLoadedMonths(State.loadedMonths.filter(lm => lm.key !== m));
    });
    rows.forEach(r => {
      const key = r.date+'|'+r.desc+'|'+r.amount;
      if (manualEdits[key] !== undefined) { r.cat = manualEdits[key]; r.manual = true; }
    });
    State.setAllData(State.allData.concat(rows).concat(manualOnlyRows));
    monthsInFile.forEach(m => {
      const count = rows.filter(r => r.date.slice(0,7)===m).length + manualOnlyRows.filter(r => r.date.slice(0,7)===m).length;
      const [y, mo] = m.split('-');
      const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];
      State.loadedMonths.push({ key: m, label: nomeMes+' '+y, count });
    });
    State.loadedMonths.sort((a,b) => a.key.localeCompare(b.key));
    // Ativar o último mês automaticamente
    const lastMonth = State.loadedMonths[State.loadedMonths.length - 1];
    if (lastMonth) {
      State.setActiveTableMonth(lastMonth.key);
      State.setActiveResumoMonth(lastMonth.key);
    }
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

// ─── Drawer Regras ────────────────────────────────────────────────────────────
window._toggleRegras = function() {
  const drawer  = document.getElementById('regrasDrawer');
  const overlay = document.getElementById('regrasOverlay');
  if (!drawer) return;
  if (drawer.classList.contains('open')) {
    drawer.classList.remove('open');
    overlay.classList.add('hidden');
  } else {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => drawer.classList.add('open'));
    renderRulesList();
    renderCatChips();
  }
};

window._closeRegras = function() {
  const drawer  = document.getElementById('regrasDrawer');
  const overlay = document.getElementById('regrasOverlay');
  if (!drawer) return;
  drawer.classList.remove('open');
  overlay.classList.add('hidden');
};

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  refreshCatSelects();
  initObjetivos();

  // Tabs tipo
  document.querySelectorAll('.tab[data-t]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-t]').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      State.setActiveType(btn.dataset.t);
      refresh();
    });
  });

  // Upload — input na vista compacta
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

  // Upload — input na vista expandida
  document.getElementById('fileInputExpanded').addEventListener('change', e => {
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
  dz.addEventListener('click', () => document.getElementById('fileInputExpanded').click());

  // Limpar
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('Apagar todos os dados guardados?')) return;
    doReset();
  });

  // Google Auth init
  setTimeout(() => {
    Storage.initGoogleAuth({
      onLogin: () => {
        // Mostra estado de carregamento no overlay enquanto busca dados do Drive
        const signinContent = document.getElementById('gSigninContent');
        const loadingContent = document.getElementById('gLoadingContent');
        const overlay = document.getElementById('gSigninOverlay');
        if (signinContent) signinContent.style.display = 'none';
        if (loadingContent) loadingContent.style.display = 'block';
        if (overlay) overlay.style.display = 'flex';

        Storage.updateSessionUI();
        Storage.loadRules();
        refreshCatSelects();
        renderRulesList();
        Storage.loadBudget();
        Storage.driveLoad(uiCallbacks).then(() => {
          if (overlay) overlay.style.display = 'none';
          if (signinContent) signinContent.style.display = 'block';
          if (loadingContent) loadingContent.style.display = 'none';
          updateMonthsUI();
          const lastMonth = State.loadedMonths[State.loadedMonths.length - 1];
          if (lastMonth) {
            State.setActiveTableMonth(lastMonth.key);
            State.setActiveResumoMonth(lastMonth.key);
          }
          refresh();
        });
      },
      updateSessionUI: Storage.updateSessionUI,
      doReset
    });
  }, 400);
});
