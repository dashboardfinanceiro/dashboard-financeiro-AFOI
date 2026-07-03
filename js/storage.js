// ─── Persistência: localStorage + Google Drive ────────────────────────────────
import * as State from './state.js';
import { autoCategory } from './categorize.js';

// ─── Google Auth ──────────────────────────────────────────────────────────────
const G_CLIENT_ID = '452856356047-sk5t1c6dpggssftgcm1sqrdrvd0fhiuq.apps.googleusercontent.com';
const DRIVE_FILE  = 'dashboard-financeiro-backup.json';

export let gAccessToken = null;
export let gDriveFileId = null;
let gSaveTimer = null;

export function setGAccessToken(val)  { gAccessToken = val; }
export function setGDriveFileId(val)  { gDriveFileId = val; }

// ─── localStorage ─────────────────────────────────────────────────────────────
export function save() {
  try {
    localStorage.setItem('finDash_v3', JSON.stringify({
      data: State.allData, meta: State.metaInfo, months: State.loadedMonths,
      rules: State.userRules, customCats: State.CUSTOM_CATS,
      deletedCats: State.DELETED_BASE_CATS, pilares: State.PILARES
    }));
  } catch(e) {}
  if (State.allData.length || State.userRules.length) {
    document.getElementById('savedPill').classList.remove('hidden');
  }
}

export function load() {
  if (gAccessToken) return false;
  try {
    const raw = localStorage.getItem('finDash_v3');
    if (raw) {
      const parsed = JSON.parse(raw);
      State.setAllData(parsed.data || []);
      State.setMetaInfo(parsed.meta || {});
      State.setLoadedMonths(parsed.months || []);
      if (parsed.rules) State.setUserRules(parsed.rules);
      if (parsed.customCats) {
        State.setCustomCats(parsed.customCats);
        State.CUSTOM_CATS.forEach(c => { if (!State.CATS.includes(c)) State.CATS.push(c); });
      }
      if (parsed.deletedCats) {
        State.setDeletedBaseCats(parsed.deletedCats);
        State.setCats(State.CATS.filter(c => !State.DELETED_BASE_CATS.includes(c)));
      }
      if (parsed.pilares) {
        parsed.pilares.forEach(sp => {
          const pil = State.PILARES.find(x => x.id === sp.id);
          if (pil) { pil.cats = sp.cats || []; pil.limite = sp.limite || 0; }
        });
      }
      if (!State.loadedMonths.length && State.allData.length) {
        const monthSet = {};
        State.allData.forEach(r => {
          const m = r.date.slice(0, 7);
          if (!monthSet[m]) monthSet[m] = 0;
          monthSet[m]++;
        });
        State.setLoadedMonths(Object.entries(monthSet).sort().map(([key, count]) => {
          const [y, mo] = key.split('-');
          const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];
          return { key, label: nomeMes + ' ' + y, count };
        }));
      }
      if (State.allData.length) {
        State.allData.forEach(r => {
          // migrar categorias eliminadas (ex: Restaurantes → Restauração)
          if (!State.CATS.includes(r.cat)) { r.cat = autoCategory(r.desc); r.manual = false; }
          else if (!r.manual) r.cat = autoCategory(r.desc);
        });
        return true;
      }
    }
  } catch(e) {}
  return false;
}

export function saveRules() {
  try {
    localStorage.setItem('finDash_rules', JSON.stringify(State.userRules));
    localStorage.setItem('finDash_customCats', JSON.stringify(State.CUSTOM_CATS));
    localStorage.setItem('finDash_deletedCats', JSON.stringify(State.DELETED_BASE_CATS));
    if (gAccessToken) scheduleDriveSave();
    const pill = document.getElementById('rulesSavedPill');
    if (pill) {
      pill.style.opacity = '1';
      clearTimeout(pill._t);
      pill._t = setTimeout(() => { pill.style.opacity = '0'; }, 2000);
    }
  } catch(e) {}
}

