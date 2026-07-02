// ─── Categorização e Parser CSV ───────────────────────────────────────────────
import { CATS, CAT_COLORS, userRules } from './state.js';

export function applyRules(desc) {
  const d = desc.toUpperCase();
  for (const r of userRules) {
    if (d.includes(r.keyword.toUpperCase())) return r.cat;
  }
  return null;
}

export function autoCategory(desc, amount) {
  const userCat = applyRules(desc);
  if (userCat) return userCat;
  const d = desc.toUpperCase();
  if (/SALARIO|VENCIMENTO|ORDENADO|RENDIMENTO|PENSION/.test(d)) return 'Rendimentos';
  if (/CXDAPP|CONTA POUPAN/.test(d)) return 'Rendimentos';
  // Transferências, MB WAY e depósitos recebidos (valor positivo) contam como Rendimentos
  if (amount > 0 && /TRF |TFI |MBWAY|TRANSFERENCIA|DEPOSITO/.test(d)) return 'Rendimentos';
  if (/CONTINENTE|PINGO DOCE|INTERMARCHE|LIDL|ALDI|MERCADO|MINI PRECO|AUCHAN|CELEIRO|E-LECLERC|MINIPRECO/.test(d)) return 'Supermercado';
  if (/RESTAURANTE|CAFE|KFC|MCDONALDS|BURGUER|PIZZA|SUSHI|TASCA|PASTELARIA|HONEST GREENS|CAIS DO RIO|GULA|AUREA/.test(d)) return 'Restauração';
  if (/LASERUM|CABELEIREIRO|ESTETICA|ESTETICISTA|BEAUTY|BARBEIRO/.test(d)) return 'Estética';
  if (/FARMACIA|CLINICA|HOSPITAL|MEDIC|SAUDE|OPTICA|TERAPIA/.test(d)) return 'Saúde';
  if (/VODAFONE|NOS |MEO|NOWO|TELECOM|INTERNET|TV /.test(d)) return 'Telecomunicações';
  if (/SEGURO|FIDELIDADE|OCIDENTAL|TRANQUILIDADE|ALLIANZ/.test(d)) return 'Seguros';
  if (/RENDA|CONDOMINIO|AGUA|LUZ|GAS|EDP|ENDESA|GALP|ADA |AGUAS/.test(d)) return 'Habitação';
  if (/UBER|BOLT|CP |METRO|CARRIS|GASOLINA|PARQUE|TOLL|VIA VERDE/.test(d)) return 'Transportes';
  if (/TRF |TFI |MBWAY|TRANSFERENCIA/.test(d)) return 'Diversos';
  if (/NETFLIX|SPOTIFY|AMAZON|STEAM|CINEMA|TEATRO/.test(d)) return 'Lazer';
  if (/COMPRAS|CASA BA|AVOLTA|EASYPAY/.test(d)) return 'Restauração';
  return 'Diversos';
}

export function normalizeCat(catBanco) {
  const c = catBanco.trim().toUpperCase();
  if (c.includes('COMPRA') || c === 'COMPRAS') return 'Restauração';
  if (c.includes('SEGURO')) return 'Seguros';
  if (c.includes('TELE') || c.includes('TV') || c.includes('INTERNET')) return 'Telecomunicações';
  if (CATS.map(x => x.toUpperCase()).includes(c)) return CATS[CATS.map(x => x.toUpperCase()).indexOf(c)];
  return 'Diversos';
}

