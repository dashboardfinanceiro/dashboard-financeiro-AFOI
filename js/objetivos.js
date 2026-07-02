// ─── objetivos.js — Widget de Objetivos Financeiros ──────────────────────────
// Importar em app.js: import { initObjetivos, refreshObjetivos } from './objetivos.js';
// Chamar initObjetivos() no window.load
// Chamar refreshObjetivos() dentro de refresh() em app.js

import * as State from './state.js';
import { fmtAbs } from './categorize.js';

// ─── Perfis disponíveis ───────────────────────────────────────────────────────
const PERFIS = {
  equilibrio: {
    nome: '⚖️ Equilíbrio',
    essenciais: 50, lazer: 30, poupanca: 20
  },
  base: {
    nome: '🧱 Base sólida',
    essenciais: 60, lazer: 20, poupanca: 20
  },
  realista: {
    nome: '💪 Realista',
    essenciais: 70, lazer: 20, poupanca: 10
  },
  riqueza: {
    nome: '🚀 Construir riqueza',
    essenciais: 50, lazer: 20, poupanca: 30
  }
};

// Persistir a escolha do perfil em localStorage
let _perfilAtivo = localStorage.getItem('obj_perfil') || null;

// ─── Abrir / Fechar drawer ────────────────────────────────────────────────────
window._toggleObjetivos = function () {
  const drawer  = document.getElementById('objetivosDrawer');
  const overlay = document.getElementById('objetivosOverlay');
  const isOpen  = drawer.classList.contains('open');
  if (isOpen) {
    _closeDrawer(drawer, overlay);
  } else {
    _openDrawer(drawer, overlay);
  }
};

window._closeObjetivos = function () {
  const drawer  = document.getElementById('objetivosDrawer');
  const overlay = document.getElementById('objetivosOverlay');
  _closeDrawer(drawer, overlay);
};

function _openDrawer(drawer, overlay) {
  overlay.classList.remove('hidden');
  // pequeno delay para a transição CSS funcionar
  requestAnimationFrame(() => drawer.classList.add('open'));
  refreshObjetivos();
}

function _closeDrawer(drawer, overlay) {
  drawer.classList.remove('open');
  overlay.classList.add('hidden');
}

// ─── Selecionar perfil ────────────────────────────────────────────────────────
window._selectPerfil = function (perfil) {
  _perfilAtivo = perfil;
  localStorage.setItem('obj_perfil', perfil);
  // Atualizar botões ativos
  document.querySelectorAll('.obj-perfil-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.perfil === perfil);
  });
  _renderDiagnostico();
};

// ─── Calcular totais por pilar com base nos dados atuais ──────────────────────
function _calcularPilares(data) {
  // Usar os PILARES definidos pelo utilizador (State.PILARES)
  // Cada pilar tem p.cats — lista de categorias que lhe pertencem
  const totalRend = data
    .filter(r => r.amount > 0 && r.cat === 'Rendimentos')
    .reduce((s, r) => s + r.amount, 0);

  const gastoLiqCat = (cat) => {
    const saidas   = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s, r) => s + Math.abs(r.amount), 0);
    const entradas = data.filter(r => r.amount > 0 && r.cat === cat && r.cat !== 'Rendimentos').reduce((s, r) => s + r.amount, 0);
    return Math.max(0, saidas - entradas);
  };

  const resultado = {};
  State.PILARES.forEach(p => {
    resultado[p.id] = p.cats.reduce((s, cat) => s + gastoLiqCat(cat), 0);
  });

  return { totalRend, porPilar: resultado };
}

// ─── Mapear pilares do utilizador para os 3 slots do perfil ──────────────────
// Os PILARES do utilizador têm ids: 'essenciais', 'lazer', 'poupanca'
// Estes coincidem exatamente com as chaves dos PERFIS
function _pctAtual(porPilar, totalRend, slot) {
  const val = porPilar[slot] || 0;
  if (totalRend <= 0) return 0;
  return (val / totalRend) * 100;
}

