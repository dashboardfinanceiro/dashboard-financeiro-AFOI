// ─── Estado Global ────────────────────────────────────────────────────────────
export let allData = [];
export let activeMonths = new Set();
export let activeTableMonth = 'all';
export let activeType = 'all';
export let activeSearch = '';
export let activeResumoMonth = 'all';
export let metaInfo = {};
export let loadedMonths = [];

export function setAllData(val)            { allData = val; }
export function setActiveTableMonth(val)   { activeTableMonth = val; }
export function setActiveType(val)         { activeType = val; }
export function setActiveSearch(val)       { activeSearch = val; }
export function setActiveResumoMonth(val)  { activeResumoMonth = val; }
export function setMetaInfo(val)           { metaInfo = val; }
export function setLoadedMonths(val)       { loadedMonths = val; }

// ─── Categorias ───────────────────────────────────────────────────────────────
export let CATS = ['Restauração','Supermercado','Transportes','Saúde','Estética','Telecomunicações','Seguros','Habitação','Lazer','Restaurantes','Rendimentos','Diversos'];
export let CUSTOM_CATS = [];
export let DELETED_BASE_CATS = [];
export const CAT_COLORS = ['#1D9E75','#185FA5','#BA7517','#D4537E','#b05ec4','#533AB7','#D85A30','#8a8680','#c8440a','#e8a87c','#7ec8e3','#f0a500','#2ecc71','#95a5a6'];

export function setCats(val)             { CATS = val; }
export function setCustomCats(val)       { CUSTOM_CATS = val; }
export function setDeletedBaseCats(val)  { DELETED_BASE_CATS = val; }

// ─── Pilares ──────────────────────────────────────────────────────────────────
export let PILARES = [
  { id: 'essenciais', nome: 'Essenciais', emoji: '🏠', color: '#185FA5', cats: [], limite: 0 },
  { id: 'lazer',      nome: 'Lazer',      emoji: '🎉', color: '#D85A30', cats: [], limite: 0 },
  { id: 'poupanca',   nome: 'Poupança & Investimento', emoji: '💰', color: '#1D9E75', cats: [], limite: 0 }
];
export let activePilarMonth = 'all';
export function setPilares(val)          { PILARES = val; }
export function setActivePilarMonth(val) { activePilarMonth = val; }

// ─── Regras ───────────────────────────────────────────────────────────────────
export let userRules = [];
export function setUserRules(val) { userRules = val; }

// ─── Budget ───────────────────────────────────────────────────────────────────
export let budgetLimits = {};
export let budgetRendimento = 0;
export let activeStrategy = 'custom';

export function setBudgetLimits(val)      { budgetLimits = val; }
export function setBudgetRendimento(val)  { budgetRendimento = val; }
export function setActiveStrategy(val)    { activeStrategy = val; }

export const STRATEGIES = {
  'custom': {
    label: 'Define livremente o limite de cada categoria.',
    groups: null
  },
  '503020': {
    label: '50% para necessidades (habitação, alimentação, saúde…) · 30% para desejos (lazer, restaurantes…) · 20% para poupança e investimento.',
    groups: { necessidades: 0.50, desejos: 0.30, poupanca: 0.20 }
  },
  '602020': {
    label: '60% para necessidades · 20% para desejos · 20% para poupança. Boa opção para rendimentos mais baixos ou cidades com custo alto.',
    groups: { necessidades: 0.60, desejos: 0.20, poupanca: 0.20 }
  },
  '702010': {
    label: '70% para necessidades · 20% para desejos · 10% para poupança. Adequado para quem está a começar ou tem despesas fixas elevadas.',
    groups: { necessidades: 0.70, desejos: 0.20, poupanca: 0.10 }
  },
  'zero': {
    label: 'Orçamento base zero — cada euro tem um destino. A soma dos limites deve igualar o rendimento.',
    groups: null
  }
};

export const CAT_PILAR = {
  'Habitação': 'necessidades',
  'Supermercado': 'necessidades',
  'Restauração': 'necessidades',
  'Saúde': 'necessidades',
  'Telecomunicações': 'necessidades',
  'Seguros': 'necessidades',
  'Transportes': 'necessidades',
  'Lazer': 'desejos',
  'Restaurantes': 'desejos',
  'Estética': 'desejos',
  'Poupança': 'poupanca',
  'Transferências': 'desejos',
  'Rendimentos': null,
  'Diversos': 'desejos',
};

// ─── Charts (instâncias) ──────────────────────────────────────────────────────
export let chartDona  = null;
export let chartBar   = null;
export let chartLine  = null;
export let chartPilares = null;
export let pilarChartMode = 'eur';

export function setChartDona(v)        { chartDona = v; }
export function setChartBar(v)         { chartBar = v; }
export function setChartLine(v)        { chartLine = v; }
export function setChartPilares(v)     { chartPilares = v; }
export function setPilarChartMode(v)   { pilarChartMode = v; }