export function loadRules() {
  loadPilares();
  if (State.userRules.length || State.CUSTOM_CATS.length) return;
  if (gAccessToken) return;
  try {
    const raw = localStorage.getItem('finDash_rules');
    State.setUserRules(raw ? JSON.parse(raw) : []);
  } catch(e) { State.setUserRules([]); }
  try {
    const rawCats = localStorage.getItem('finDash_customCats');
    State.setCustomCats(rawCats ? JSON.parse(rawCats) : []);
    State.CUSTOM_CATS.forEach(c => { if (!State.CATS.includes(c)) State.CATS.push(c); });
  } catch(e) { State.setCustomCats([]); }
  try {
    const rawDel = localStorage.getItem('finDash_deletedCats');
    State.setDeletedBaseCats(rawDel ? JSON.parse(rawDel) : []);
    State.setCats(State.CATS.filter(c => !State.DELETED_BASE_CATS.includes(c)));
  } catch(e) { State.setDeletedBaseCats([]); }
}

export function savePilares() {
  try { localStorage.setItem('finDash_pilares', JSON.stringify(State.PILARES)); } catch(e) {}
  if (gAccessToken) scheduleDriveSave();
}

export function loadPilares() {
  try {
    const raw = localStorage.getItem('finDash_pilares');
    if (raw) {
      const saved = JSON.parse(raw);
      saved.forEach(sp => {
        const p = State.PILARES.find(x => x.id === sp.id);
        if (p) { p.nome = sp.nome; p.cats = sp.cats || []; p.limite = sp.limite || 0; }
      });
    }
  } catch(e) {}
}

export function saveBudget() {
  try {
    State.setBudgetRendimento(parseFloat(document.getElementById('budgetRendimento').value) || 0);
    const obj = { limits: State.budgetLimits, rendimento: State.budgetRendimento, strategy: State.activeStrategy };
    localStorage.setItem('finDash_budget', JSON.stringify(obj));
  } catch(e) {}
  if (gAccessToken) scheduleDriveSave();
}

export function loadBudget(fromObj) {
  try {
    const b = fromObj || JSON.parse(localStorage.getItem('finDash_budget') || 'null');
    if (b) {
      State.setBudgetLimits(b.limits || {});
      State.setBudgetRendimento(b.rendimento || 0);
      State.setActiveStrategy(b.strategy || 'custom');
    }
  } catch(e) {}
  try {
    const el = document.getElementById('budgetRendimento');
    if (el && State.budgetRendimento) el.value = State.budgetRendimento;
  } catch(e) {}
}

// ─── Google Drive ─────────────────────────────────────────────────────────────
export function buildPayload() {
  return {
    version: 'finDash_v1',
    savedAt: new Date().toISOString(),
    data: State.allData, meta: State.metaInfo, months: State.loadedMonths,
    rules: State.userRules, customCats: State.CUSTOM_CATS,
    deletedCats: State.DELETED_BASE_CATS, pilares: State.PILARES,
    budget: { limits: State.budgetLimits, rendimento: State.budgetRendimento, strategy: State.activeStrategy }
  };
}

export function restorePayload(p, uiCallbacks) {
  if (!p || !p.data) return;
  State.setAllData(p.data || []);
  State.setMetaInfo(p.meta || {});
  State.setLoadedMonths(p.months || []);
  State.setUserRules(p.rules || []);
  State.setCustomCats(p.customCats || []);
  State.CUSTOM_CATS.forEach(c => { if (!State.CATS.includes(c)) State.CATS.push(c); });
  if (p.deletedCats) {
    State.setDeletedBaseCats(p.deletedCats);
    State.setCats(State.CATS.filter(c => !State.DELETED_BASE_CATS.includes(c)));
  }
  if (p.pilares) {
    p.pilares.forEach(sp => {
      const pil = State.PILARES.find(x => x.id === sp.id);
      if (pil) { pil.cats = sp.cats||[]; pil.limite = sp.limite||0; if (sp.nome) pil.nome = sp.nome; }
    });
  }
  saveRules();
  if (p.budget) loadBudget(p.budget);
  else loadBudget();
  State.allData.forEach(r => {
    if (!State.CATS.includes(r.cat)) { r.cat = autoCategory(r.desc); r.manual = false; }
    else if (!r.manual) r.cat = autoCategory(r.desc);
  });
  save();
  // Callbacks de UI (injetados pelo app.js para evitar dependência circular)
  if (uiCallbacks) {
    if (uiCallbacks.refreshCatSelects) uiCallbacks.refreshCatSelects();
    if (uiCallbacks.renderRulesList)   uiCallbacks.renderRulesList();
    if (uiCallbacks.updateMonthsUI)    uiCallbacks.updateMonthsUI();
    if (uiCallbacks.showDash && State.allData.length) {
      uiCallbacks.showDash(State.allData.length + ' movimentos carregados', '', false);
    }
  }
}