// ─── Gerar conselhos específicos com dados reais ─────────────────────────────
function _gerarConselhos(perfil, pcts, data, porPilar, totalRend) {
  const conselhos = [];
  const p = PERFIS[perfil];

  const desvioEss  = pcts.essenciais - p.essenciais;
  const desvioLaz  = pcts.lazer      - p.lazer;
  const desvioPoup = pcts.poupanca   - p.poupanca;

  const fmt = v => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  // ── Calcular top categorias dentro de cada pilar ──────────────────────────
  const gastoLiqCat = (cat) => {
    const saidas   = data.filter(r => r.amount < 0 && r.cat === cat).reduce((s, r) => s + Math.abs(r.amount), 0);
    const entradas = data.filter(r => r.amount > 0 && r.cat === cat && r.cat !== 'Rendimentos').reduce((s, r) => s + r.amount, 0);
    return Math.max(0, saidas - entradas);
  };

  // Top categoria por pilar
  const topCatDePilar = (pilarId) => {
    const pilar = State.PILARES.find(p => p.id === pilarId);
    if (!pilar || !pilar.cats.length) return null;
    const cats = pilar.cats.map(cat => ({ cat, val: gastoLiqCat(cat) })).filter(x => x.val > 0);
    cats.sort((a, b) => b.val - a.val);
    return cats[0] || null;
  };

  const valEss  = porPilar['essenciais'] || 0;
  const valLaz  = porPilar['lazer']      || 0;
  const valPoup = porPilar['poupanca']   || 0;

  const alvoEss  = totalRend > 0 ? totalRend * (p.essenciais  / 100) : 0;
  const alvoLaz  = totalRend > 0 ? totalRend * (p.lazer       / 100) : 0;
  const alvoPoup = totalRend > 0 ? totalRend * (p.poupanca    / 100) : 0;

  // ── ESSENCIAIS ────────────────────────────────────────────────────────────
  if (desvioEss > 10) {
    const excesso = valEss - alvoEss;
    const top = topCatDePilar('essenciais');
    const topTxt = top ? ` A categoria com mais peso é <strong>${top.cat}</strong> (${fmt(top.val)}).` : '';
    conselhos.push(`🏠 <strong>Essenciais ${desvioEss.toFixed(1)}% acima do objetivo</strong> — estás a gastar ${fmt(excesso)} a mais do que o alvo de ${fmt(alvoEss)}.${topTxt} Revê contratos de telecomunicações, seguros ou rendas — são os mais fáceis de renegociar.`);
  } else if (desvioEss > 5) {
    const excesso = valEss - alvoEss;
    const top = topCatDePilar('essenciais');
    const topTxt = top ? ` A categoria <strong>${top.cat}</strong> (${fmt(top.val)}) é a maior fatia.` : '';
    conselhos.push(`🏠 <strong>Essenciais ligeiramente acima</strong> — ${fmt(excesso)} a mais que o alvo.${topTxt} Verifica se há subscrições automáticas que já não usas.`);
  } else if (desvioEss < -5) {
    conselhos.push(`🏠 <strong>Essenciais abaixo do esperado</strong> — pode ser um mês atípico ou há despesas fixas ainda não classificadas. Confirma se todas as categorias estão bem atribuídas.`);
  } else {
    conselhos.push(`✅ <strong>Essenciais dentro do objetivo</strong> — ${fmt(valEss)} de ${fmt(alvoEss)} alvo. Bom controlo das despesas fixas.`);
  }

  // ── LAZER ─────────────────────────────────────────────────────────────────
  if (desvioLaz > 10) {
    const excesso = valLaz - alvoLaz;
    const top = topCatDePilar('lazer');
    const topTxt = top ? ` A maior despesa de lazer é <strong>${top.cat}</strong> com ${fmt(top.val)}.` : '';
    conselhos.push(`🎉 <strong>Lazer ${desvioLaz.toFixed(1)}% acima do objetivo</strong> — ${fmt(excesso)} acima do alvo de ${fmt(alvoLaz)}.${topTxt} Restauração e entretenimento são os mais fáceis de controlar no curto prazo.`);
  } else if (desvioLaz > 3 && desvioPoup < 0) {
    const mover = Math.min(valLaz - alvoLaz, alvoPoup - valPoup);
    conselhos.push(`🎉 <strong>Lazer ligeiramente alto</strong> — reduzir ${fmt(mover)} em lazer chegaria para atingir o objetivo de poupança. Pequenas reduções em restauração ou subscrições fazem a diferença.`);
  } else if (desvioLaz < -5) {
    conselhos.push(`🎉 <strong>Lazer abaixo do objetivo</strong> — estás a gastar menos do que planeado em lazer. Podes realocar essa margem (${fmt(alvoLaz - valLaz)}) para poupança.`);
  } else {
    conselhos.push(`✅ <strong>Lazer controlado</strong> — ${fmt(valLaz)} de ${fmt(alvoLaz)} alvo.`);
  }

  // ── POUPANÇA ──────────────────────────────────────────────────────────────
  if (desvioPoup < -15) {
    const emFalta = alvoPoup - valPoup;
    conselhos.push(`💰 <strong>Poupança muito abaixo do objetivo</strong> — faltam ${fmt(emFalta)} para atingir os ${p.poupanca}% (${fmt(alvoPoup)}). Experimenta a regra do "paga-te primeiro": logo no início do mês transfere ${fmt(alvoPoup)} para uma conta separada antes de qualquer outra despesa.`);
  } else if (desvioPoup < -5) {
    const emFalta = alvoPoup - valPoup;
    conselhos.push(`💰 <strong>Poupança abaixo do objetivo</strong> — faltam ${fmt(emFalta)}. Tenta poupar ${fmt(emFalta / 4)} por semana até ao fim do mês para compensar.`);
  } else if (desvioPoup >= 0) {
    conselhos.push(`💰 <strong>Poupança no objetivo ou acima</strong> — ${fmt(valPoup)} poupados (objetivo: ${fmt(alvoPoup)}). Excelente! Se ainda não tens investimentos automáticos, este é o momento certo para os configurar.`);
  } else {
    conselhos.push(`💰 <strong>Poupança perto do objetivo</strong> — ${fmt(valPoup)} de ${fmt(alvoPoup)} alvo. Quase lá — um pequeno ajuste no lazer chegaria.`);
  }

  // ── FLUXO GERAL ───────────────────────────────────────────────────────────
  const totalGasto = pcts.essenciais + pcts.lazer + pcts.poupanca;
  if (totalGasto > 105) {
    const deficit = (totalRend > 0 ? (totalGasto / 100 * totalRend) - totalRend : 0);
    conselhos.push(`⚠️ <strong>Gastos superiores ao rendimento</strong> — estás a gastar ${fmt(deficit)} acima do que recebes este mês. Prioridade imediata: identificar e cortar a categoria com mais desvio.`);
  }

  return conselhos;
}