export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  let localMeta = {};

  let headerIdx = -1;
  let isBankFormat = false;

  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('data mov') || l.includes('débito') || l.includes('debito') || l.includes('crédito') || l.includes('credito')) {
      headerIdx = i;
      isBankFormat = true;
      break;
    }
    if (l.includes('conta') || l.includes('iban')) {
      const parts = lines[i].split(';').map(p => p.trim());
      if (parts.length >= 2) localMeta.conta = parts[1];
    }
    if (l.includes('data de in') || l.includes('início') || l.includes('inicio')) {
      const parts = lines[i].split(';').map(p => p.trim());
      if (parts.length >= 2) localMeta.dataInicio = parts[1];
    }
    if (l.includes('data de fim')) {
      const parts = lines[i].split(';').map(p => p.trim());
      if (parts.length >= 2) localMeta.dataFim = parts[1];
    }
  }

  if (isBankFormat && headerIdx >= 0) {
    const headerLine = lines[headerIdx];
    const headers = headerLine.split(';').map(h => h.trim().toLowerCase()
      .replace(/[àáâãä]/g,'a').replace(/[éêè]/g,'e').replace(/[íî]/g,'i')
      .replace(/[óôõö]/g,'o').replace(/[úûü]/g,'u'));

    const iDataMov = headers.findIndex(h => h.includes('data mov'));
    const iDesc    = headers.findIndex(h => h.includes('descri'));
    const iDeb     = headers.findIndex(h => h.includes('debito') || h.includes('débito'));
    const iCred    = headers.findIndex(h => h.includes('credito') || h.includes('crédito'));
    const iCat     = headers.findIndex(h => h.includes('categoria') || h.includes('cat'));

    const colDataMov = iDataMov >= 0 ? iDataMov : 0;
    const colDesc    = iDesc >= 0 ? iDesc : 2;
    const colDeb     = iDeb >= 0 ? iDeb : 3;
    const colCred    = iCred >= 0 ? iCred : 4;
    const colCat     = iCat >= 0 ? iCat : 7;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(';').map(p => p.trim().replace(/^\"|\"$/g, ''));

      const rawDate  = parts[colDataMov] || '';
      const desc     = parts[colDesc] || '';
      const debStr   = parts[colDeb] || '';
      const credStr  = parts[colCred] || '';
      const catBanco = parts[colCat] || '';

      if (!rawDate.match(/\d{2}[\-\/]\d{2}[\-\/]\d{4}/)) {
        if (line.toLowerCase().includes('saldo contabilistico') || line.toLowerCase().includes('saldo contabilístico')) {
          const saldoMatch = line.match(/([\d\.\,]+)\s*EUR/i);
          if (saldoMatch) localMeta.saldoFinal = saldoMatch[1];
        }
        continue;
      }

      const dp = rawDate.split(/[\-\/]/);
      const dateISO = dp[2] + '-' + dp[1] + '-' + dp[0];
      const parseNum = s => parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')) || 0;
      const deb  = parseNum(debStr);
      const cred = parseNum(credStr);
      let amount = 0;
      if (cred > 0) amount = cred;
      else if (deb > 0) amount = -deb;
      else continue;
      if (!desc) continue;

      const userCat = applyRules(desc);
      let cat;
      const isIncomingTransfer = amount > 0 && /TRF |TFI |MBWAY|TRANSFERENCIA|DEPOSITO/.test(desc.toUpperCase());
      if (userCat) {
        cat = userCat;
      } else if (isIncomingTransfer) {
        cat = 'Rendimentos';
      } else if (catBanco && catBanco.toLowerCase() !== 'diversos' && catBanco !== '') {
        cat = normalizeCat(catBanco);
      } else {
        cat = autoCategory(desc, amount);
      }
      rows.push({ date: dateISO, desc: desc.trim(), amount, cat });
    }

  } else {
    const sep = lines[0].includes(';') ? ';' : ',';
    const start = /data|date|dia/i.test(lines[0]) ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) continue;
      const date   = parts[0];
      const desc   = parts[1];
      const amount = parseFloat(parts[2].replace(',', '.').replace(/[^\d.\-]/g, ''));
      if (!isNaN(amount) && date.match(/\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) {
        let d = date;
        if (date.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) {
          const p = date.split(/[\/\-]/);
          d = p[2] + '-' + p[1] + '-' + p[0];
        }
        rows.push({ date: d, desc, amount, cat: autoCategory(desc, amount) });
      }
    }
  }

  return { rows, isBankFormat, meta: localMeta };
}

export function fmt(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + ' €';
}

export function fmtAbs(v) {
  return Math.abs(v).toFixed(2).replace('.', ',') + ' €';
}