export function setDrivePill(msg, color) {
  const el = document.getElementById('drivePill');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.color = color || '#fff';
}

export function scheduleDriveSave() {
  clearTimeout(gSaveTimer);
  gSaveTimer = setTimeout(driveSave, 3000);
}

export async function driveSave() {
  if (!gAccessToken) { save(); return; }
  setDrivePill('⟳ a guardar…');
  try {
    const payload = buildPayload();
    const body = JSON.stringify(payload);
    if (gDriveFileId) {
      const rPatch = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${gDriveFileId}?uploadType=media`,
        { method:'PATCH', headers:{ Authorization:`Bearer ${gAccessToken}`, 'Content-Type':'application/json' }, body }
      );
      if (!rPatch.ok) throw new Error('Drive patch failed: ' + rPatch.status);
    } else {
      const meta = JSON.stringify({ name: DRIVE_FILE, parents: ['appDataFolder'] });
      const form = new FormData();
      form.append('metadata', new Blob([meta], { type:'application/json' }));
      form.append('file', new Blob([body], { type:'application/json' }));
      const r = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method:'POST', headers:{ Authorization:`Bearer ${gAccessToken}` }, body:form }
      );
      if (!r.ok) throw new Error('Drive create failed: ' + r.status);
      const created = await r.json();
      if (!created.id) throw new Error('Drive create: sem ID no response');
      gDriveFileId = created.id;
    }
    save();
    setDrivePill('✓ guardado');
    setTimeout(() => setDrivePill(''), 2500);
  } catch(e) {
    console.error('Drive save:', e);
    setDrivePill('⚠ erro ao guardar', '#ffaa44');
    save();
  }
}

export async function driveLoad(uiCallbacks) {
  if (!gAccessToken) { load(); return; }
  setDrivePill('⟳ a carregar…');
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${DRIVE_FILE}%27&fields=files(id,modifiedTime)`,
      { headers: { Authorization: `Bearer ${gAccessToken}` } }
    );
    if (!r.ok) throw new Error('Drive list failed: ' + r.status);
    const d = await r.json();
    const files = d.files || [];
    if (!files.length) {
      setDrivePill('☁ conta nova', '#aaa');
      setTimeout(() => setDrivePill(''), 3000);
      return;
    }
    gDriveFileId = files[0].id;
    const r2 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${gDriveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${gAccessToken}` } }
    );
    if (!r2.ok) throw new Error('Drive read failed: ' + r2.status);
    const payload = await r2.json();
    restorePayload(payload, uiCallbacks);
    setDrivePill('✓ sincronizado');
    setTimeout(() => setDrivePill(''), 3000);
  } catch(e) {
    console.error('Drive load erro:', e);
    setDrivePill('⚠ erro ao carregar', '#ffaa44');
    if (!State.allData.length) load();
  }
}

export function exportData() {
  const blob = new Blob([JSON.stringify(buildPayload(),null,2)], {type:'application/json'});
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `dashboard-backup-${new Date().toISOString().slice(0,10)}.json`
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export function importData(input, uiCallbacks) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const p = JSON.parse(e.target.result);
      if (!p.version || !p.data) { alert('Ficheiro inválido.'); return; }
      restorePayload(p, uiCallbacks);
      if (gAccessToken) driveSave();
    } catch(err) { alert('Erro: ' + err.message); }
  };
  reader.readAsText(file);
  input.value = '';
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
export function initGoogleAuth(callbacks) {
  if (handleOAuthCallback(callbacks)) return;
  try {
    const saved = sessionStorage.getItem('gSession');
    if (saved) {
      const sess = JSON.parse(saved);
      if (sess.token && sess.savedAt && (Date.now() - sess.savedAt) < 55 * 60 * 1000) {
        gAccessToken = sess.token;
        try { localStorage.setItem('df_gtoken', sess.token); } catch(e) {}
        document.getElementById('gSigninOverlay').style.display = 'none';
        document.getElementById('gUserChip').classList.remove('hidden');
        document.getElementById('gUserAvatar').src = sess.picture || '';
        document.getElementById('gUserName').textContent = (sess.name || 'Utilizador').split(' ')[0];
        callbacks.onLogin();
        return;
      } else {
        sessionStorage.removeItem('gSession');
      }
    }
  } catch(e) {}
  callbacks.updateSessionUI();
  const btn = document.getElementById('gSigninBtn');
  btn.innerHTML = `<button onclick="window._startGoogleLogin()" style="display:flex;align-items:center;gap:10px;padding:11px 22px;border:1.5px solid #dadce0;border-radius:6px;background:#fff;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#3c4043;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
    Entrar com Google
  </button>`;
}

export function startGoogleLogin() {
  const redirect = 'https://dashboardfinanceiro.github.io/dashboard-financeiro-AFOI';
  const url = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(G_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&response_type=token' +
    '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email') +
    '&prompt=consent';
  window.location.href = url;
}

function handleOAuthCallback(callbacks) {
  const hash = window.location.hash;
  if (!hash.includes('access_token')) return false;
  const params = new URLSearchParams(hash.replace('#', ''));
  const token = params.get('access_token');
  if (!token) return false;
  history.replaceState(null, '', window.location.pathname);
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json()).then(profile => {
    gAccessToken = token;
    try {
      sessionStorage.setItem('gSession', JSON.stringify({
        token, savedAt: Date.now(),
        picture: profile.picture || '',
        name: profile.name || 'Utilizador'
      }));
      localStorage.setItem('df_gtoken', token);
    } catch(e) {}
    document.getElementById('gSigninOverlay').style.display = 'none';
    document.getElementById('gUserChip').classList.remove('hidden');
    document.getElementById('gUserAvatar').src = profile.picture || '';
    document.getElementById('gUserName').textContent = (profile.name || 'Utilizador').split(' ')[0];
    callbacks.onLogin();
  }).catch(() => {
    gAccessToken = token;
    try {
      sessionStorage.setItem('gSession', JSON.stringify({ token, savedAt: Date.now(), name: 'Utilizador', picture: '' }));
      localStorage.setItem('df_gtoken', token);
    } catch(e) {}
    document.getElementById('gSigninOverlay').style.display = 'none';
    document.getElementById('gUserChip').classList.remove('hidden');
    document.getElementById('gUserName').textContent = 'Utilizador';
    callbacks.onLogin();
  });
  return true;
}

export function gSignOut(callbacks) {
  if (!confirm('Tens a certeza que queres sair?')) return;
  try { sessionStorage.removeItem('gSession'); } catch(e) {}
  try { localStorage.removeItem('df_gtoken'); } catch(e) {}
  gAccessToken = null;
  gDriveFileId = null;
  callbacks.updateSessionUI();
  document.getElementById('gUserChip').classList.add('hidden');
  document.getElementById('gSigninOverlay').style.display = '';
  setDrivePill('');
  callbacks.doReset();
}

export function updateSessionUI() {
  const warn = document.getElementById('noSessionWarning');
  const btn  = document.getElementById('driveSaveBtn');
  if (warn) warn.style.display = gAccessToken ? 'none' : 'flex';
  if (btn)  btn.classList.toggle('hidden', !gAccessToken);
}

export async function forceDriveSave() {
  const btn = document.getElementById('driveSaveBtn');
  btn.textContent = '⟳ A guardar...';
  btn.disabled = true;
  await driveSave();
  btn.textContent = '✓ Guardado!';
  setTimeout(() => { btn.textContent = '💾 Guardar'; btn.disabled = false; }, 2000);
}