// ─── Render diagnóstico ───────────────────────────────────────────────────────
function _renderDiagnostico() {
  const diagEl      = document.getElementById('objDiagnostico');
  const emptyEl     = document.getElementById('objEmpty');
  const rowsEl      = document.getElementById('objDiagRows');
  const conselhosEl = document.getElementById('objConselhos');
  const mesLabelEl  = document.getElementById('objMesLabel');

  if (!_perfilAtivo || !State.allData.length) {
    diagEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  // Dados filtrados pelo mês ativo (igual ao resto do dashboard)
  const data = State.activeTableMonth === 'all'
    ? State.allData
    : State.allData.filter(r => r.date.slice(0, 7) === State.activeTableMonth);

  if (!data.length) {
    diagEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  // Verificar se o utilizador tem pilares configurados
  const temPilares = State.PILARES.some(p => p.cats.length > 0);
  if (!temPilares) {
    diagEl.classList.add('hidden');
    emptyEl.innerHTML = '<p>Configura os <strong>Pilares financeiros</strong> para veres o diagnóstico.</p>';
    emptyEl.classList.remove('hidden');
    return;
  }

  diagEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  // Mês label
  const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  if (State.activeTableMonth === 'all') {
    mesLabelEl.textContent = 'Todos os meses carregados';
  } else {
    const [y, m] = State.activeTableMonth.split('-');
    mesLabelEl.textContent = nomeMes[parseInt(m) - 1] + ' ' + y;
  }

  const { totalRend, porPilar } = _calcularPilares(data);
  const perfil = PERFIS[_perfilAtivo];

  // Calcular % atuais
  const pcts = {
    essenciais: _pctAtual(porPilar, totalRend, 'essenciais'),
    lazer:      _pctAtual(porPilar, totalRend, 'lazer'),
    poupanca:   _pctAtual(porPilar, totalRend, 'poupanca')
  };

  // Definição dos 3 slots a mostrar
  const slots = [
    { id: 'essenciais', label: '🏠 Essenciais', alvo: perfil.essenciais, cor: '#185FA5' },
    { id: 'lazer',      label: '🎉 Lazer',      alvo: perfil.lazer,      cor: '#D85A30' },
    { id: 'poupanca',   label: '💰 Poupança',   alvo: perfil.poupanca,   cor: '#1D9E75' }
  ];

  const fmtVal = v => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  rowsEl.innerHTML = slots.map(slot => {
    const atual      = pcts[slot.id];
    const delta      = atual - slot.alvo;
    const ok         = Math.abs(delta) <= 3;
    const acima      = delta > 3;
    const dotCor     = ok ? '#1D9E75' : acima ? '#D85A30' : '#BA7517';
    const deltaTxt   = (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
    const deltaCor   = ok ? '#1D9E75' : acima ? '#D85A30' : '#BA7517';
    const barPct     = Math.min(atual, 100);
    const targetPct  = Math.min(slot.alvo, 100);

    // Valores em € do objetivo e do atual
    const alvoEur  = totalRend > 0 ? totalRend * (slot.alvo / 100) : 0;
    const atualEur = porPilar[slot.id] || 0;
    const difEur   = atualEur - alvoEur;
    const difTxt   = (difEur > 0 ? '+' : '') + fmtVal(Math.abs(difEur));
    const difLabel = difEur > 0.5 ? 'acima' : difEur < -0.5 ? 'abaixo' : 'no objetivo';

    return `<div class="obj-diag-row" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="obj-diag-dot" style="background:${dotCor};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div class="obj-diag-label">${slot.label}</div>
        </div>
        <div class="obj-diag-delta" style="color:${deltaCor};font-size:13px;">${deltaTxt}</div>
      </div>

      <!-- Linha de valores -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-left:19px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:2px;">Objetivo</div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:var(--text);">${fmtVal(alvoEur)}</div>
          <div style="font-size:10px;color:var(--muted);">${slot.alvo}% do rendimento</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:2px;">Atual</div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:${dotCor};">${fmtVal(atualEur)}</div>
          <div style="font-size:10px;color:var(--muted);">${atual.toFixed(1)}% do rendimento</div>
        </div>
        <div style="background:${ok ? '#f0faf5' : acima ? '#fff5f0' : '#fffbf0'};border:1px solid ${ok ? '#b8e8d4' : acima ? '#f5c4b0' : '#f0dfa0'};border-radius:8px;padding:7px 10px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:2px;">Diferença</div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;color:${deltaCor};">${difEur > 0.5 ? '+' : difEur < -0.5 ? '-' : ''}${fmtVal(Math.abs(difEur))}</div>
          <div style="font-size:10px;color:${deltaCor};">${difLabel}</div>
        </div>
      </div>

      <!-- Barra -->
      <div style="margin-left:19px;">
        <div class="obj-diag-bar-wrap" style="height:5px;">
          <div class="obj-diag-bar-atual" style="width:${barPct}%;background:${dotCor};"></div>
          <div class="obj-diag-bar-target" style="left:${targetPct}%;"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Conselhos
  const conselhos = _gerarConselhos(_perfilAtivo, pcts, data, porPilar, totalRend);
  conselhosEl.innerHTML = `
    <div class="obj-conselhos-box">
      <div class="obj-conselhos-title">💡 Conselhos</div>
      ${conselhos.map(c => `<div class="obj-conselho-item">${c}</div>`).join('')}
    </div>`;
}

// ─── Mostrar botão quando há dados ───────────────────────────────────────────
function _updateBotaoVisivel() {
  const btn = document.getElementById('objetivosBtn');
  if (!btn) return;
  btn.style.display = State.allData.length > 0 ? 'flex' : 'none';
}

// ─── API pública ──────────────────────────────────────────────────────────────
export function initObjetivos() {
  // Restaurar perfil guardado
  if (_perfilAtivo) {
    const btn = document.querySelector(`.obj-perfil-btn[data-perfil="${_perfilAtivo}"]`);
    if (btn) btn.classList.add('active');
  }
}

export function refreshObjetivos() {
  _updateBotaoVisivel();
  // Só re-render o diagnóstico se o drawer estiver aberto
  const drawer = document.getElementById('objetivosDrawer');
  if (drawer && drawer.classList.contains('open')) {
    _renderDiagnostico();
  }
}
