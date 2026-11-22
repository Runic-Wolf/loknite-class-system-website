const __desktopCards = new Map();
let __desktopOfficialRefs = {};
let __desktopOfficialUnityMedia = [];
let __desktopOfficialAssets = new Map();
let __desktopEquipmentAssets = new Map();
let __desktopTierRoleAssets = new Map();
let __desktopOfficialCardLayouts = new Map();
let __desktopOfficialClassMechanicLayouts = new Map();
let __desktopOfficialAssetIds = new Set();
const __desktopOfficialAssetRequests = new Map();
let __desktopSaveQueue = Promise.resolve();
let __desktopSaveError = null;
let __desktopRecovery = null;
let __desktopCloseUnsubscribe = null;

const __desktopTagFamilyOrder = ['tier', 'roles', 'elements', 'stats', 'armor', 'melee', 'ranged', 'other'];
const __desktopOrderedTagGroups = __desktopTagFamilyOrder.map(id => groupDefs.find(group => group.id === id)).filter(Boolean);
const __desktopRemainingTagGroups = groupDefs.filter(group => !__desktopTagFamilyOrder.includes(group.id));
groupDefs.splice(0, groupDefs.length, ...__desktopOrderedTagGroups, ...__desktopRemainingTagGroups);

const __desktopCardVisualBounds = Object.freeze({
  nameFontSize: [8, 32, 17],
  typeFontSize: [4, 24, 6],
  elementFontSize: [4, 24, 6],
  ruleFontSize: [4, 32, 10],
  flavourFontSize: [4, 32, 7],
  ruleTextOffsetY: [-50, 50, 0],
  flavourTextOffsetY: [-50, 50, 0]
});
function __desktopCardVisualValue(card, key) {
  const [min, max, fallback] = __desktopCardVisualBounds[key];
  const value = card?.[key];
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

const __desktopOriginalNormalize = ensureNormalized;
ensureNormalized = function (raw) {
  const normalized = __desktopOriginalNormalize(raw);
  normalized.preferences = raw?.preferences && typeof raw.preferences === 'object' && !Array.isArray(raw.preferences) ? { ...raw.preferences } : {};
  normalized.keywords = Array.isArray(raw?.keywords) ? raw.keywords.map(keyword => ({ ...keyword })) : [];
  return normalized;
};

function __desktopCardFields(card) {
  return {
    name: String(card?.name || ''),
    type: typeof card?.type === 'string' ? card.type : 'Skill',
    element: typeof card?.element === 'string' ? card.element : 'Neutral',
    workflowStatus: ['draft', 'review', 'completed', 'audited'].includes(card?.workflowStatus) ? card.workflowStatus : 'draft',
    cost: String(card?.cost ?? '1'),
    nameFontSize: __desktopCardVisualValue(card, 'nameFontSize'),
    typeFontSize: __desktopCardVisualValue(card, 'typeFontSize'),
    elementFontSize: __desktopCardVisualValue(card, 'elementFontSize'),
    ruleText: String(card?.ruleText || ''),
    flavourText: String(card?.flavourText || ''),
    ruleFontSize: __desktopCardVisualValue(card, 'ruleFontSize'),
    flavourFontSize: __desktopCardVisualValue(card, 'flavourFontSize'),
    ruleTextOffsetY: __desktopCardVisualValue(card, 'ruleTextOffsetY'),
    flavourTextOffsetY: __desktopCardVisualValue(card, 'flavourTextOffsetY'),
    tags: Array.isArray(card?.tags) ? [...card.tags] : [],
    artPath: card?.artPath ?? card?.art ?? null
  };
}

function __desktopClassView(cls) {
  if (!cls) return cls;
  const originalImage = Object.getOwnPropertyDescriptor(cls, 'image');
  if (cls.imagePath == null && originalImage && Object.prototype.hasOwnProperty.call(originalImage, 'value') && typeof originalImage.value === 'string') {
    cls.imagePath = originalImage.value || null;
  }
  delete cls.image;
  Object.defineProperty(cls, 'image', {
    enumerable: false,
    configurable: true,
    get() { return this.imagePath || officialIcon(this) || ''; },
    set(value) { this.imagePath = value || null; }
  });
  return cls;
}

function __desktopCardView(card) {
  if (!card) return null;
  if (Object.getOwnPropertyDescriptor(card, 'art')?.get) return card;
  if (card.artPath == null && typeof card.art === 'string') card.artPath = card.art || null;
  delete card.art;
  Object.defineProperty(card, 'art', {
    enumerable: false,
    configurable: true,
    get() { return this.artPath || ''; },
    set(value) { this.artPath = value || null; }
  });
  return card;
}

function __desktopBindCard(owner, cardId, legacyCard) {
  let card = __desktopCards.get(cardId);
  if (!card) {
    card = {
      id: cardId,
      category: owner.classId ? 'class' : (owner.category || 'class'),
      slot: Number.isInteger(owner.slot) ? owner.slot : (owner.classId ? Math.max(0, data.classes.filter(entry => entry.tier === 'C1').findIndex(entry => entry.id === rootOf(owner.classId)?.id)) : 0),
      status: 'RASCUNHO',
      source: owner.classId
        ? { kind: 'skill', skillId: owner.id, classId: owner.classId, rootClassId: rootOf(owner.classId)?.id || null }
        : { kind: 'independent', skillId: null },
      ...__desktopCardFields(legacyCard),
      tags: Array.isArray(legacyCard?.tags) ? [...legacyCard.tags] : (owner.classId ? [...(owner.tags || [])] : []),
      confirmedAt: null,
      confirmedRevision: null,
      confirmedGameplayHash: null,
      divergence: { hasPendingSourceChanges: false, fields: [] }
    };
    __desktopCards.set(cardId, card);
  } else if (card.status !== 'CONFIRMADO' && legacyCard && legacyCard !== card) {
    Object.assign(card, __desktopCardFields(legacyCard));
  }
  __desktopCardView(card);
  Object.defineProperty(owner, 'card', {
    enumerable: false,
    configurable: true,
    get() { return __desktopCards.get(cardId); },
    set(value) {
      const current = __desktopCards.get(cardId);
      if (current && current.status === 'CONFIRMADO') return;
      if (current && value && typeof value === 'object') Object.assign(current, __desktopCardFields(value));
    }
  });
  return card;
}

function __desktopCardToLegacy(card) {
  const fields = __desktopCardFields(card);
  return {
    name: fields.name,
    type: fields.type,
    element: fields.element,
    workflowStatus: fields.workflowStatus,
    cost: fields.cost,
    nameFontSize: fields.nameFontSize,
    typeFontSize: fields.typeFontSize,
    elementFontSize: fields.elementFontSize,
    ruleText: fields.ruleText,
    flavourText: fields.flavourText,
    ruleFontSize: fields.ruleFontSize,
    flavourFontSize: fields.flavourFontSize,
    ruleTextOffsetY: fields.ruleTextOffsetY,
    flavourTextOffsetY: fields.flavourTextOffsetY,
    tags: fields.tags,
    art: fields.artPath || ''
  };
}

function __desktopCanonicalize() {
  for (const cls of data.classes || []) __desktopClassView(cls);
  for (const skill of data.skills || []) {
    if (!skill.cardId) skill.cardId = 'card-' + crypto.randomUUID();
    const card = __desktopBindCard(skill, skill.cardId, skill.card);
    card.source = { kind: 'skill', skillId: skill.id, classId: skill.classId, rootClassId: rootOf(skill.classId)?.id || null };
    const root = rootOf(skill.classId);
    if (card.status !== 'CONFIRMADO') card.slot = Math.max(0, data.classes.filter(entry => entry.tier === 'C1').findIndex(entry => entry.id === root?.id));
  }
  for (const gallery of data.galleryCards || []) {
    if (!gallery.id) gallery.id = 'card-' + crypto.randomUUID();
    __desktopBindCard(gallery, gallery.id, gallery.card);
  }
}

newClass = function () { toast('A árvore possui 315 slots fixos; não é possível criar classes.'); };

const __desktopBrandImage = document.querySelector('#brand img');
if (__desktopBrandImage) {
  __desktopBrandImage.src = 'lcs-app://app/branding/LCS.png';
  __desktopBrandImage.alt = 'Logo Lok’nite Class System';
}
if (lcsDesktop.mode.nativeChrome) {
  const reserve = document.createElement('style');
  reserve.id = 'desktopNativeChromeReserve';
  reserve.textContent = '#header{padding-right:calc(140px + 2px * var(--S))!important}';
  document.head.append(reserve);
}

function __desktopLegacySnapshot() {
  __desktopCanonicalize();
  const legacy = JSON.parse(JSON.stringify(data));
  legacy.schemaVersion = 3;
  legacy.classes = data.classes.map(cls => ({ ...JSON.parse(JSON.stringify(cls)), imagePath: cls.imagePath || null, image: cls.imagePath || '' }));
  legacy.skills = data.skills.map(skill => ({
    ...JSON.parse(JSON.stringify(skill)),
    cardId: skill.cardId,
    card: __desktopCardToLegacy(skill.card)
  }));
  legacy.galleryCards = (data.galleryCards || []).filter(gallery => !gallery.__desktopGuidedPending).map(gallery => ({
    ...JSON.parse(JSON.stringify(gallery)),
    id: gallery.id,
    card: __desktopCardToLegacy(gallery.card)
  }));
  legacy.preferences = { ...(data.preferences || {}), officialC1Palette: __desktopOfficialRefs, unityMedia: __desktopUnityMediaList(data.preferences?.unityMedia) };
  return legacy;
}

function __desktopUnityMediaList(existing) {
  const bySource = new Map((Array.isArray(existing) ? existing : []).filter(item => item?.sourcePath && !__desktopOfficialUnityMedia.some(official => official.sourcePath === item.sourcePath)).map(item => [item.sourcePath, item]));
  for (const item of __desktopOfficialUnityMedia) bySource.set(item.sourcePath, item);
  return [...bySource.values()];
}

function __desktopUnityMatches(value) {
  if (!Array.isArray(value)) return false;
  const bySource = new Map(value.map(item => [item.sourcePath, item]));
  return __desktopOfficialUnityMedia.every(item => {
    const found = bySource.get(item.sourcePath);
    return found?.sourceSha256 === item.sourceSha256 && found?.pngPath === item.pngPath && found?.pngSha256 === item.pngSha256;
  });
}

function __desktopApplyOfficialPalette() {
  for (const [classId, refs] of Object.entries(__desktopOfficialRefs)) {
    const palette = OFFICIAL_C1_PALETTE[classId];
    if (!palette || !refs?.bgPath || !refs?.iconPath) throw new Error('Asset oficial C1 ausente: ' + classId);
    palette.bg = refs.bgPath;
    palette.icon = refs.iconPath;
  }
}

function __desktopPaletteMatches(value) {
  const ids = Object.keys(__desktopOfficialRefs);
  return ids.length === 15 && ids.every(id => value?.[id]?.bgPath === __desktopOfficialRefs[id].bgPath && value?.[id]?.iconPath === __desktopOfficialRefs[id].iconPath);
}

function __desktopInstall(result) {
  if (!result || !result.legacy || !result.cardvault || !Array.isArray(result.cardvault.cards)) {
    throw new Error('Resposta do Vault incompleta; a tela não foi inicializada.');
  }
  data = ensureNormalized(result.legacy);
  for (const cls of data.classes || []) __desktopClassView(cls);
  __desktopCards.clear();
  for (const card of result.cardvault.cards) __desktopCards.set(card.id, __desktopCardView(card));
  for (const skill of data.skills || []) {
    if (!skill.cardId) throw new Error('Skill sem cardId na projeção do Vault: ' + skill.id);
    const card = result.cardvault.cards.find(item => item.id === skill.cardId);
    if (!card) throw new Error('Carta vinculada ausente: ' + skill.cardId);
    __desktopBindCard(skill, skill.cardId, card);
  }
  for (const gallery of data.galleryCards || []) {
    const cardId = gallery.id;
    const card = result.cardvault.cards.find(item => item.id === cardId);
    if (!card) throw new Error('Carta independente ausente: ' + cardId);
    __desktopBindCard(gallery, cardId, card);
  }
  return result;
}

function __desktopApplyUiDefaults() {
  const preferences = data.preferences || {};
  const dbOptions = new Set(['name', 'tier', 'parent', 'concept', 'skills', 'tags', 'favorite', 'notes']);
  const skillOptions = new Set(['name', 'kind', 'owner', 'tier', 'tags', 'cost', 'element', 'notes']);
  if (Array.isArray(preferences.dbColumns)) state.dbColumns = [...new Set(preferences.dbColumns.filter(item => dbOptions.has(item)))];
  if (Array.isArray(preferences.skillColumns)) state.skillColumns = [...new Set(preferences.skillColumns.filter(item => skillOptions.has(item)))];
  if (!state.dbColumns.includes('name')) state.dbColumns.unshift('name');
  if (!state.skillColumns.includes('name')) state.skillColumns.unshift('name');
  if (typeof preferences.effectsOn === 'boolean') effectsOn = preferences.effectsOn;
  const first = data.classes.find(entry => entry.tier === 'C1');
  const preferred = data.classes.find(entry => entry.id === 'base_5' && entry.tier === 'C1') || first;
  if (preferred) {
    state.rootId = preferred.id;
    state.selected = new Set([preferred.id]);
    state.focusId = preferred.id;
    state.focusType = 'class';
  }
  for (const id of ['traits', 'custom']) {
    const group = groupDefs.find(item => item.id === id);
    if (group) group.tags = (data.customGroups?.[id] || []).slice(0, 10);
  }
}

function __desktopShowError(title, message) {
  const box = document.createElement('section');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;inset:24px;z-index:99999;padding:24px;background:#0b202d;color:#e0edf3;border:2px solid #d8b354;font:14px Arial,sans-serif;overflow:auto';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const detail = document.createElement('pre');
  detail.style.cssText = 'white-space:pre-wrap;color:#f2b7a8';
  detail.textContent = message;
  box.append(heading, detail);
  document.body.append(box);
}

function __desktopShowRecovery(result) {
  __desktopRecovery = result;
  const backups = Array.isArray(result.backups) ? result.backups : [];
  const mediaWarning = result.officialMediaError ? '<p style="color:#f2b7a8">A paleta oficial não foi preparada: ' + escapeHtml(result.officialMediaError) + '</p>' : '';
  const choices = backups.map(item => item.valid
    ? '<button class="btn" data-desktop-recover="' + escapeHtml(item.id) + '">Recuperar revisão ' + escapeHtml(item.revision ?? '?') + ' · ' + escapeHtml(item.id) + '</button>'
    : '<p class="ghostline">Backup inválido ' + escapeHtml(item.id || '') + ': ' + escapeHtml(item.error || 'sem detalhes') + '</p>').join('');
  document.querySelector('#desktopRecovery')?.remove();
  const overlay = document.createElement('main');
  overlay.id = 'desktopRecovery';
  overlay.setAttribute('role', 'alert');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;padding:32px;background:#08141d;color:#e0edf3;font:14px Arial,sans-serif;overflow:auto';
  overlay.innerHTML = '<h1 style="color:#d8b354">RECUPERAÇÃO DO VAULT</h1><p>O par de arquivos do Vault não pôde ser aberto. Nenhuma demonstração foi carregada ou gravada.</p><pre style="white-space:pre-wrap;color:#f2b7a8">' + escapeHtml(result.error || 'Erro sem detalhes.') + '</pre>' + mediaWarning + '<div class="row wrap">' + (choices || '<p>Não há backups recuperáveis.</p>') + '</div>';
  document.body.append(overlay);
}

function __desktopMarkSaved(result, revision) {
  __desktopSaveError = null;
  markSaved('Salvo no Vault · revisão ' + String(result?.vault?.revision ?? revision ?? '—'));
}

function __desktopApplyCommit(result) {
  for (const saved of result?.cardvault?.cards || []) {
    const current = __desktopCards.get(saved.id);
    if (current) Object.assign(current, saved);
    else __desktopCards.set(saved.id, __desktopCardView(saved));
  }
}

let __desktopPersistedRevision = 0;
let __desktopQaPersistenceSuspended = false;

function __desktopScheduleUiPreferenceCommit(force = false) {
  const next = { ...(data.preferences || {}), dbColumns: [...state.dbColumns], skillColumns: [...state.skillColumns], effectsOn: Boolean(effectsOn) };
  if (!force && JSON.stringify(next) === JSON.stringify(data.preferences || {})) return;
  data.preferences = next;
  saveRevision++;
  markSaved('Preferências pendentes');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { __desktopPersistNow().catch(() => {}); }, 150);
}

function __desktopPersistNow() {
  clearTimeout(saveTimer);
  if (lcsDesktop.mode.qa && __desktopQaPersistenceSuspended) return Promise.resolve(null);
  const revision = saveRevision;
  const payload = __desktopLegacySnapshot();
  const operation = __desktopSaveQueue.then(() => lcsDesktop.vault.saveLegacy(payload));
  const committed = operation.then(result => {
    if (revision === saveRevision) {
      __desktopApplyCommit(result);
      __desktopPersistedRevision = revision;
      __desktopMarkSaved(result, revision);
    }
    return result;
  }).catch(async error => {
    __desktopSaveError = error;
    let restored = false;
    let restoreError = null;
    if (revision === saveRevision && !lcsDesktop.vault.hasConflict?.()) {
      try {
        const current = await lcsDesktop.vault.load();
        if (revision === saveRevision && current.state === 'ready') {
          clearTimeout(saveTimer);
          __desktopInstall(current);
          __desktopApplyOfficialPalette();
          __desktopApplyUiDefaults();
          saveRevision = __desktopPersistedRevision;
          undoStack = []; redoStack = []; historyBaseline = snapshot();
          closeModal(); render(); drawEffects();
          __desktopMarkSaved(current, current.vault?.revision);
          toast('Alteração recusada; estado local restaurado do último commit do Vault.');
          restored = true;
        } else if (current.state !== 'ready') {
          restoreError = new Error(`Vault não está pronto para rollback: ${current.state}.`);
        }
      } catch (loadError) { restoreError = loadError; }
    }
    if (!restored) {
      __desktopSaveError = error;
      markSaved('ERRO AO SALVAR NO VAULT');
      const detail = [error?.message || error, restoreError?.message].filter(Boolean).join(' · rollback: ');
      toast('Erro ao salvar: ' + detail);
    }
    throw error;
  });
  __desktopSaveQueue = committed.catch(() => {});
  return committed;
}

function __desktopFlush() {
  clearTimeout(saveTimer);
  if (saveRevision <= __desktopPersistedRevision && !__desktopSaveError) return Promise.resolve();
  return __desktopPersistNow();
}

function __desktopLockConfirmedCard(card, container) {
  if (!card || card.status !== 'CONFIRMADO' || !container) return;
  container.querySelectorAll('[data-card], [data-gallery-edit], #cardArt, #galleryArtUpload').forEach(control => {
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
    control.title = 'Desconfirme a carta para editar os campos aprovados.';
  });
  container.querySelectorAll('label[for="cardArt"], label[for="galleryArtUpload"]').forEach(label => {
    label.setAttribute('aria-disabled', 'true');
    label.title = 'Desconfirme a carta para trocar a arte.';
  });
  container.querySelectorAll('[data-action="gallery-delete"]').forEach(button => {
    button.disabled = true;
    button.title = 'Desconfirme a carta antes de removê-la.';
  });
}

function __desktopSetEditorialStatus(cardId, confirmCard) {
  if (__desktopEditorialCommitInFlight) return toast('A ação editorial anterior ainda está sendo salva.');
  const card = __desktopCards.get(cardId);
  if (!card) return toast('Carta não encontrada no estado atual.');
  const pending = { cardId, confirmCard };
  __desktopPendingEditorial = pending;
  const action = confirmCard ? 'publicar como CONFIRMADO' : 'retornar para RASCUNHO e retirar da exportação Unity';
  modal(confirmCard ? 'Confirmar carta' : 'Desconfirmar carta', '<div class="note">Deseja ' + action + ' “' + escapeHtml(card.name || card.id) + '”? Esta decisão editorial é explícita e não entra em Ctrl+Z.</div><p class="ghostline">' + escapeHtml(card.id) + '</p>', confirmCard ? 'CONFIRMAR VERSÃO' : 'DESCONFIRMAR');
  const form = document.querySelector('#modalForm');
  form?.setAttribute('data-desktop-editorial', 'true');
  form?.setAttribute('data-desktop-editorial-card-id', cardId);
  form?.setAttribute('data-desktop-editorial-action', confirmCard ? 'confirm' : 'unconfirm');
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  Promise.resolve().then(() => __desktopFlush()).then(() => {
    const activeForm = document.querySelector('#modalForm[data-desktop-editorial="true"]');
    const activeSubmit = activeForm?.querySelector('button[type="submit"]');
    if (__desktopPendingEditorial === pending
      && activeForm?.dataset.desktopEditorialCardId === cardId
      && activeForm?.dataset.desktopEditorialAction === (confirmCard ? 'confirm' : 'unconfirm')
      && activeSubmit) activeSubmit.disabled = false;
  }).catch(() => {
    if (__desktopPendingEditorial === pending) {
      __desktopPendingEditorial = null;
      if (form?.isConnected) closeModal();
    }
  });
}

function __desktopSelectedEditorialCard() {
  if (state.tab === 'gallery') return getGallerySelection()?.card || null;
  return state.focusType === 'skill' ? getSkill(state.focusId)?.card || null : null;
}

const __desktopOriginalUpdatePalette = updatePalette;
updatePalette = function () {
  __desktopOriginalUpdatePalette();
  const query = String(document.querySelector('#paletteQuery')?.value || '').trim().toLowerCase();
  const card = __desktopSelectedEditorialCard();
  const results = document.querySelector('#paletteResults');
  if (!query || !results) return;

  const candidates = [];
  if (state.tab === 'database') {
    candidates.push({ id: 'a:desktop-new-skill', label: 'Criar skill', sub: 'Database · Comando' });
  }
  if (card) {
    candidates.push(
      { id: 'a:desktop-status', label: 'Status da carta', sub: (card.name || card.id) + ' · ' + card.status },
      {
        id: card.status === 'CONFIRMADO' ? 'a:desktop-unconfirm' : 'a:desktop-confirm',
        label: card.status === 'CONFIRMADO' ? 'Desconfirmar carta' : 'Confirmar carta',
        sub: 'Ação editorial explícita · ' + (card.name || card.id)
      }
    );
  }
  const matching = candidates.filter(item => (item.label + ' ' + item.sub).toLowerCase().includes(query));
  if (!matching.length) return;

  results.querySelector('.pal-empty')?.remove();
  for (const item of matching) {
    const index = results.querySelectorAll('[data-palette-index]').length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-row' + (index === 0 ? ' on' : '');
    button.dataset.paletteIndex = String(index);
    button.dataset.paletteId = item.id;
    const glyph = document.createElement('span');
    glyph.className = 'pal-glyph';
    glyph.textContent = '⌘';
    const copy = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = item.label;
    const subtitle = document.createElement('small');
    subtitle.textContent = item.sub;
    copy.append(title, subtitle);
    const arrow = document.createElement('span');
    arrow.className = 'pal-arrow';
    arrow.textContent = '↵';
    button.append(glyph, copy, arrow);
    results.append(button);
  }
};

let __desktopLastPaletteAction = null;
const __desktopOriginalPaletteRun = paletteRun;
paletteRun = function (id) {
  __desktopLastPaletteAction = id;
  if (id === 'a:desktop-new-skill') {
    if (state.tab === 'database') newSkill();
    else toast('Criar skill pela Palette está disponível no Database.');
    return;
  }
  if (id === 'a:desktop-status') {
    const card = __desktopSelectedEditorialCard();
    closeModal();
    if (card) toast('Carta ' + (card.name || card.id) + ' · ' + card.status);
    return;
  }
  if (id === 'a:desktop-confirm' || id === 'a:desktop-unconfirm') {
    const card = __desktopSelectedEditorialCard();
    if (card) __desktopSetEditorialStatus(card.id, id === 'a:desktop-confirm');
    return;
  }
  __desktopOriginalPaletteRun(id);
};

async function __desktopCommitEditorialStatus() {
  const pending = __desktopPendingEditorial;
  if (!pending || __desktopEditorialCommitInFlight) return;
  const editorialForm = document.querySelector('#modalForm[data-desktop-editorial="true"]');
  __desktopEditorialCommitInFlight = true;
  try {
    const result = pending.confirmCard ? await lcsDesktop.vault.confirm(pending.cardId) : await lcsDesktop.vault.unconfirm(pending.cardId);
    if (__desktopPendingEditorial === pending) __desktopPendingEditorial = null;
    __desktopInstall(result);
    __desktopPersistedRevision = saveRevision;
    __desktopMarkSaved(result, result.vault?.revision);
    if (document.querySelector('#modalForm[data-desktop-editorial="true"]') === editorialForm) closeModal();
    render();
  } catch (error) {
    __desktopSaveError = error;
    markSaved('ERRO AO SALVAR NO VAULT');
    toast('Ação editorial recusada: ' + String(error?.message || error));
  } finally {
    __desktopEditorialCommitInFlight = false;
  }
}

let __desktopPendingEditorial = null;
let __desktopEditorialCommitInFlight = false;
let __desktopPendingDelete = null;
let __desktopPendingCardDelete = null;
let __desktopCardDeleteCommitInFlight = false;

const __desktopOriginalCloseModal = closeModal;
closeModal = function () {
  if (document.querySelector('#modalForm[data-desktop-editorial="true"]')) __desktopPendingEditorial = null;
  if (document.querySelector('#modalForm[data-desktop-card-delete="true"]') && !__desktopCardDeleteCommitInFlight) __desktopPendingCardDelete = null;
  return __desktopOriginalCloseModal();
};

async function __desktopOpenSkillDeleteDialog() {
  const skill = getSkill(state.focusId);
  if (!skill) return;
  try {
    await __desktopFlush();
  } catch (_error) { return; }
  const confirmed = skill.card?.status === 'CONFIRMADO';
  __desktopPendingDelete = skill.id;
  const deleteChoice = confirmed
    ? '<label class="control"><input type="radio" name="desktopDisposition" value="delete-card" disabled> Excluir a carta junto — desconfirme a carta antes dessa operação.</label>'
    : '<label class="control"><input type="radio" name="desktopDisposition" value="delete-card"> Excluir a skill e sua carta RASCUNHO.</label>';
  modal('Remover skill · decidir carta', '<div class="note">Escolha o destino da carta vinculada a “' + escapeHtml(skill.name) + '”. O padrão mantém a carta e a converte em independente. Cancelar mantém skill e carta.</div><label class="control"><input type="radio" name="desktopDisposition" value="keep-card" checked> Manter a carta como independente.</label>' + deleteChoice, 'APLICAR ESCOLHA');
  document.querySelector('#modalForm')?.setAttribute('data-desktop-skill-delete', 'true');
}

async function __desktopCommitSkillDelete() {
  const skillId = __desktopPendingDelete;
  const form = document.querySelector('#modalForm');
  const disposition = form ? new FormData(form).get('desktopDisposition') : null;
  __desktopPendingDelete = null;
  if (!skillId || !['keep-card', 'delete-card'].includes(disposition)) return;
  if (typeof lcsDesktop.vault.deleteSkill !== 'function') {
    closeModal();
    toast('O serviço do Vault ainda não oferece a decisão de remoção; nenhum dado foi alterado.');
    return;
  }
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    const result = await lcsDesktop.vault.deleteSkill(skillId, disposition);
    __desktopInstall(result);
    __desktopPersistedRevision = saveRevision;
    undoStack = []; redoStack = []; historyBaseline = snapshot();
    state.focusType = 'class';
    state.focusId = result.legacy.classes[0]?.id || null;
    state.selected = new Set(state.focusId ? [state.focusId] : []);
    state.rootId = rootOf(state.focusId)?.id || state.focusId || '';
    closeModal(); render();
    __desktopMarkSaved(result, result.vault?.revision);
  } catch (error) {
    __desktopSaveError = error;
    markSaved('ERRO AO SALVAR NO VAULT');
    toast('Remoção recusada; estado preservado: ' + String(error?.message || error));
  }
}

function __desktopOpenCardDeleteDialog(cutClipboard = null) {
  if (state.tab !== 'gallery' || document.querySelector('#modal')?.children.length) return;
  const keys = [...__desktopCardDeleteSelection];
  const cardIds = keys.map(key => {
    const [kind, id] = key.split(':', 2);
    return kind === 's' ? getSkill(id)?.cardId || null
      : kind === 'g' ? (data.galleryCards || []).find(card => card.id === id)?.id || null
        : null;
  });
  if (!cardIds.length || cardIds.some(id => !id) || new Set(cardIds).size !== cardIds.length) return;
  __desktopPendingCardDelete = { cardIds, ...(Array.isArray(cutClipboard) ? { cutClipboard } : {}) };
  const question = Array.isArray(cutClipboard)
    ? `Ctrl+X excluirá ${cardIds.length === 1 ? 'esta carta' : 'estas cartas'} da origem e deixará os campos prontos para colar.`
    : cardIds.length === 1 ? 'Tem certeza que quer deletar esta carta?' : 'Tem certeza que quer deletar estas cartas?';
  const linkedCount = keys.filter(key => key.startsWith('s:')).length;
  const consequence = linkedCount
    ? `<p class="note">${linkedCount === 1 ? 'A carta vinculada também removerá a skill de origem' : 'As cartas vinculadas também removerão suas skills de origem'} para preservar o vínculo canônico.</p>`
    : '';
  modal(Array.isArray(cutClipboard) ? 'Recortar cartas' : 'Excluir cartas', `<div class="note">${question}</div>${consequence}`, Array.isArray(cutClipboard) ? 'RECORTAR E COPIAR' : 'DELETAR');
  document.querySelector('#modalForm')?.setAttribute('data-desktop-card-delete', 'true');
}

function __desktopCancelCardDelete() {
  if (!__desktopPendingCardDelete || __desktopCardDeleteCommitInFlight) return;
  __desktopPendingCardDelete = null;
  closeModal();
}

async function __desktopCommitCardDelete() {
  const pending = __desktopPendingCardDelete;
  if (!pending || __desktopCardDeleteCommitInFlight) return;
  __desktopCardDeleteCommitInFlight = true;
  const submit = document.querySelector('#modalForm[data-desktop-card-delete="true"] button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    const result = await lcsDesktop.vault.deleteCards(pending.cardIds);
    __desktopInstall(result);
    if (Array.isArray(pending.cutClipboard)) {
      __desktopCardClipboard = pending.cutClipboard;
      toast(`${pending.cutClipboard.length} carta${pending.cutClipboard.length === 1 ? '' : 's'} recortada${pending.cutClipboard.length === 1 ? '' : 's'}; use Ctrl+V na classe de destino.`);
    }
    __desktopPersistedRevision = saveRevision;
    undoStack = []; redoStack = []; historyBaseline = snapshot();
    __desktopCardDeleteSelection.clear();
    __desktopCardDeleteAnchor = null;
    state.gallerySelected = null;
    __desktopPendingCardDelete = null;
    closeModal(); render();
    __desktopMarkSaved(result, result.vault?.revision);
  } catch (error) {
    __desktopSaveError = error;
    markSaved('ERRO AO SALVAR NO VAULT');
    toast('Exclusão recusada; estado preservado: ' + String(error?.message || error));
    if (submit?.isConnected) submit.disabled = false;
  } finally {
    __desktopCardDeleteCommitInFlight = false;
  }
}

const __desktopOriginalModalSubmit = onModalSubmit;
onModalSubmit = function (event) {
  if (event.target.matches('#modalForm[data-desktop-editorial="true"]')) {
    event.preventDefault();
    __desktopCommitEditorialStatus();
    return;
  }
  if (event.target.matches('#modalForm[data-desktop-skill-delete="true"]')) {
    event.preventDefault();
    __desktopCommitSkillDelete();
    return;
  }
  if (event.target.matches('#modalForm[data-desktop-card-delete="true"]')) {
    event.preventDefault();
    __desktopCommitCardDelete();
    return;
  }
  return __desktopOriginalModalSubmit(event);
};

const __desktopOriginalRestoreHistory = restoreHistory;
let __desktopHistoryQueue = Promise.resolve();
async function __desktopRestoreHistory(direction) {
  try { await __desktopFlush(); await __desktopSaveQueue; }
  catch (_error) { return; }
  const targetText = (direction === 'undo' ? undoStack : redoStack).at(-1);
  if (!targetText) return __desktopOriginalRestoreHistory(direction);
  let target;
  try { target = JSON.parse(targetText); }
  catch (error) { toast('Histórico inválido: ' + String(error?.message || error)); return; }
  const targetIds = new Set((target.skills || []).map(skill => skill.id));
  const removedSkills = (data.skills || []).filter(skill => !targetIds.has(skill.id));
  for (const skill of removedSkills) {
    const card = skill.card;
    if (card?.status === 'CONFIRMADO') {
      toast('Undo bloqueado: desconfirme manualmente a carta antes de remover esta skill.');
      return;
    }
  }
  for (const skill of data.skills || []) {
    const card = skill.card;
    if (card?.status !== 'CONFIRMADO') continue;
    const targetSkill = (target.skills || []).find(entry => entry.id === skill.id);
    const targetCard = targetSkill?.card;
    if (!targetCard || JSON.stringify(__desktopCardToLegacy(card)) !== JSON.stringify(__desktopCardToLegacy(targetCard))) {
      toast('Undo/refazer bloqueado: gameplay CONFIRMADO exige desconfirmação manual antes de mudar.');
      return;
    }
  }
  for (const gallery of data.galleryCards || []) {
    if (gallery.card?.status !== 'CONFIRMADO') continue;
    const targetGallery = (target.galleryCards || []).find(entry => entry.id === gallery.id);
    if (!targetGallery?.card || JSON.stringify(__desktopCardToLegacy(gallery.card)) !== JSON.stringify(__desktopCardToLegacy(targetGallery.card))) {
      toast('Undo/refazer bloqueado: gameplay CONFIRMADO exige desconfirmação manual antes de mudar.');
      return;
    }
  }
  for (const skill of removedSkills) {
    try {
      await lcsDesktop.vault.deleteSkill(skill.id, 'delete-card');
      __desktopCards.delete(skill.cardId);
    } catch (error) {
      __desktopSaveError = error;
      markSaved('ERRO AO SALVAR NO VAULT');
      toast('Undo não aplicado; skill e carta foram preservadas: ' + String(error?.message || error));
      return;
    }
  }
  await __desktopOriginalRestoreHistory(direction);
  await __desktopFlush();
  await __desktopSaveQueue;
}
restoreHistory = function (direction) {
  const operation = __desktopHistoryQueue.then(() => __desktopRestoreHistory(direction));
  __desktopHistoryQueue = operation.catch(() => {});
  return operation;
};

function __desktopHandleClick(event) {
  if (event.target.closest('#modalForm[data-desktop-editorial="true"]')) return;
  const recoverButton = event.target.closest('[data-desktop-recover]');
  if (recoverButton && __desktopRecovery) {
    event.preventDefault(); event.stopImmediatePropagation();
    const id = recoverButton.dataset.desktopRecover;
    lcsDesktop.vault.recover(id).then(async result => {
      __desktopRecovery = null;
      if (!Object.keys(__desktopOfficialRefs).length) __desktopOfficialRefs = result.vault?.preferences?.officialC1Palette || {};
      if (!__desktopOfficialUnityMedia.length) __desktopOfficialUnityMedia = Array.isArray(result.vault?.preferences?.unityMedia) ? result.vault.preferences.unityMedia : [];
      __desktopInstall(result);
      __desktopApplyOfficialPalette();
      __desktopApplyUiDefaults();
      booted = true;
      historyBaseline = snapshot();
      document.querySelector('#desktopRecovery')?.remove();
      render();
      drawEffects();
      __desktopRegisterFlushRequired();
      document.documentElement.dataset.desktopState = 'ready';
      document.documentElement.dataset.desktopReady = 'true';
      await lcsDesktop.app.reportStatus(__desktopReadyStatus(result));
      await lcsDesktop.app.ready();
    }).catch(error => __desktopShowError('RECUPERAÇÃO RECUSADA', String(error?.message || error)));
    return;
  }
  if (event.target.closest('[data-action="reset"]')) {
    event.preventDefault(); event.stopImmediatePropagation();
    toast('Reset de demonstração desativado após inicialização do Vault.');
    return;
  }
  if (event.target.closest('[data-action="new-class"], [data-add-slot], [data-palette-id="a:class"]')) {
    event.preventDefault(); event.stopImmediatePropagation();
    toast('A árvore possui 315 slots fixos; não é possível criar classes.');
    return;
  }
  if (event.target.closest('[data-action="delete-obj"]')) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (state.focusType === 'skill') __desktopOpenSkillDeleteDialog();
    else toast('As 315 posições da árvore são fixas; classes não podem ser removidas.');
  }
}

document.addEventListener('click', __desktopHandleClick, true);

const __desktopOriginalImgSrc = imgSrc;
imgSrc = function (source) {
  if (typeof source === 'string' && source.startsWith('media_vault/')) {
    return 'lcs-media://vault/' + source.split('/').map(encodeURIComponent).join('/');
  }
  if (typeof source === 'string' && source.startsWith('lcs-media://')) return source;
  return __desktopOriginalImgSrc(source);
};

officialIcon = function (entry) {
  const root = entry?.tier === 'C1' ? entry : entry?.id ? rootOf(entry.id) : null;
  const iconPath = root ? __desktopOfficialRefs[root.id]?.iconPath : '';
  return iconPath ? imgSrc(iconPath) : '';
};
officialBg = function (entry) {
  const root = entry?.tier === 'C1' ? entry : entry?.id ? rootOf(entry.id) : null;
  const bgPath = root ? __desktopOfficialRefs[root.id]?.bgPath : '';
  return bgPath ? imgSrc(bgPath) : '';
};

function __desktopOfficialAssetPath(id) {
  const asset = __desktopOfficialAssets.get(id);
  if (!asset) return '';
  if (__desktopOfficialAssetIds.has(id)) return asset.path;
  if (!__desktopOfficialAssetRequests.has(id)) {
    const request = lcsDesktop.media.officialAsset(id).then(result => {
      if (result?.id !== id || result.path !== asset.path || result.sha256 !== asset.sha256) throw new Error('Asset oficial retornou metadados divergentes: ' + id);
      __desktopOfficialAssetIds.add(id);
      __desktopOfficialRefreshCardPreview();
      return result.path;
    }).catch(error => {
      toast('Asset oficial indisponível: ' + String(error?.message || error));
      return '';
    }).finally(() => __desktopOfficialAssetRequests.delete(id));
    __desktopOfficialAssetRequests.set(id, request);
  }
  return '';
}

function __desktopCardRoot(owner) {
  if (owner?.classId) return rootOf(owner.classId);
  if (owner?.layoutClassId) return rootOf(owner.layoutClassId);
  if (owner?.source?.rootClassId) return getClass(owner.source.rootClassId);
  if (owner?.category === 'class' && Number.isInteger(owner.slot) && owner.slot >= 0 && owner.slot < 15) return getClass('base_' + owner.slot);
  return null;
}

function __desktopCardLayout(owner, root) {
  const linkedClass = owner?.classId ? getClass(owner.classId) : null;
  const layoutClass = owner?.layoutClassId ? getClass(owner.layoutClassId) : null;
  const selectedRoot = root || (owner?.category !== 'class' ? getClass(state.rootId) : null);
  const tier = String(linkedClass?.tier || layoutClass?.tier || selectedRoot?.tier || 'C1').toUpperCase();
  const layoutTier = tier === 'SPEC' ? 'C3' : ['C1', 'C2', 'C3'].includes(tier) ? tier : 'C1';
  const classId = selectedRoot?.id || (owner?.category === 'class' && Number.isInteger(owner.slot) ? 'base_' + owner.slot : '');
  if (!/^base_(?:[0-9]|1[0-4])$/.test(classId)) return null;
  return __desktopOfficialCardLayouts.get(`card-layout.${layoutTier}.${classId}`) || null;
}

function __desktopCardLayoutUrl(layout) {
  return layout ? 'lcs-app://app/card-layouts/' + layout.path.split('/').map(encodeURIComponent).join('/') : '';
}

const __desktopElementSlugs = { Neutral: 'neutral', Fire: 'fire', Earth: 'earth', Water: 'water', Wind: 'wind', Nature: 'nature', Spiritual: 'spiritual', Arcane: 'arcane', Profane: 'profane', Holy: 'holy' };

function __desktopElementAssetId(value, variant = 'textured') {
  return 'element.' + (__desktopElementSlugs[value] || 'neutral') + '.' + variant;
}

function __desktopTagAsset(tag) {
  const elementName = Object.keys(__desktopElementSlugs).find(name => name.toLowerCase() === String(tag).toLowerCase());
  return elementName ? __desktopOfficialAssets.get(__desktopElementAssetId(elementName, 'transparent')) || null : __desktopTierRoleAssets.get(tag) || __desktopEquipmentAssets.get(tag) || null;
}

function __desktopTagAssetSrc(tag) {
  const asset = __desktopTagAsset(tag);
  return asset ? imgSrc(__desktopOfficialAssetPath(asset.id)) : '';
}

const __desktopOriginalPills = pills;
pills = function (map, max = 40) {
  const template = document.createElement('template');
  template.innerHTML = __desktopOriginalPills(map, max);
  for (const button of template.content.querySelectorAll('.tagpill[data-filter-tag]')) {
    const tag = button.dataset.filterTag;
    const asset = __desktopTagAsset(tag);
    const src = asset ? __desktopTagAssetSrc(tag) : '';
    if (!asset || !src) continue;
    const text = button.firstChild;
    if (text?.nodeType === Node.TEXT_NODE) text.textContent = tag;
    const icon = document.createElement('img');
    icon.className = 'tagpill-icon'; icon.dataset.officialAssetId = asset.id; icon.src = src; icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
    button.prepend(icon);
  }
  return template.innerHTML;
};

const __desktopOriginalTagPanel = tagPanel;
tagPanel = function (...args) {
  const result = __desktopOriginalTagPanel.apply(this, args);
  document.querySelectorAll('#tagrows .tagrow').forEach((row, index) => { row.dataset.family = groupDefs[index]?.id || ''; });
  for (const button of document.querySelectorAll('#tagrows .tagcell[data-tag]')) {
    const tag = button.dataset.tag;
    const asset = __desktopTagAsset(tag);
    const src = asset ? __desktopTagAssetSrc(tag) : '';
    const glyph = button.querySelector('.glyph');
    if (!asset || !src || !glyph) continue;
    const icon = document.createElement('img');
    icon.className = 'tagpanel-icon'; icon.dataset.officialAssetId = asset.id; icon.src = src; icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
    glyph.replaceChildren(icon);
    const label = button.querySelector('.txt');
    if (label) label.textContent = tag;
  }
  const panel = document.querySelector('#tagpanel');
  if (panel && state.tab === 'gallery') {
    for (const button of document.querySelectorAll('#tagrows .tagrow[data-family="elements"] .tagcell[data-tag]')) {
      button.dataset.galleryFilterToggle = 'element';
      button.dataset.galleryFilterValue = button.dataset.tag;
      button.setAttribute('aria-pressed', String(__desktopGalleryFilters.element.includes(button.dataset.tag)));
      button.title = `Filtrar cartas por elemento: ${button.dataset.tag}`;
    }
    if (!panel.querySelector('.gallery-filterbar-side')) panel.insertAdjacentHTML('beforeend', __desktopGalleryFilterMarkup());
  } else panel?.querySelector('.gallery-filterbar-side')?.remove();
  return result;
};

const __desktopRuleGlossary = Object.freeze({
  vulnerable: {
    term: 'Vulnerável',
    description: 'Criaturas Vulneráveis sofrem 50% mais dano de Ataques.'
  }
});

function __desktopRuleKeywordHtml(value) {
  return String(value).replace(/(^|[^\p{L}\p{N}])(vulneráve(?:l|is))(?=$|[^\p{L}\p{N}])/giu, (match, prefix, token) => {
    const entry = __desktopRuleGlossary.vulnerable;
    return `${prefix}<span class="rule-keyword-mention" role="term" data-rule-description="${escapeHtml(entry.description)}">${escapeHtml(token)}</span>`;
  });
}

function __desktopRuleTextHtml(value) {
  return __desktopRuleKeywordHtml(escapeHtml(value));
}

const __desktopRuleKeywordTooltip = document.createElement('div');
__desktopRuleKeywordTooltip.id = 'lcsRuleKeywordTooltip';
__desktopRuleKeywordTooltip.className = 'rule-keyword-tooltip';
__desktopRuleKeywordTooltip.setAttribute('role', 'tooltip');
__desktopRuleKeywordTooltip.hidden = true;
document.body.append(__desktopRuleKeywordTooltip);
let __desktopHoveredRuleKeyword = null;

function __desktopShowRuleKeywordTooltip(target) {
  const description = target?.dataset?.ruleDescription;
  if (!description) return;
  __desktopHoveredRuleKeyword = target;
  __desktopRuleKeywordTooltip.textContent = description;
  __desktopRuleKeywordTooltip.hidden = false;
  __desktopRuleKeywordTooltip.style.visibility = 'hidden';
  const anchor = target.getBoundingClientRect();
  const tooltip = __desktopRuleKeywordTooltip.getBoundingClientRect();
  const edge = 8;
  const gap = 8;
  const left = Math.max(edge, Math.min(anchor.left, window.innerWidth - tooltip.width - edge));
  const above = anchor.top - tooltip.height - gap;
  const top = above >= edge ? above : Math.min(window.innerHeight - tooltip.height - edge, anchor.bottom + gap);
  __desktopRuleKeywordTooltip.style.left = `${left}px`;
  __desktopRuleKeywordTooltip.style.top = `${Math.max(edge, top)}px`;
  __desktopRuleKeywordTooltip.style.visibility = 'visible';
  target.setAttribute('aria-describedby', __desktopRuleKeywordTooltip.id);
}

function __desktopHideRuleKeywordTooltip(target = __desktopHoveredRuleKeyword) {
  if (target && target !== __desktopHoveredRuleKeyword) return;
  __desktopHoveredRuleKeyword?.removeAttribute('aria-describedby');
  __desktopHoveredRuleKeyword = null;
  __desktopRuleKeywordTooltip.hidden = true;
}

const __desktopRuleKeywordTargetSelector = '.rule-keyword-mention[data-rule-description]:not([data-rule-description=""])';
function __desktopUpdateRuleKeywordTooltip(event) {
  const source = event.target instanceof Element ? event.target : null;
  const target = source?.closest(__desktopRuleKeywordTargetSelector)
    || (Number.isFinite(event.clientX) ? document.elementFromPoint(event.clientX, event.clientY)?.closest(__desktopRuleKeywordTargetSelector) : null);
  if (target) __desktopShowRuleKeywordTooltip(target);
}
function __desktopLeaveRuleKeywordTooltip(event) {
  const target = event.target instanceof Element ? event.target.closest(__desktopRuleKeywordTargetSelector) : null;
  if (target && !target.contains(event.relatedTarget)) __desktopHideRuleKeywordTooltip(target);
}
document.addEventListener('pointerover', __desktopUpdateRuleKeywordTooltip);
document.addEventListener('mouseover', __desktopUpdateRuleKeywordTooltip);
document.addEventListener('mousemove', __desktopUpdateRuleKeywordTooltip);
document.addEventListener('pointerout', __desktopLeaveRuleKeywordTooltip);
document.addEventListener('mouseout', __desktopLeaveRuleKeywordTooltip);
document.addEventListener('scroll', () => __desktopHideRuleKeywordTooltip(), true);
window.addEventListener('resize', () => __desktopHideRuleKeywordTooltip());

const __desktopOfficialIconStyle = document.createElement('style');
__desktopOfficialIconStyle.textContent = `
.tagpill .tagpill-icon{display:inline-block;width:1em;height:1em;object-fit:contain;vertical-align:-.1em;margin-right:calc(1px * var(--S))}
#inspect .taglist{gap:calc(1px * var(--S))}#inspect .tagpill .tagpill-icon{width:.8em;height:.8em;margin-right:0}
.tagcell .glyph .tagpanel-icon{display:block;width:calc(15px * var(--S));height:calc(15px * var(--S));object-fit:contain}
.rule-keyword-mention{color:#ffd942;text-shadow:0 0 4px #e8aa34aa;border-bottom:1px dotted currentColor;cursor:help;pointer-events:auto!important}
.rule-keyword-tooltip{position:fixed;z-index:10000;max-width:min(320px,calc(100vw - 16px));box-sizing:border-box;padding:10px 12px;border:1px solid #9a7842;border-radius:4px;background:linear-gradient(145deg,#34201d,#1b1517);box-shadow:0 8px 24px #000c;color:#f6ead6;font:14px/1.35 Georgia,serif;pointer-events:none}
.rule-keyword-tooltip[hidden]{display:none!important}
`;
document.head.append(__desktopOfficialIconStyle);

renderCardPreview = function (owner, artOnly = false) {
  const card = owner?.card || {};
  const noteDraft = card.status === 'RASCUNHO' && typeof card.noteOwnerId === 'string' && ['C1', 'C2', 'C3'].includes(card.noteTier);
  const root = __desktopCardRoot(owner);
  const layout = __desktopCardLayout(owner, root);
  const combinedId = root ? `class.${root.id}.combined` : '';
  const combinedPath = combinedId ? __desktopOfficialAssetPath(combinedId) : '';
  const customPath = card.art || card.artPath || '';
  const classIcon = root ? officialIcon(root) : '';
  const background = root ? officialBg(root) : '';
  const mainPath = customPath ? imgSrc(customPath) : noteDraft ? '' : combinedPath ? imgSrc(combinedPath) : classIcon;
  const mainAlt = customPath ? 'Arte da carta' : combinedPath ? 'Arte oficial da classe' : classIcon ? 'Ícone oficial da classe' : 'Arte da carta';
  if (artOnly) return mainPath ? `<div class="playcard-art-window" style="position:relative;width:100%;height:100%;pointer-events:none"><img src="${escapeHtml(mainPath)}" alt="${mainAlt}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"></div>` : '';
  const backgroundStyle = !customPath && (noteDraft || !combinedPath) && background ? `background-image:linear-gradient(#0a1c27a5,#0a1c2744),url('${background}');background-size:cover;background-position:center;` : '';
  const mainImageStyle = classIcon && !customPath && !combinedPath && !noteDraft ? 'position:absolute;inset:10%;width:80%;height:80%;object-fit:contain' : 'position:absolute;inset:0;object-fit:cover';
  if (layout) {
    const title = card.name || owner?.name || '';
    const layoutUrl = __desktopCardLayoutUrl(layout);
    const cardWidth = state.tab === 'gallery' ? 227.14 : 253.60;
    const cardHeight = state.tab === 'gallery' ? 318 : 355;
    const layoutStyle = 'position:absolute;z-index:1;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none';
    const textStyle = 'position:absolute;z-index:2;overflow:hidden;text-shadow:0 1px 3px #17090a;color:#fff2d4;pointer-events:none';
    const noInfo = noteDraft ? 'display:none;' : '';
    const cost = noteDraft ? '' : escapeHtml(card.cost || '1');
    const type = noteDraft ? '' : escapeHtml(card.type || 'Attack');
    const element = noteDraft ? '' : escapeHtml(card.element || 'Neutral');
const typeMarkup = noteDraft ? "" : `<span>${type}</span><span aria-hidden="true">·</span><span class="playcard-layout-element">${element}</span>`;
    const rules = noteDraft ? '' : __desktopRuleTextHtml(card.ruleText || 'Escreva o efeito da carta...');
    const flavour = noteDraft ? '' : escapeHtml(card.flavourText || '');
    return `<div class="playcard playcard-art" data-card-layout="${escapeHtml(layout.id)}" style="position:relative;display:block;box-sizing:border-box;width:calc(${cardWidth}px * var(--S));height:calc(${cardHeight}px * var(--S));min-height:0;max-height:none;padding:0;border:0;border-radius:0;box-shadow:none;overflow:hidden;background:transparent;color:#fff2d4;font-family:Georgia,serif"><div class="playcard-art-window" style="position:absolute;z-index:0;inset:17% 10% 37%;overflow:hidden;pointer-events:none">${mainPath ? `<img src="${escapeHtml(mainPath)}" alt="${mainAlt}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${noteDraft ? 'cover' : classIcon && !combinedPath ? 'contain' : 'cover'}">` : noteDraft ? '' : '✦'}</div><img src="${escapeHtml(layoutUrl)}" alt="Layout final ${escapeHtml(layout.className)} ${layout.tier}" style="${layoutStyle}"><div class="playcard-layout-cost" style="${textStyle};${noInfo}left:1%;top:0;width:21%;height:15%;display:grid;place-items:center;font:700 calc(15px * var(--S)) Arial,sans-serif">${cost}</div><b class="playcard-layout-title" style="${textStyle};left:22%;top:2.8%;width:56%;height:10.5%;display:flex;align-items:center;justify-content:center;text-align:center;white-space:normal;font-size:calc(13px * var(--S));line-height:1.05">${escapeHtml(title)}</b><div class="playcard-layout-type" style="${textStyle};${noInfo}left:27%;top:13.8%;width:46%;height:4.3%;display:flex;align-items:center;justify-content:center;gap:.35em;text-align:center;white-space:nowrap;font:700 calc(6px * var(--S)) Arial,sans-serif;line-height:1.05">${typeMarkup}</div><div class="playcard-layout-rules" style="${textStyle};${noInfo}left:12%;top:65%;width:76%;height:25%;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-line;font-size:calc(10px * var(--S));line-height:1.2">${rules}</div><div class="playcard-layout-flavour" style="${textStyle};${noInfo}left:12%;top:91%;width:76%;height:3.2%;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-line;color:#ecd2b2;font-style:italic;font-size:calc(7px * var(--S));font-family:Georgia,serif">${flavour}</div></div>`;
  }
  return `<div class="playcard"><div class="playcard-head"><b>${escapeHtml(card.name || owner?.name || '')}</b><span class="energy-orb">${noteDraft ? '' : escapeHtml(card.cost || '1')}</span></div><div class="playcard-art" style="position:relative;${backgroundStyle}">${mainPath ? `<img src="${escapeHtml(mainPath)}" alt="${mainAlt}" style="${mainImageStyle}">` : noteDraft ? '' : '✦'}</div><div class="playcard-type">${noteDraft ? '' : `${escapeHtml(card.type || 'Attack')} · ${escapeHtml(card.element || 'Neutral')}`}</div><div class="playcard-rules">${noteDraft ? '' : __desktopRuleTextHtml(card.ruleText || 'Escreva o efeito da carta...')}</div><div class="playcard-flavour">${noteDraft ? '' : escapeHtml(card.flavourText || '')}</div></div>`;
};

const __desktopOriginalCardPreviewForType = renderCardPreview;
renderCardPreview = function (owner, artOnly = false) {
  let html = __desktopOriginalCardPreviewForType(owner, artOnly);
  if (artOnly) return html;
  const card = owner?.card || {};
  const noteDraft = card.status === 'RASCUNHO' && typeof card.noteOwnerId === 'string' && ['C1', 'C2', 'C3'].includes(card.noteTier);
  html = html.replace('font-size:calc(13px * var(--S));line-height:1.05', 'font-size:calc(17px * var(--S));line-height:1.05');
  if (html.includes('data-card-layout')) {
    const element = noteDraft ? '' : escapeHtml(card.element || 'Neutral');
    html = html.replace('left:39%;top:96%;width:22%;height:3%;text-align:center', 'left:39%;top:97%;width:22%;height:2.5%;text-align:center');
    html = html.replace(/(<div class="playcard-layout-type"[^>]*>)([\s\S]*?)<span aria-hidden="true">·<\/span><span class="playcard-layout-element">[\s\S]*?<\/span>(<\/div>)/,
      (_match, open, type, close) => `${open}${type}${close}`);
    if (element) {
      const footer = `<div class="playcard-layout-element" style="position:absolute;z-index:2;left:39%;top:94.2%;width:22%;height:2.3%;display:flex;align-items:center;justify-content:center;overflow:hidden;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #17090a;color:#fff2d4;pointer-events:none;font:700 calc(5.5px * var(--S)) Arial,sans-serif;line-height:1.05">${element}</div>`;
      html = html.replace(/<\/div>$/, `${footer}</div>`);
    }
  } else if (!noteDraft) {
    const type = escapeHtml(card.type || 'Attack');
    const element = escapeHtml(card.element || 'Neutral');
    html = html.replace(/<div class="playcard-type">[\s\S]*?<\/div>/, `<div class="playcard-type">${type}</div>`);
    html = html.replace(/(<div class="playcard-type">[\s\S]*?<\/div>)/, `$1<div class="playcard-element">${element}</div>`);
  }
  return html;
};

const __desktopCardElementFooterStyle = document.createElement('style');
__desktopCardElementFooterStyle.textContent = `
#artCardPreview .playcard-layout-element{pointer-events:auto!important;cursor:pointer}
#artCardPreview .playcard-layout-element:hover{outline:1px solid #69daf4;outline-offset:1px}
`;
document.head.append(__desktopCardElementFooterStyle);

function __desktopOfficialRefreshCardPreview() {
  if (!booted) return;
  if (state.tab === 'gallery') {
    if (state.galleryCategory === 'class') __desktopUrgentRenderClassThumbnails();
    const selected = getGallerySelection();
    const box = document.querySelector('#artCardPreview');
    if (selected) {
      const owner = { name: selected.card?.name || selected.name, card: selected.card, classId: selected.owner?.classId, layoutClassId: selected.owner?.layoutClassId, category: selected.owner?.category, slot: selected.owner?.slot, noteOwnerId: selected.owner?.noteOwnerId, noteTier: selected.owner?.noteTier };
      if (box) { box.innerHTML = renderCardPreview(owner); __desktopFitCardDescriptions(box); __desktopFitGalleryArtPanelPreview(); }
    }
    return;
  }
  if (state.focusType === 'skill' && state.skillMode === 'card') {
    const skill = getSkill(state.focusId);
    if (skill) updateCardPreview(skill);
  }
}

galleryEdit = function (event) {
  const object = getGallerySelection();
  const target = event.target;
  if (!object || !target?.dataset?.galleryEdit) return false;
  const key = target.dataset.galleryEdit;
  if (Object.hasOwn(__desktopCardVisualBounds, key)) {
    const [min, max] = __desktopCardVisualBounds[key];
    const value = Number(target.value);
    if (!Number.isInteger(value)) { target.value = String(__desktopCardVisualValue(object.card, key)); return false; }
    object.owner.card[key] = Math.max(min, Math.min(max, value));
    target.value = String(object.owner.card[key]);
  } else object.owner.card[key] = target.value;
  if (key === 'name' && object.kind === 'gallery') object.owner.name = target.value;
  mutate(null, false);
  const selected = [...document.querySelectorAll('.gallery-card[data-gallery-card]')].find(tile => tile.dataset.galleryCard === state.gallerySelected);
  const setText = (selector, value) => { const element = selected?.querySelector(selector); if (element) element.textContent = value; };
  if (key === 'name') {
    setText('b', target.value);
    __desktopFitCardDescriptions(selected?.querySelector('.playcard[data-card-layout]'));
  }
  else if (key === 'cost') setText('.gallery-energy', target.value);
  else if (key === 'rarity') setText('.gallery-rarity', String(target.value).toUpperCase());
  else if (key === 'type' || key === 'element') setText('small', `${object.card.type || 'Skill'} · ${object.card.element || 'Neutral'}`);
  __desktopOfficialRefreshCardPreview();
  return true;
};

const __desktopOriginalArtPanel = artPanel;
artPanel = function () {
  __desktopOriginalArtPanel();
  const artBody = document.querySelector('#artbody');
  const matrixClass = state.tab === 'matrix' && state.focusType === 'class' ? shownClass() : null;
  const classBackground = matrixClass ? officialBg(matrixClass) : '';
  if (artBody) {
    if (classBackground) {
      artBody.style.backgroundImage = `linear-gradient(#07151b88,#07151b88),url("${classBackground}")`;
      artBody.style.backgroundSize = 'cover';
      artBody.style.backgroundPosition = 'center';
      artBody.dataset.classBackground = rootOf(matrixClass.id)?.id || matrixClass.id;
    } else {
      artBody.style.removeProperty('background-image');
      artBody.style.removeProperty('background-size');
      artBody.style.removeProperty('background-position');
      delete artBody.dataset.classBackground;
    }
  }
  if (state.tab !== 'gallery') return;
  const selected = getGallerySelection();
  const box = document.querySelector('#artCardPreview');
  if (selected && box) box.innerHTML = renderCardPreview({ name: selected.card?.name || selected.name, card: selected.card, classId: selected.owner?.classId, layoutClassId: selected.owner?.layoutClassId, category: selected.owner?.category, slot: selected.owner?.slot, noteOwnerId: selected.owner?.noteOwnerId, noteTier: selected.owner?.noteTier });
};

let __desktopUrgentClassClickTimer = null;
const __desktopUrgentOriginalEventClick = eventClick;
eventClick = function (event) {
  const inspectArt = state.tab === 'matrix' && state.focusType === 'class' ? event.target.closest('#inspect .inspector-hero') : null;
  if (inspectArt && event.detail !== 0) {
    clearTimeout(__desktopUrgentClassClickTimer);
    if (event.detail > 1) return;
    const cls = getClass(state.focusId);
    const source = cls ? (imgSrc(cls.imagePath) || officialIcon(cls)) : '';
    __desktopUrgentClassClickTimer = setTimeout(() => {
      __desktopUrgentClassClickTimer = null;
      if (state.tab === 'matrix' && state.focusType === 'class' && source) showPreview(source);
    }, 240);
    return;
  }
  const card = state.tab === 'matrix' ? event.target.closest('#matrixscroll .class-card[data-class], #c1list [data-root]') : null;
  if (!card || event.detail === 0) return __desktopUrgentOriginalEventClick(event);
  clearTimeout(__desktopUrgentClassClickTimer);
  if (event.detail > 1) return;
  const classId = card.dataset.class || card.dataset.root;
  __desktopUrgentClassClickTimer = setTimeout(() => {
    __desktopUrgentClassClickTimer = null;
    if (state.tab === 'matrix') __desktopUrgentOriginalEventClick(event);
  }, 240);
};

function __desktopUrgentSelectClass(classId) {
  const cls = getClass(classId);
  if (!cls) return null;
  state.focusType = 'class'; state.focusId = cls.id; state.selected = new Set([cls.id]);
  state.rootId = rootOf(cls.id)?.id || cls.id;
  return cls;
}

function __desktopUrgentOpenClassGallery(classId) {
  const cls = __desktopUrgentSelectClass(classId);
  if (!cls || !['C1', 'C2', 'C3'].includes(String(cls.tier).toUpperCase())) return;
  const root = rootOf(cls.id);
  state.tab = 'gallery'; state.galleryCategory = 'class'; state.galleryAll = false;
  state.gallerySlot = Math.max(0, data.classes.filter(item => item.tier === 'C1').findIndex(item => item.id === root?.id));
  state.galleryClassId = cls.id; state.galleryRailC2Id = cls.tier === 'C3' ? cls.parentId : '';
  state.gallerySelected = null; render(); drawEffects();
}

document.addEventListener('dblclick', event => {
  const inspectArt = event.target.closest('#inspect .inspector-hero');
  if (state.tab === 'matrix' && state.focusType === 'class' && inspectArt) {
    event.preventDefault(); event.stopImmediatePropagation();
    clearTimeout(__desktopUrgentClassClickTimer);
    document.querySelector('#classArt')?.click();
    return;
  }
  const imageSlot = event.target.closest('#matrixscroll .class-card .card-image');
  if (state.tab === 'matrix' && imageSlot) {
    event.preventDefault(); event.stopImmediatePropagation();
    clearTimeout(__desktopUrgentClassClickTimer);
    const cls = __desktopUrgentSelectClass(imageSlot.closest('[data-class]')?.dataset.class);
    if (cls) { render(); document.querySelector('#classArt')?.click(); }
    return;
  }
  const classNode = event.target.closest('#matrixscroll .class-card[data-class], #c1list [data-root]');
  if (state.tab === 'matrix' && classNode) {
    event.preventDefault(); event.stopImmediatePropagation();
    clearTimeout(__desktopUrgentClassClickTimer);
    __desktopUrgentOpenClassGallery(classNode.dataset.class || classNode.dataset.root);
  }
}, true);

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const classCard = image.closest('.class-card[data-class]');
  const rootButton = image.closest('#c1list [data-root]');
  const galleryClassButton = image.closest('[data-gallery-class]');
  const inspectClass = image.closest('#inspect .inspector-hero') && state.focusType === 'class' ? state.focusId : null;
  const cls = getClass(classCard?.dataset.class || rootButton?.dataset.root || galleryClassButton?.dataset.galleryClass || inspectClass);
  if (!cls || !image.matches('.class-card .card-image img, #c1list .c1icon img, .urgent-class-slot img, #inspect .inspector-hero img')) return;
  const fallback = officialIcon(cls);
  if (fallback && image.getAttribute('src') !== fallback) image.src = fallback;
  else {
    const replacement = document.createElement('span');
    replacement.className = 'urgent-class-fallback';
    replacement.textContent = cls.emoji || '◇';
    replacement.setAttribute('aria-label', 'Ícone oficial da classe');
    image.replaceWith(replacement);
  }
}, true);

function __desktopUrgentClassButton(cls, selected, tier) {
  const src = officialIcon(cls);
  return `<button type="button" class="urgent-class-slot urgent-${tier.toLowerCase()} ${selected ? 'selected' : ''}" data-gallery-class="${escapeHtml(cls.id)}" title="${escapeHtml(cls.tier + ' · ' + cls.name)}" aria-label="${escapeHtml(cls.tier + ' ' + cls.name)}">${src ? `<img src="${escapeHtml(src)}" alt="">` : '<span>◇</span>'}<span class="urgent-class-name">${escapeHtml(cls.name)}</span></button>`;
}

function __desktopUrgentRenderClassRails() {
  const strip = document.querySelector('#c1strip');
  if (!strip) return;
  let rails = strip.querySelector('#urgentClassRails');
  if (!rails) { rails = document.createElement('div'); rails.id = 'urgentClassRails'; strip.append(rails); }
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  const selected = getClass(state.galleryClassId) || roots[state.gallerySlot] || roots[0];
  const root = selected ? (selected.tier === 'C1' ? selected : rootOf(selected.id)) : null;
  const selectedC2 = selected?.tier === 'C2' ? selected : selected?.tier === 'C3' ? getClass(selected.parentId) : null;
  rails.innerHTML = roots.map(parent => {
    const allSelected = __desktopGalleryAllRootId === parent.id;
    const c1Highlight = allSelected || selected?.id === parent.id ? 'highlight-4' : parent.id === root?.id && selected?.tier !== 'C1' ? 'highlight-3' : '';
    const children = data.classes.filter(cls => cls.parentId === parent.id && cls.tier === 'C2');
    const paths = children.map(parentC2 => {
      const c2Highlight = allSelected || selectedC2?.id === parentC2.id && selected?.tier === 'C2' ? 'highlight-4' : selectedC2?.id === parentC2.id && selected?.tier === 'C3' ? 'highlight-3' : '';
      const grandchildren = data.classes.filter(cls => cls.parentId === parentC2.id && cls.tier === 'C3');
      const c2Selected = allSelected || selected?.id === parentC2.id;
      return `<div class="urgent-class-path">${__desktopUrgentClassButton(parentC2, c2Selected, 'C2').replace('urgent-c2', `urgent-c2 ${c2Highlight}`)}<div class="urgent-c3-branch">${grandchildren.map(cls => {
        const highlight = allSelected || selected?.id === cls.id ? 'highlight-4' : '';
        return __desktopUrgentClassButton(cls, allSelected || selected?.id === cls.id, 'C3').replace('urgent-c3', `urgent-c3 ${highlight}`);
      }).join('')}</div></div>`;
    }).join('');
    const bg = officialBg(parent);
    const allClass = allSelected ? 'highlight-4 selected' : '';
    const c1Selected = allSelected || selected?.id === parent.id;
    return `<section class="urgent-class-block" data-class-block="${escapeHtml(parent.id)}" style="--class-block-bg:url('${escapeHtml(bg)}')"><div class="urgent-class-top">${__desktopUrgentClassButton(parent, c1Selected, 'C1').replace('urgent-c1', `urgent-c1 ${c1Highlight}`)}<button type="button" class="urgent-class-all ${allClass}" data-gallery-all-root="${escapeHtml(parent.id)}" aria-pressed="${allSelected}" title="${allSelected ? 'Remover seleção de todas as classes desta C1' : 'Exibir cartas de todas as classes desta C1'}">ALL</button></div><div class="urgent-class-subgrid">${paths}</div></section>`;
  }).join('');
}

const __desktopUrgentOriginalC1Strip = c1Strip;
c1Strip = function (...args) {
  const result = __desktopUrgentOriginalC1Strip.apply(this, args);
  const active = state.tab === 'gallery' && state.galleryCategory === 'class';
  document.querySelector('#app')?.classList.toggle('gallery-class-mode', active);
  if (active) __desktopUrgentRenderClassRails();
  else document.querySelector('#urgentClassRails')?.remove();
  return result;
};

const __desktopUrgentOriginalGalleryItems = galleryItems;
galleryItems = function (...args) {
  const items = __desktopUrgentOriginalGalleryItems.apply(this, args);
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  for (const item of items) {
    const layoutClass = getClass(item.owner?.layoutClassId || item.owner?.classId);
    if (layoutClass) item.root = rootOf(layoutClass.id);
    else if (item.owner?.category === 'class' && Number.isInteger(item.owner?.slot)) item.root = roots[item.owner.slot] || null;
  }
  const selected = getClass(state.galleryClassId) || data.classes.filter(cls => cls.tier === 'C1')[state.gallerySlot] || null;
  let visible = items;
  if (selected && state.galleryCategory === 'class' && !state.galleryAll) {
    if (__desktopGalleryAllRootId) visible = items.filter(item => {
      const cls = getClass(item.owner?.classId || item.owner?.layoutClassId);
      const tier = cls?.tier || (item.owner?.category === 'class' ? 'C1' : null);
      return ['C1', 'C2', 'C3'].includes(tier) && item.root?.id === __desktopGalleryAllRootId;
    });
    else visible = items.filter(item => {
      const cls = getClass(item.owner?.classId || item.owner?.layoutClassId);
      if (selected.tier === 'C1') return cls?.id === selected.id || (!cls && item.owner?.category === 'class' && item.owner?.slot === state.gallerySlot);
      return cls?.id === selected.id;
    });
  }
  return visible.map((item, index) => ({ item, index, mechanic: item.card?.type === 'Class Mechanic' }))
    .sort((a, b) => Number(b.mechanic) - Number(a.mechanic) || a.index - b.index)
    .map(entry => entry.item);
};

function __desktopUrgentRenderClassThumbnails() {
  const items = new Map(galleryItems().map(item => [`${item.kind}:${item.id}`, item]));
  for (const cardElement of document.querySelectorAll('.gallery-card[data-gallery-card]')) {
    const item = items.get(cardElement.dataset.galleryCard);
    const tile = cardElement.querySelector('.gallery-art');
    if (!item || !tile) continue;
    const owner = item.owner || {};
    const preview = document.createElement('div');
    preview.className = 'gallery-card-preview';
    Object.assign(preview.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' });
    preview.innerHTML = renderCardPreview({ name: item.name, card: item.card, classId: owner.classId, layoutClassId: owner.layoutClassId, category: owner.category, slot: owner.slot ?? item.slot, noteOwnerId: owner.noteOwnerId, noteTier: owner.noteTier, source: owner.source });
    const playcard = preview.querySelector('.playcard[data-card-layout]');
    if (!playcard) continue;
    playcard.style.flex = 'none';
    cardElement.querySelector('.gallery-rarity')?.remove();
    tile.removeAttribute('style');
    tile.replaceChildren(preview);
    playcard.style.transform = 'none';
    __desktopFitCardDescriptions(playcard);
    const cardRect = playcard.getBoundingClientRect();
    playcard.dataset.fitNaturalWidth = String(cardRect.width);
    playcard.dataset.fitNaturalHeight = String(cardRect.height);
    const fitScale = cardRect.width > 0 && cardRect.height > 0
      ? Math.min(tile.clientWidth / cardRect.width, tile.clientHeight / cardRect.height)
      : 1;
    playcard.style.transform = `scale(${fitScale})`;
    playcard.style.transformOrigin = 'center center';
  }
}

function __desktopFitGalleryCardThumbnails() {
  const grid = document.querySelector('.gallery-cardgrid');
  if (!grid) return;
  const tiles = [...grid.querySelectorAll('.gallery-card[data-gallery-card]')];
  const sampleArt = tiles.map(tile => tile.querySelector('.gallery-art')).find(art => art && art.getBoundingClientRect().width > 0);
  const sampleRect = sampleArt?.getBoundingClientRect();
  if (!sampleRect?.width || !sampleRect.height) return;
  for (const tile of tiles) {
    const art = tile.querySelector('.gallery-art');
    const playcard = art?.querySelector('.gallery-card-preview .playcard[data-card-layout]');
    if (!playcard) continue;
    playcard.style.transform = 'none';
    __desktopFitCardDescriptions(playcard);
    const cardRect = playcard.getBoundingClientRect();
    const naturalWidth = cardRect.width;
    const naturalHeight = cardRect.height;
    if (!(naturalWidth > 0 && naturalHeight > 0)) continue;
    playcard.dataset.fitNaturalWidth = String(naturalWidth);
    playcard.dataset.fitNaturalHeight = String(naturalHeight);
    const artRect = art.getBoundingClientRect();
    const fitScale = Math.min((artRect.width || sampleRect.width) / naturalWidth, (artRect.height || sampleRect.height) / naturalHeight);
    playcard.style.transform = `scale(${fitScale})`;
    playcard.style.transformOrigin = 'center center';
  }
}

function __desktopFitGalleryArtPanelPreview() {
  const host = document.querySelector('#artbody.gallery-artbody #artCardPreview');
  const card = host?.querySelector('.class-mechanic-playcard');
  if (!host || !card) return;
  card.style.transform = 'none';
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const availableWidth = host.clientWidth;
  const availableHeight = host.clientHeight;
  if (!(width > 0 && height > 0 && availableWidth > 0 && availableHeight > 0)) return;
  const scale = Math.min(availableWidth / width, availableHeight / height, 1);
  card.style.transform = `scale(${scale})`;
  card.style.transformOrigin = 'center center';
}

let __desktopCardFitResizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(__desktopCardFitResizeTimer);
  __desktopCardFitResizeTimer = setTimeout(() => {
    __desktopFitCardDescriptions(document);
    __desktopFitGalleryCardThumbnails();
    __desktopFitGalleryArtPanelPreview();
  }, 0);
}, { passive: true });

const __desktopUrgentOriginalGalleryView = galleryView;
galleryView = function (...args) {
  const result = __desktopUrgentOriginalGalleryView.apply(this, args);
  const active = state.tab === 'gallery' && state.galleryCategory === 'class';
  const app = document.querySelector('#app');
  app?.classList.toggle('gallery-class-mode', active);
  if (!active) return result;
  const selected = getClass(state.galleryClassId) || getClass('base_' + state.gallerySlot);
  const root = selected ? (selected.tier === 'C1' ? selected : rootOf(selected.id)) : null;
  const center = document.querySelector('#center');
  if (center) {
    center.style.removeProperty('--matrix-bg');
    center.style.backgroundImage = root && officialBg(root) ? `linear-gradient(#07151b40,#07151b40),url("${officialBg(root)}")` : '';
    center.style.backgroundSize = 'cover'; center.style.backgroundPosition = 'center';
  }
  return result;
};

const __desktopUrgentOriginalGalleryInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopUrgentOriginalGalleryInspect.apply(this, args);
  if (state.tab !== 'gallery') return result;
  const hero = document.querySelector('#inspect .gallery-hero');
  if (!hero) return result;
  const selected = getGallerySelection();
  const art = selected?.card?.artPath || selected?.card?.art || '';
  const source = imgSrc(art);
  hero.replaceChildren();
  if (source) {
    const image = document.createElement('img');
    image.src = source; image.alt = 'Arte da carta';
    hero.append(image);
  }
  return result;
};

const __desktopUrgentRailStyle = document.createElement('style');
__desktopUrgentRailStyle.id = 'desktopUrgentRailStyle';
__desktopUrgentRailStyle.textContent = `
#app.gallery-class-mode #c1strip{display:block!important;right:calc(382px * var(--S));height:calc(118px * var(--S));overflow:hidden}
#app.gallery-class-mode #c1list{display:none!important}
#app.gallery-class-mode #bodygrid{top:calc(118px * var(--S))!important;grid-template-columns:calc(340px * var(--S)) minmax(0,1fr) calc(367px * var(--S))!important}#app.gallery-class-mode #tagpanel{width:calc(367px * var(--S));height:calc(374px * var(--S))}
#app.gallery-class-mode #artside{display:block!important;grid-column:3;min-width:0}
#app.gallery-class-mode #center{grid-column:2;min-width:0}
#urgentClassRails{position:absolute;inset:0;display:grid;grid-template-rows:calc(26px * var(--S)) calc(25px * var(--S)) minmax(0,1fr);gap:calc(2px * var(--S));padding:calc(3px * var(--S)) calc(6px * var(--S));box-sizing:border-box}
.urgent-class-rail{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));gap:calc(2px * var(--S));min-width:0;min-height:0}
.urgent-class-branch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(2px * var(--S));min-width:0;min-height:0}
.urgent-c2-branch{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:calc(1px * var(--S));min-width:0;min-height:0}
.urgent-class-slot{appearance:none;min-width:0;overflow:hidden;display:flex;align-items:center;gap:calc(3px * var(--S));padding:calc(2px * var(--S));border:1px solid #183a4c;border-radius:3px;background:#0b202c;color:#a6c6d4;text-align:left;font:700 calc(8px * var(--S)) Arial,sans-serif}
.urgent-class-slot img{width:calc(16px * var(--S));height:calc(18px * var(--S));flex:none;object-fit:contain}
.urgent-class-slot .urgent-class-fallback{width:calc(16px * var(--S));height:calc(18px * var(--S));flex:none;font-size:calc(12px * var(--S))}
.urgent-class-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.urgent-class-slot.selected{color:#f2fbff;border-color:#47c9e6;background:#174258;box-shadow:0 0 7px #35d1eb55}
.urgent-rail-c2,.urgent-rail-c3{display:grid}
.urgent-rail-c3 .urgent-class-branch{grid-template-columns:repeat(2,minmax(0,1fr))}
.urgent-rail-c3 .urgent-class-slot{font-size:calc(7px * var(--S))}
.urgent-class-fallback{display:grid;place-items:center;width:100%;height:100%;color:#d8c378;font-size:calc(22px * var(--S));font-family:Georgia,serif}
.gallery-class-mode .gallery-scroll{background:linear-gradient(#06141b60,#06141b88)}
.gallery-class-mode .gallery-cardgrid{grid-template-columns:repeat(auto-fill,minmax(calc(180px * var(--S)),1fr));padding-right:calc(245px * var(--S))}
.gallery-class-mode .gallery-card .gallery-art img{width:100%;height:100%;object-fit:cover}
`;
document.head.append(__desktopUrgentRailStyle);

const __desktopUrgentOriginalRailEventClick = eventClick;
eventClick = function (event) {
  const allButton = event.target.closest('[data-gallery-all-root]');
  if (state.tab === 'gallery' && state.galleryCategory === 'class' && allButton) {
    event.preventDefault();
    const rootId = allButton.dataset.galleryAllRoot;
    __desktopGalleryAllRootId = __desktopGalleryAllRootId === rootId ? null : rootId;
    const root = getClass(rootId);
    state.galleryClassId = rootId;
    state.gallerySlot = Math.max(0, data.classes.filter(item => item.tier === 'C1').findIndex(item => item.id === rootId));
    state.galleryRailC2Id = '';
    state.galleryAll = false; state.gallerySelected = null; state.rootId = root?.id || state.rootId;
    render(); drawEffects();
    return;
  }
  const button = event.target.closest('[data-gallery-class]');
  if (state.tab === 'gallery' && state.galleryCategory === 'class' && button) {
    const cls = getClass(button.dataset.galleryClass);
    if (!cls) return;
    event.preventDefault();
    const root = rootOf(cls.id);
    state.galleryClassId = cls.id; state.gallerySlot = Math.max(0, data.classes.filter(item => item.tier === 'C1').findIndex(item => item.id === root?.id));
    state.galleryRailC2Id = cls.tier === 'C3' ? cls.parentId : cls.tier === 'C2' ? cls.id : '';
    __desktopGalleryAllRootId = null;
    state.galleryAll = false; state.gallerySelected = null; state.rootId = root?.id || state.rootId;
    render(); drawEffects();
    return;
  }
  return __desktopUrgentOriginalRailEventClick(event);
};

const __desktopUrgentOriginalEventChange = eventChange;
eventChange = function (event) {
  if (event.target?.id === 'galleryCategory') { state.galleryClassId = null; state.galleryRailC2Id = ''; state.galleryAll = false; state.gallerySelected = null; __desktopGalleryAllRootId = null; }
  return __desktopUrgentOriginalEventChange(event);
};

const __desktopUrgentOriginalArtPanel = artPanel;
function __desktopPositionGalleryArtBody() {
  const body = document.querySelector('#artbody.gallery-artbody');
  const side = body?.closest('#artside');
  if (!body || !side || state.tab !== 'gallery' || state.galleryCategory !== 'class') return;
  const sideRect = side.getBoundingClientRect();
  const filterRect = document.querySelector('#tagpanel .gallery-filterbar-side')?.getBoundingClientRect();
  const toolbarRect = side.querySelector('.gallery-toolbar-inspect')?.getBoundingClientRect();
  const reservedBottom = Math.max(filterRect?.bottom || sideRect.top, toolbarRect?.bottom || sideRect.top);
  const freeTop = reservedBottom + 6;
  body.style.paddingTop = `${Math.max(0, freeTop - sideRect.top)}px`;
  body.style.paddingBottom = '8px';
  const preview = body.querySelector('#artCardPreview, .gallery-empty');
  if (preview) {
    const rect = preview.getBoundingClientRect();
    const freeCenter = (freeTop + sideRect.bottom) / 2;
    const currentPaddingTop = Number.parseFloat(body.style.paddingTop) || 0;
    body.style.paddingTop = `${Math.max(0, currentPaddingTop + freeCenter - (rect.top + rect.bottom) / 2)}px`;
  }
  __desktopFitGalleryArtPanelPreview();
}
window.addEventListener('resize', () => __desktopPositionGalleryArtBody());
artPanel = function (...args) {
  const result = __desktopUrgentOriginalArtPanel.apply(this, args);
  document.querySelector('.urgent-gallery-preview')?.remove();
  __desktopPositionGalleryArtBody();
  return result;
};

function __desktopUrgentMentionValue(value) { return String(value || '').trim().normalize('NFKC').toLocaleLowerCase(); }

function __desktopUrgentResolveMention(prefix, name, ownerId) {
  const normalized = __desktopUrgentMentionValue(name);
  if (!normalized) return null;
  const tier = `C${prefix}`;
  const noteCard = (data.galleryCards || []).find(item => item.noteOwnerId === ownerId && item.noteTier === tier && __desktopUrgentMentionValue(item.card?.name || item.name) === normalized);
  if (noteCard) return { kind: 'card', selectionKind: 'g', id: noteCard.id, owner: noteCard };
  const cls = data.classes.find(item => item.tier === tier && __desktopUrgentMentionValue(item.name) === normalized);
  if (cls) return { kind: 'class', id: cls.id };
  for (const skill of data.skills || []) if (__desktopUrgentMentionValue(skill.card?.name || skill.name) === normalized) return { kind: 'card', selectionKind: 's', id: skill.id, owner: skill };
  for (const item of data.galleryCards || []) if (__desktopUrgentMentionValue(item.card?.name || item.name) === normalized) return { kind: 'card', selectionKind: 'g', id: item.id, owner: item };
  for (const group of groupDefs || []) for (const tag of group.tags || []) {
    const id = Array.isArray(tag) ? tag[0] : tag;
    const label = Array.isArray(tag) ? tag[1] : tag;
    if ([id, label].some(value => __desktopUrgentMentionValue(value) === normalized)) return { kind: 'tag', id: String(id) };
  }
  return null;
}

function __desktopUrgentFollowMention(target) {
  if (target.kind === 'class') {
    __desktopUrgentSelectClass(target.id); state.tab = 'matrix'; render(); drawEffects(); return;
  }
  if (target.kind === 'tag') {
    state.tab = 'database'; state.dbMode = 'classes'; state.filters = [{ id: uid(), field: 'tag', value: target.id, enabled: true, exclude: false }]; render(); return;
  }
  const owner = target.owner;
  const cls = getClass(owner?.classId || owner?.layoutClassId);
  const root = cls ? rootOf(cls.id) : getClass(`base_${owner?.slot ?? 0}`);
  state.tab = 'gallery'; state.galleryCategory = owner?.category || 'class';
  state.gallerySlot = Math.max(0, data.classes.filter(item => item.tier === 'C1').findIndex(item => item.id === root?.id));
  state.galleryClassId = cls?.id || null; state.galleryRailC2Id = cls?.tier === 'C3' ? cls.parentId : cls?.tier === 'C2' ? cls.id : '';
  state.galleryAll = false; state.gallerySelected = `${target.selectionKind}:${target.id}`; state.rootId = root?.id || state.rootId; render(); drawEffects();
}

function __desktopUrgentNoteMarkup(text, ownerId) {
  const host = document.createElement('div');
  const source = String(text || '');
  const pattern = /@([123])([^\r\n]*)/g;
  let cursor = 0, match;
  while ((match = pattern.exec(source))) {
    host.append(document.createTextNode(source.slice(cursor, match.index)));
    const prefix = match[1], rest = match[2], name = rest.trim();
    const resolved = __desktopUrgentResolveMention(prefix, name, ownerId);
    if (resolved) {
      const link = document.createElement('a');
      link.className = 'free-note-link'; link.href = '#'; link.textContent = match[0];
      link.dataset.noteKind = resolved.kind; link.dataset.noteId = resolved.id;
      if (resolved.selectionKind) link.dataset.noteSelectionKind = resolved.selectionKind;
      host.append(link);
    } else {
      host.append(document.createTextNode(`@${prefix}`));
      if (rest) { const pending = document.createElement('span'); pending.className = 'free-note-pending'; pending.textContent = rest; host.append(pending); }
    }
    cursor = pattern.lastIndex;
  }
  host.append(document.createTextNode(source.slice(cursor)));
  return host;
}

function __desktopUrgentUpdateNoteEditor(editor) {
  const cls = getClass(editor.dataset.freeNote);
  if (!cls) return;
  const shell = editor.closest('.free-note-shell');
  const layer = shell?.querySelector('.free-note-layer');
  if (!layer) return;
  editor.closest('.free-note')?.classList.toggle('is-empty', !editor.value);
  layer.replaceChildren();
  if (!editor.value) {
    const placeholder = document.createElement('span'); placeholder.className = 'free-note-placeholder';
    placeholder.textContent = 'Escreva uma nota livre… Use @1, @2 ou @3 para criar backlinks.'; layer.append(placeholder);
  } else layer.append(__desktopUrgentNoteMarkup(editor.value, cls.id));
  layer.style.transform = `translate(${-editor.scrollLeft}px,${-editor.scrollTop}px)`;
}

function __desktopUrgentInjectFreeNotes() {
  for (const group of document.querySelectorAll('#matrixscroll .c3group')) {
    const classCard = group.querySelector('.class-card[data-class]');
    const cls = getClass(classCard?.dataset.class);
    if (!cls || cls.tier !== 'C3' || group.querySelector('.free-note')) continue;
    const section = document.createElement('section'); section.className = 'free-note is-empty';
    section.innerHTML = '<label class="free-note-label">Free Notes</label><div class="free-note-shell"><div class="free-note-layer" aria-label="Menções e backlinks desta nota"></div><textarea class="field free-note-editor" data-free-note="' + escapeHtml(cls.id) + '" aria-label="Free Note de ' + escapeHtml(cls.name) + '" spellcheck="true"></textarea></div>';
    const editor = section.querySelector('textarea'); editor.value = String(cls.notes || '');
    group.append(section); __desktopUrgentUpdateNoteEditor(editor);
    editor.addEventListener('scroll', () => __desktopUrgentUpdateNoteEditor(editor), { passive: true });
  }
}

const __desktopUrgentOriginalMatrixTree = matrixTree;
matrixTree = function (...args) {
  const result = __desktopUrgentOriginalMatrixTree.apply(this, args);
  __desktopUrgentInjectFreeNotes();
  return result;
};

const __desktopUrgentNoteStyle = document.createElement('style');
__desktopUrgentNoteStyle.id = 'desktopUrgentNoteStyle';
__desktopUrgentNoteStyle.textContent = `
#app.matrix #matrixscroll .c3group{position:relative}
.free-note{position:absolute;top:calc(100% + calc(7px * var(--S)));left:0;width:100%;box-sizing:border-box;border:1px solid #214355;border-radius:4px;padding:calc(4px * var(--S));background:#09192355;opacity:.68;transition:border-color .12s,box-shadow .12s,opacity .12s}
.free-note:not(.is-empty){opacity:.94;background:#0b1d2880}
.free-note:focus-within{opacity:1;border-color:#62c9e0;box-shadow:0 0 0 1px #42c1dc88,0 0 13px #36b9d533}
.free-note-label{display:block;color:#b9d6e0;font:800 calc(9px * var(--S)) Arial,sans-serif;letter-spacing:.1em;margin:0 0 calc(3px * var(--S))}
.free-note-shell{position:relative;height:calc(210px * var(--S));min-height:0;max-height:none;border:1px solid #25495a;border-radius:3px;overflow:hidden;background:#071721}
.free-note-layer,.free-note-editor{box-sizing:border-box;width:100%;height:100%;min-height:0;max-height:none;margin:0;padding:calc(6px * var(--S)) calc(7px * var(--S));font:calc(10px * var(--S))/1.35 Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:normal;text-align:left}
.free-note-layer{position:absolute;inset:0;z-index:2;overflow:hidden;color:#d8e7ed;pointer-events:none}
.free-note-editor{position:absolute;inset:0;z-index:1;display:block;resize:none;border:0!important;border-radius:0!important;background:transparent!important;color:transparent!important;-webkit-text-fill-color:transparent;caret-color:#edfaff;outline:none;scrollbar-width:thin}
.free-note-editor::selection{-webkit-text-fill-color:transparent;background:#55d8ee55}
.free-note-placeholder{color:#66899a;opacity:.72}
.free-note-link{color:#53e9ff;text-decoration:none;text-shadow:0 0 5px #10cbe9bb,0 0 10px #14c3ec55;pointer-events:auto;cursor:pointer}
.free-note-pending{color:#ffe54f;text-shadow:0 0 5px #ffdb2eaa,0 0 10px #f9d11c55}
.free-note-layer a:hover{text-decoration:underline}
`;
document.head.append(__desktopUrgentNoteStyle);

const __desktopUrgentOriginalEventInput = eventInput;
eventInput = function (event) {
  const editor = event.target?.closest?.('textarea[data-free-note]');
  if (editor) {
    const cls = getClass(editor.dataset.freeNote);
    if (cls) { cls.notes = editor.value; __desktopUrgentUpdateNoteEditor(editor); mutate(null, false); }
    return;
  }
  return __desktopUrgentOriginalEventInput(event);
};

const __desktopUrgentOriginalEventKeyDown = eventKeyDown;
eventKeyDown = function (event) {
  const editor = event.target?.closest?.('textarea[data-free-note]');
  if (editor && event.key === 'Enter' && !event.shiftKey && editor.selectionStart === editor.selectionEnd) {
    const lineStart = editor.value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
    const lineEndAt = editor.value.indexOf('\n', editor.selectionStart);
    const lineEnd = lineEndAt < 0 ? editor.value.length : lineEndAt;
    if (editor.selectionStart === lineEnd) {
      const match = editor.value.slice(lineStart, lineEnd).match(/^\s*@([123])\s*(.+?)\s*$/);
      if (match) {
        const name = match[2].trim();
        if (name && name.length <= 100 && !__desktopUrgentResolveMention(match[1], name, editor.dataset.freeNote)) {
          const owner = getClass(editor.dataset.freeNote);
          const tier = `C${match[1]}`;
          const associated = tier === 'C1' ? rootOf(owner?.id) : tier === 'C2' ? getClass(owner?.parentId) : owner;
          const root = owner ? rootOf(owner.id) : null;
          const slot = data.classes.filter(item => item.tier === 'C1').findIndex(item => item.id === root?.id);
          if (owner && associated?.tier === tier && slot >= 0) {
            event.preventDefault();
            const id = 'card-' + crypto.randomUUID();
            const noteElement = __desktopClassDefaultElement(owner);
            const entry = { id, category: 'class', slot, name, layoutClassId: associated.id, noteOwnerId: owner.id, noteTier: tier, card: { name, type: '', element: noteElement, cost: '', ruleText: '', flavourText: '', tags: [noteElement], workflowStatus: 'draft', art: '' } };
            data.galleryCards.push(entry);
            const draftCard = __desktopBindCard(entry, id, entry.card);
            draftCard.status = 'RASCUNHO'; draftCard.noteOwnerId = owner.id; draftCard.noteTier = tier; draftCard.layoutClassId = associated.id;
            mutate('Carta RASCUNHO criada pela Free Note', false);
            __desktopUrgentUpdateNoteEditor(editor);
          }
        }
      }
    }
  }
  return __desktopUrgentOriginalEventKeyDown(event);
};

document.addEventListener('click', event => {
  const link = event.target.closest('.free-note-link[data-note-kind]');
  if (!link) return;
  event.preventDefault(); event.stopImmediatePropagation();
  let target = { kind: link.dataset.noteKind, id: link.dataset.noteId };
  if (target.kind === 'card') {
    const selectionKind = link.dataset.noteSelectionKind;
    const owner = selectionKind === 's' ? getSkill(target.id) : (data.galleryCards || []).find(item => item.id === target.id);
    if (!owner) return;
    target = { kind: 'card', selectionKind, id: target.id, owner };
  }
  __desktopUrgentFollowMention(target);
});

const __desktopOriginalInspectSkill = inspectSkill;
inspectSkill = function (skill) {
  __desktopOriginalInspectSkill(skill);
  const inspector = document.querySelector('#inspect');
  const inlinePreview = inspector?.querySelector('#cardLivePreview');
  if (inlinePreview) {
    const heading = inlinePreview.previousElementSibling;
    if (heading?.classList.contains('hlabel') && /PREVIEW/i.test(heading.textContent)) heading.remove();
    inlinePreview.remove();
  }
  __desktopLockConfirmedCard(skill?.card, inspector);
};

const __desktopOriginalGalleryInspect = galleryInspect;
galleryInspect = function () {
  __desktopOriginalGalleryInspect();
  const selected = getGallerySelection();
  if (!selected?.card) return;
  const inspect = document.querySelector('#inspect');
  if (!inspect) return;
  __desktopLockConfirmedCard(selected.card, inspect);
};

function __desktopViewport() {
  return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
}

function __desktopRegisterFlushRequired() {
  if (__desktopCloseUnsubscribe) return;
  __desktopCloseUnsubscribe = lcsDesktop.app.onFlushRequired(async function () {
    try {
      await __desktopFlush();
      const closed = await lcsDesktop.app.closeAfterFlush();
      if (closed === false) throw new Error('A sincronização foi cancelada. O Vault continua salvo localmente.');
    } catch (_error) {
      await lcsDesktop.app.flushFailed().catch(() => {});
      toast('O Vault continua salvo localmente. A sincronização não foi concluída; tente fechar novamente.');
    }
  });
}

function __desktopReadyStatus(result) {
  return {
    state: 'ready',
    classCount: result.vault?.classes?.length ?? data.classes.length,
    skillCount: result.vault?.skills?.length ?? data.skills.length,
    cardCount: result.cardvault.cards.length,
    classIds: data.classes.map(item => item.id),
    skillIds: data.skills.map(item => item.id),
    cardIds: result.cardvault.cards.map(item => item.id),
    transactionId: result.vault?.transactionId || null,
    revision: result.vault?.revision ?? null,
    viewport: __desktopViewport(),
    error: null
  };
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-action="effect-toggle"], [data-action="columns"]')) setTimeout(__desktopScheduleUiPreferenceCommit, 0);
}, false);
document.addEventListener('submit', () => setTimeout(__desktopScheduleUiPreferenceCommit, 0), false);

if (lcsDesktop.mode.qa) {
  Object.defineProperty(window, '__lcsQa', { configurable: false, enumerable: false, value: Object.freeze({
    async flush() { await __desktopFlush(); await __desktopSaveQueue; },
    ensureClassMechanics() { return __desktopEnsureClassMechanics(); },
    async beginVisualFixtures() { await __desktopFlush(); await __desktopSaveQueue; __desktopQaPersistenceSuspended = true; clearTimeout(saveTimer); return { revision: __desktopPersistedRevision }; },
    async discardVisualFixtures() {
      clearTimeout(saveTimer);
      await __desktopSaveQueue;
      const result = await lcsDesktop.vault.load();
      if (result.state !== 'ready') throw new Error('Vault QA não permaneceu pronto após capturas visuais.');
      __desktopInstall(result); __desktopApplyOfficialPalette(); __desktopApplyUiDefaults();
      const preferred = data.classes.find(item => item.id === 'base_5' && item.tier === 'C1') || data.classes.find(item => item.tier === 'C1');
      state.tab = 'matrix'; state.focusType = 'class'; state.focusId = preferred?.id || null; state.rootId = preferred?.id || ''; state.selected = new Set(preferred ? [preferred.id] : []); state.skillMode = 'lcs'; state.tagOpen = true;
      state.filters = []; state.filterOp = 'AND'; state.filterSource = 'effective'; state.dbMode = 'classes'; state.dbSearch = ''; state.dashSearch = ''; state.galleryCategory = 'class'; state.gallerySlot = 5; state.galleryAll = false; state.gallerySelected = null;
      closeModal(); undoStack = []; redoStack = []; saveRevision = __desktopPersistedRevision; __desktopMarkSaved(result, result.vault.revision); historyBaseline = snapshot(); __desktopQaPersistenceSuspended = false; render(); drawEffects();
      return { state: result.state, revision: result.vault.revision, transactionId: result.vault.transactionId, counts: { classes: data.classes.length, skills: data.skills.length, cards: __desktopCards.size }, galleryIds: (data.galleryCards || []).map(item => item.id) };
    },
    counts() { return { classes: data.classes.length, c1: data.classes.filter(item => item.tier === 'C1').length, c2: data.classes.filter(item => item.tier === 'C2').length, c3: data.classes.filter(item => item.tier === 'C3').length, specs: data.classes.filter(item => item.tier === 'Spec').length, skills: data.skills.length, gallery: data.galleryCards?.length || 0, cards: __desktopCards.size }; },
    cardLayoutProbe(classId) {
      const cls = getClass(classId);
      const root = __desktopCardRoot({ classId });
      const host = document.createElement('div');
      host.innerHTML = renderCardPreview({ name: 'QA layout', classId, card: { name: 'QA layout' } });
      const card = host.querySelector('.playcard');
      return { tier: cls?.tier || null, classId, rootId: root?.id || null, layoutId: card?.dataset.cardLayout || null, layoutSrc: host.querySelector('img[alt^="Layout final"]')?.getAttribute('src') || null };
    },
    async tagPillViewProbe(tag) {
      if (!Object.prototype.hasOwnProperty.call(__desktopElementSlugs, tag)) throw new Error('Tag elemental inválida.');
      const owner = data.classes.find(item => item.tier === 'C1');
      if (!owner) throw new Error('Classe QA indisponível.');
      const previous = { tab: state.tab, focusType: state.focusType, focusId: state.focusId, rootId: state.rootId, selected: new Set(state.selected), dbMode: state.dbMode };
      const previousTags = owner.tags;
      const measure = async selector => {
        const icon = document.querySelector(selector)?.querySelector('img.tagpill-icon');
        if (icon) await icon.decode().catch(() => null);
        return { id: icon?.dataset.officialAssetId || null, src: icon?.getAttribute('src') || null, loaded: !!icon?.complete && icon.naturalWidth > 0, naturalWidth: icon?.naturalWidth || 0 };
      };
      try {
        owner.tags = [...new Set([...(Array.isArray(previousTags) ? previousTags : []), tag])];
        state.tab = 'matrix'; state.focusType = 'class'; state.focusId = owner.id; state.rootId = owner.id; state.selected = new Set([owner.id]); render();
        const inspect = await measure(`#inspect .tagpill[data-filter-tag="${tag}"]`);
        state.tab = 'database'; state.dbMode = 'classes'; render();
        const database = await measure(`#center .dbtable .tagpill[data-filter-tag="${tag}"]`);
        return { tag, inspect, database };
      } finally {
        owner.tags = previousTags;
        Object.assign(state, previous); render();
      }
    },
    galleryBackdropTransitionProbe() {
      const saved = { tab: state.tab, galleryCategory: state.galleryCategory, galleryClassId: state.galleryClassId, gallerySlot: state.gallerySlot, galleryAll: state.galleryAll, gallerySelected: state.gallerySelected, dbMode: state.dbMode };
      const center = document.querySelector('#center');
      if (!center) throw new Error('Centro da interface ausente.');
      try {
        const root = data.classes.find(item => item.tier === 'C1');
        if (!root) throw new Error('C1 de teste ausente.');
        state.tab = 'gallery'; state.galleryCategory = 'class'; state.galleryClassId = root.id; state.gallerySlot = root.slot; state.galleryAll = true; state.gallerySelected = null;
        render();
        const galleryBackground = center.style.backgroundImage;
        state.tab = 'database'; state.dbMode = 'classes'; render();
        const databaseBackground = getComputedStyle(center).backgroundImage;
        return { galleryBackground, databaseInlineBackground: center.style.backgroundImage, databaseBackground, cleared: !center.style.backgroundImage && !center.style.backgroundSize && !center.style.backgroundPosition, hasOnlyBaseGradient: !databaseBackground.includes('url(') };
      } finally { Object.assign(state, saved); render(); }
    },
    async cardAssetProbe(element, ruleText) {
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none' });
      host.innerHTML = renderCardPreview({ name: 'QA elemental', category: 'independent', card: { name: 'QA elemental', element, ruleText, rarity: 'Common', type: 'Attack', cost: '1' } });
      document.body.append(host);
      try {
        const card = host.querySelector('.playcard');
        const elementLabel = card?.querySelector('.playcard-layout-element');
        const rules = card?.querySelector('.playcard-rules, .playcard-layout-rules');
        const ruleImages = [...(rules?.querySelectorAll('.rule-element-icon') || [])];
        return {
          element: { text: elementLabel?.textContent?.trim() || '', renderedAsText: !!elementLabel, iconCount: card?.querySelectorAll('.playcard-art img[alt^="Elemento"]').length || 0 },
          rules: { text: rules?.textContent || '', escapedMarkup: !!rules?.innerHTML.includes('&lt;damage&gt;'), injectedMarkup: !!rules?.querySelector('damage'), icons: ruleImages.map(image => ({ id: image.dataset.officialAssetId || null, src: image.getAttribute('src') || null, loaded: image.complete && image.naturalWidth > 0, naturalWidth: image.naturalWidth || 0 })) }
        };
      } finally { host.remove(); }
    },
    officialIconFor(id, paletteId, emoji) { const entry = getClass(id); return entry ? officialIcon({ ...entry, paletteId, emoji }) : ''; },
    snapshot() { return __desktopLegacySnapshot(); },
    status() {
      const selectedCard = __desktopSelectedEditorialCard();
      return {
        saveState: document.querySelector('#saveState')?.textContent || '',
        saveRevision,
        persistedRevision: __desktopPersistedRevision,
        saveError: __desktopSaveError ? { name: String(__desktopSaveError.name || 'Error'), code: String(__desktopSaveError.code || ''), message: String(__desktopSaveError.message || __desktopSaveError) } : null,
        presetIds: (data.presets || []).map(item => item.id),
        lastPaletteAction: __desktopLastPaletteAction,
        selection: { tab: state.tab, focusType: state.focusType, focusId: state.focusId, cardId: selectedCard?.id || null, cardStatus: selectedCard?.status || null },
        pendingEditorial: __desktopPendingEditorial ? { ...__desktopPendingEditorial } : null,
        editorialCommitInFlight: __desktopEditorialCommitInFlight,
        pendingCardDelete: __desktopPendingCardDelete ? { cardIds: [...__desktopPendingCardDelete.cardIds] } : null
      };
    },
    captureCsvButton() {
      const button = document.querySelector('[data-action="export-csv"]');
      if (!button) throw new Error('Botão CSV ausente no Database.');
      let captured = null;
      const original = downloadText;
      downloadText = (filename, body, mime) => { captured = { filename: String(filename), body: String(body), mime: String(mime) }; };
      try { button.click(); }
      finally { downloadText = original; }
      return captured;
    },
    replaySnapshot(legacy) { return lcsDesktop.vault.saveLegacy(legacy); },
    ids() { return { skills: data.skills.map(item => item.id), classes: data.classes.map(item => item.id) }; },
    preferences() { return JSON.parse(JSON.stringify(data.preferences || {})); },
    card(id) { const card = __desktopCards.get(id); return card ? JSON.parse(JSON.stringify(card)) : null; },
    selectClass(id) { const item = getClass(id); if (!item) throw new Error('Class ID ausente: ' + id); state.tab = 'matrix'; state.focusType = 'class'; state.focusId = id; state.rootId = rootOf(id)?.id || id; state.selected = new Set([id]); render(); drawEffects(); return id; },
    selectSkill(id, mode = 'card') { const item = getSkill(id); if (!item) throw new Error('Skill ID ausente: ' + id); state.tab = 'matrix'; state.focusType = 'skill'; state.focusId = id; state.rootId = rootOf(item.classId)?.id || ''; state.selected = new Set([id]); state.skillMode = mode; render(); drawEffects(); return id; },
    async importFile(ownerKind, ownerId, file) { const owner = ownerKind === 'skill' ? getSkill(ownerId) : ownerKind === 'class' ? getClass(ownerId) : (data.galleryCards || []).find(item => item.id === ownerId); if (!owner || !(file instanceof File)) throw new Error('Fixture/owner inválido.'); const bytes = new Uint8Array(await file.arrayBuffer()); const result = await lcsDesktop.media.import(bytes, file.type); if (ownerKind === 'class') owner.imagePath = result.path; else owner.card.artPath = result.path; mutate('QA importou mídia original'); await __desktopFlush(); return result; },
    inspectMetrics() { const el = document.querySelector('#inspect'); return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop } : null; },
    viewport: __desktopViewport
  }) });
}

function __desktopDetectMediaMime(bytes) {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

uploadArt = function (file, owner, mode) {
  if (!file) return;
  const card = mode === 'card' ? owner?.card : null;
  if (card?.status === 'CONFIRMADO') {
    toast('Desconfirme a carta antes de substituir a arte aprovada.');
    return;
  }
  if (file.size < 1 || file.size > 12 * 1024 * 1024) {
    toast('Escolha PNG, JPEG ou WebP de até 12 MB.');
    return;
  }
  const src = URL.createObjectURL(file);
  const image = new Image();
  image.onload = async function () {
    URL.revokeObjectURL(src);
    if (image.width * image.height > 40000000) return toast('Ilustração grande demais (limite: 40 megapixels).');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = __desktopDetectMediaMime(bytes);
      if (!mime) return toast('O conteúdo precisa ser PNG, JPEG ou WebP.');
      const imported = await lcsDesktop.media.import(bytes);
      if (mime === 'image/webp') {
        const unityMedia = __desktopUnityMediaList(data.preferences?.unityMedia);
        if (!unityMedia.some(entry => entry.sourcePath === imported.path)) {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          if (!blob || blob.size > 12 * 1024 * 1024) throw new Error('A versão PNG para exportação ultrapassou o limite de 12 MB.');
          const png = await lcsDesktop.media.import(new Uint8Array(await blob.arrayBuffer()));
          data.preferences = {
            ...data.preferences,
            unityMedia: [...unityMedia, { sourcePath: imported.path, sourceSha256: imported.sha256, pngPath: png.path, pngSha256: png.sha256 }]
          };
        }
      }
      if (mode === 'card') owner.card.artPath = imported.path;
      else owner.imagePath = imported.path;
      mutate('Mídia salva no Vault');
    } catch (error) {
      toast('Importação de mídia falhou: ' + String(error?.message || error));
    }
  };
  image.onerror = function () { URL.revokeObjectURL(src); toast('Não foi possível abrir a imagem.'); };
  image.src = src;
};

settings = function () {
  const saveState = document.querySelector('#saveState')?.textContent || 'Vault não carregado';
  modal('Sistema · Lok\'nite Class System', `
    <div class="note">Salvamento automático no Vault compartilhado. <strong>${escapeHtml(saveState)}</strong></div>
    <div class="hlabel">GALERIA</div>
    <label class="tiny"><input type="checkbox" id="galleryDimDisabled" ${data.preferences?.galleryDimEnabled === false ? 'checked' : ''}> Desligar escurecimento ao focar cartas</label>
    <label class="control"><span class="small">Volume dos sons</span><span class="row"><input type="range" id="uiSoundVolume" min="0" max="100" step="1" value="${Math.round(Math.max(0, Math.min(100, Number(data.preferences?.uiSoundVolume ?? 100))))}"><output id="uiSoundVolumeValue">${Math.round(Math.max(0, Math.min(100, Number(data.preferences?.uiSoundVolume ?? 100))))}%</output></span></label>
    <div class="row wrap">
      <button type="button" class="btn web-admin-only" data-action="export">⇩ Criar backup</button>
      <label class="btn web-admin-only" for="importFile">⇧ Importar snapshot JSON compatível</label>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      <button type="button" class="btn" data-action="custom-tag">＋ Tag customizada</button>
    </div>
    <div class="hlabel">ATALHOS</div>
    <p class="tiny"><span class="helpkey">Quote / Backquote</span> alterna ATRIBUIR/FILTRAR no Tag Panel · segure + <span class="helpkey">1–0</span>: seleciona grupo · <span class="helpkey">1–0</span> sozinho: atribui/remove tag da seleção. <span class="helpkey">Ctrl+clique</span> multisseleção. <span class="helpkey">Esc</span> fecha modal · Teclado numérico habilitado.</p>
    <div class="note">Os slots e os vínculos da árvore de classes são fixos. As tags das skills são herdadas na linhagem.</div>
  `, 'Fechar');
};

snapshot = function () { return JSON.stringify(__desktopLegacySnapshot()); };

mutate = function (message, refresh = true) {
  if (!historyRestoring) recordHistory();
  __desktopCanonicalize();
  saveRevision++;
  const revision = saveRevision;
  markSaved('Alterações pendentes');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { __desktopPersistNow().catch(() => {}); }, 150);
  if (refresh) render();
  if (message) toast(message);
};

duplicateSkill = function () {
  const source = state.focusType === 'skill' ? getSkill(state.focusId) : null;
  if (!source) return;
  const copy = ensureNormalized({ classes: [], skills: [source] }).skills[0];
  copy.id = uid();
  copy.cardId = null;
  copy.name = source.name + ' (Copy)';
  copy.card.name = (source.card?.name || source.name) + ' (Copy)';
  data.skills.push(copy);
  state.selected = new Set([copy.id]);
  state.focusId = copy.id;
  mutate('Skill duplicada mantendo origem, tags e carta');
};

exportJson = async function () {
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    const backup = await lcsDesktop.vault.exportBackup();
    toast('Backup recuperável salvo no Vault · ' + String(backup?.id || 'concluído'));
  } catch (error) {
    toast('Backup falhou: ' + String(error?.message || error));
  }
};

importJson = async function (file) {
  if (!file) return;
  if (file.size > 24 * 1024 * 1024) return toast('Backup acima do limite de 24 MB.');
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    const parsed = JSON.parse(await file.text());
    const legacy = parsed?.data && typeof parsed.data === 'object' ? { ...parsed, ...parsed.data } : parsed;
    delete legacy.data;
    if (Array.isArray(parsed.customGroups)) {
      legacy.customGroups = { traits: [], custom: [] };
      for (const group of parsed.customGroups) if (['traits', 'custom'].includes(group.id)) legacy.customGroups[group.id] = (group.tags || []).slice(0, 10);
    }
    const result = await lcsDesktop.vault.importLegacy(legacy);
    __desktopInstall(result);
    __desktopPersistedRevision = saveRevision;
    state.selected = new Set(); state.focusId = null; state.rootId = data.classes.find(entry => entry.tier === 'C1')?.id || '';
    undoStack = []; redoStack = []; historyBaseline = snapshot();
    closeModal(); render(); drawEffects();
    __desktopMarkSaved(result, result.vault?.revision);
    toast('Importação validada; novas cartas permanecem RASCUNHO.');
  } catch (error) {
    toast('Importação recusada; estado atual preservado: ' + String(error?.message || error));
  }
};

boot = async function () {
  try {
    const officialMedia = await lcsDesktop.media.officialPalette();
    __desktopOfficialRefs = officialMedia.references || {};
    __desktopOfficialUnityMedia = Array.isArray(officialMedia.unityMedia) ? officialMedia.unityMedia : [];
    const equipmentAssets = Array.isArray(officialMedia.equipmentAssets) ? officialMedia.equipmentAssets : [];
    const tierRoleAssets = Array.isArray(officialMedia.tierRoleAssets) ? officialMedia.tierRoleAssets : [];
    __desktopOfficialAssets = new Map([...(Array.isArray(officialMedia.assets) ? officialMedia.assets : []), ...equipmentAssets, ...tierRoleAssets].map(asset => [asset.id, asset]));
    __desktopEquipmentAssets = new Map(equipmentAssets.map(asset => [asset.tag, asset]));
    __desktopTierRoleAssets = new Map(tierRoleAssets.map(asset => [asset.tag, asset]));
    __desktopOfficialCardLayouts = new Map((Array.isArray(officialMedia.cardLayouts) ? officialMedia.cardLayouts : []).map(layout => [layout.id, layout]));
    __desktopOfficialClassMechanicLayouts = new Map((Array.isArray(officialMedia.classMechanicLayouts) ? officialMedia.classMechanicLayouts : []).map(layout => [layout.id, layout]));
    __desktopOfficialAssetIds = new Set(Array.isArray(officialMedia.installedAssetIds) ? officialMedia.installedAssetIds : []);
    let result = await lcsDesktop.vault.load();
    if (result.state === 'recovery') {
      result = await lcsDesktop.vault.load(true);
      booted = false;
      __desktopShowRecovery({ ...result, officialMediaError: officialMedia.error || null });
      document.documentElement.dataset.desktopState = 'recovery';
      await lcsDesktop.app.reportStatus({ state: 'recovery', classCount: null, skillCount: null, cardCount: null, classIds: null, skillIds: null, cardIds: null, transactionId: result.backups?.[0]?.transactionId || null, revision: result.backups?.[0]?.revision ?? null, viewport: __desktopViewport(), error: result.error || null });
      await lcsDesktop.app.ready();
      return;
    }
    __desktopApplyOfficialPalette();
    if (result.state === 'empty') {
      data = demo();
      result = await lcsDesktop.vault.saveLegacy(__desktopLegacySnapshot());
    }
    else if (result.state === 'ready' && (!__desktopPaletteMatches(result.vault?.preferences?.officialC1Palette) || !__desktopUnityMatches(result.vault?.preferences?.unityMedia))) {
      __desktopInstall(result);
      data.preferences = { ...(data.preferences || {}), officialC1Palette: __desktopOfficialRefs, unityMedia: __desktopUnityMediaList(data.preferences?.unityMedia) };
      result = await lcsDesktop.vault.saveLegacy(__desktopLegacySnapshot());
    }
    __desktopInstall(result);
    __desktopApplyUiDefaults();
    const seededClassMechanics = __desktopEnsureClassMechanics();
    if (seededClassMechanics) {
      mutate(null, false);
      result = await __desktopFlush();
      await __desktopSaveQueue;
    }
    historyBaseline = snapshot();
    booted = true;
    markSaved('Vault carregado · revisão ' + String(result.vault?.revision ?? 0));
    render();
    drawEffects();
    document.documentElement.dataset.desktopReady = 'true';
    document.documentElement.dataset.desktopState = 'ready';
    __desktopRegisterFlushRequired();
    await lcsDesktop.app.reportStatus(__desktopReadyStatus(result));
    await lcsDesktop.app.ready();
  } catch (error) {
    booted = false;
    document.documentElement.dataset.desktopState = 'error';
    __desktopShowError('FALHA AO CARREGAR O VAULT', String(error?.message || error) + '\nNenhuma demonstração foi carregada ou gravada.');
    await lcsDesktop.app.reportStatus({ state: 'error', classCount: null, skillCount: null, cardCount: null, classIds: null, skillIds: null, cardIds: null, transactionId: null, revision: null, viewport: __desktopViewport(), error: String(error?.message || error) }).catch(() => {});
    await lcsDesktop.app.ready().catch(() => {});
  }
};

const __desktopFreeNoteDraftFields = ['type', 'element', 'cost'];
const __desktopOriginalFreeNoteGalleryInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopOriginalFreeNoteGalleryInspect.apply(this, args);
  const selected = getGallerySelection();
  const card = selected?.card;
  const noteDraft = card?.status === 'RASCUNHO' && typeof card.noteOwnerId === 'string' && ['C1', 'C2', 'C3'].includes(card.noteTier);
  if (!noteDraft) return result;
  for (const field of __desktopFreeNoteDraftFields) {
    const editor = document.querySelector(`#inspect [data-gallery-edit="${field}"]`);
    if (!editor) continue;
    let blank = editor.querySelector('option[value=""]');
    if (!blank) { blank = new Option('—', ''); editor.add(blank, 0); }
    editor.value = typeof card[field] === 'string' ? card[field] : '';
  }
  return result;
};

const __desktopOriginalFreeNoteGalleryView = galleryView;
galleryView = function (...args) {
  const result = __desktopOriginalFreeNoteGalleryView.apply(this, args);
  if (state.tab !== 'gallery' || state.galleryCategory !== 'class') return result;
  for (const tile of document.querySelectorAll('.gallery-card[data-gallery-card]')) {
    const [kind, id] = String(tile.dataset.galleryCard || '').split(':');
    const owner = kind === 's' ? getSkill(id) : (data.galleryCards || []).find(item => item.id === id);
    const card = owner?.card;
    if (card?.status !== 'RASCUNHO' || typeof card.noteOwnerId !== 'string' || !['C1', 'C2', 'C3'].includes(card.noteTier)) continue;
    tile.querySelector('.gallery-rarity')?.replaceChildren();
    tile.querySelector('.gallery-energy')?.replaceChildren();
    tile.querySelector('small')?.replaceChildren();
  }
  __desktopUrgentRenderClassThumbnails();
  return result;
};

function __desktopOfficialClassCardMarkup(markup, cls) {
  const icon = officialIcon(cls);
  if (!icon) return markup;
  return markup.replace(/<span class="card-image">[\s\S]*?<\/span>/, `<span class="card-image"><img class="heritage-icon" src="${escapeHtml(icon)}" alt="Ícone oficial da linhagem ${escapeHtml(inheritedC1(cls)?.name || '')}"></span>`);
}

const __desktopClassCardWithOfficialIcon = classCard;
classCard = function (cls, kind = 'c3') {
  return __desktopOfficialClassCardMarkup(__desktopClassCardWithOfficialIcon(cls, kind), cls);
};

const __desktopRenderWithGalleryBackdropCleanup = render;
render = function (...args) {
  const result = __desktopRenderWithGalleryBackdropCleanup.apply(this, args);
  if (state.tab !== 'gallery' || state.galleryCategory !== 'class') {
    const center = document.querySelector('#center');
    center?.style.removeProperty('background-image');
    center?.style.removeProperty('background-size');
    center?.style.removeProperty('background-position');
  }
  return result;
};

let __desktopGalleryFilters = { type: [], cost: [], element: [] };
__desktopGalleryFilters.tags ||= [];
let __desktopGallerySearchQuery = '';
let __desktopGalleryAllRootId = null;
let __desktopGalleryCardClickTimer = null;
const __desktopCardDeleteSelection = new Set();
let __desktopCardDeleteAnchor = null;
let __desktopCardClipboard = [];

function __desktopSelectedCardClipboard() {
  const keys = [...__desktopCardDeleteSelection];
  if (!keys.length) return null;
  const seenIds = new Set();
  const clipboard = [];
  const fields = ['name', 'ruleText', 'flavourText', 'type', 'element', 'cost', 'tags', 'workflowStatus', 'nameFontSize', 'typeFontSize', 'elementFontSize', 'ruleFontSize', 'flavourFontSize', 'ruleTextOffsetY', 'flavourTextOffsetY'];
  for (const key of keys) {
    const [kind, id] = key.split(':', 2);
    const owner = kind === 's' ? getSkill(id) : kind === 'g' ? (data.galleryCards || []).find(card => card.id === id) : null;
    const cardId = kind === 's' ? owner?.cardId : kind === 'g' ? owner?.id : null;
    if (!owner?.card || !cardId || seenIds.has(cardId)) return null;
    seenIds.add(cardId);
    const card = {};
    for (const field of fields) {
      if (!Object.hasOwn(owner.card, field)) continue;
      card[field] = field === 'tags' && Array.isArray(owner.card[field]) ? [...owner.card[field]] : owner.card[field];
    }
    card.name = String(card.name || owner.name || '');
    card.ruleText = String(card.ruleText || '');
    card.flavourText = String(card.flavourText || '');
    card.type = String(card.type || 'Attack');
    card.element = String(card.element || 'Neutral');
    card.cost = String(card.cost ?? '1');
    card.tags = Array.isArray(card.tags) ? card.tags : [];
    card.art = '';
    card.status = 'RASCUNHO';
    clipboard.push(card);
  }
  return clipboard;
}

async function __desktopPasteCards() {
  if (!__desktopCardClipboard.length) return;
  if (__desktopGuidedCard) return toast('Finalize ou cancele a carta em criação antes de colar.');
  if (state.galleryCategory !== 'class') return toast('Selecione a galeria de uma classe para colar as cartas.');
  const selected = getClass(state.galleryClassId) || getClass('base_' + state.gallerySlot);
  if (!selected || !['C1', 'C2', 'C3', 'Spec'].includes(selected.tier)) return toast('Selecione uma classe C1, C2, C3 ou Spec como destino.');
  const root = selected.tier === 'C1' ? selected : rootOf(selected.id);
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  const slot = root ? roots.findIndex(cls => cls.id === root.id) : -1;
  if (slot < 0) return toast('Não foi possível determinar a linhagem da classe de destino.');
  const created = __desktopCardClipboard.map(source => {
    const id = uid();
    const card = JSON.parse(JSON.stringify(source));
    card.status = 'RASCUNHO';
    card.workflowStatus = 'draft';
    card.art = '';
    __desktopSyncCardElementTag(card);
    return {
      id, category: 'class', slot, name: card.name,
      ...(selected.tier !== 'C1' ? { layoutClassId: selected.id } : {}),
      card
    };
  });
  data.galleryCards.push(...created);
  __desktopCardDeleteSelection.clear();
  for (const card of created) __desktopCardDeleteSelection.add('g:' + card.id);
  state.gallerySelected = 'g:' + created[created.length - 1].id;
  __desktopCardDeleteAnchor = state.gallerySelected;
  mutate('Cartas coladas na classe ' + selected.name);
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    toast(`${created.length} carta${created.length === 1 ? '' : 's'} colada${created.length === 1 ? '' : 's'} como rascunho.`);
  } catch (error) {
    toast('Falha ao salvar as cartas coladas: ' + String(error?.message || error));
  }
}

function __desktopGalleryColumns() {
  const saved = Number(data.preferences?.galleryColumns);
  return Number.isInteger(saved) && saved >= 5 && saved <= 10 ? saved : 7;
}

function __desktopGalleryFilterMarkup() {
  const group = (key, label, values) => `<div class="gallery-filter-group" data-gallery-filter-group="${key}" role="group" aria-label="Filtrar por ${label.toLocaleLowerCase()}"><span>${label}</span><div class="gallery-filter-options">${values.map(([value, name]) => `<button type="button" class="gallery-filter-chip" data-gallery-filter-toggle="${key}" data-gallery-filter-value="${escapeHtml(value)}" aria-pressed="${__desktopGalleryFilters[key].includes(value)}" title="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div></div>`;
  const types = [['Class Mechanic', 'MECHANIC'], ['Attack', 'ATTACK'], ['Skill', 'SKILL'], ['Power', 'POWER'], ['Other', 'OTHER']];
  const costs = ['0', '1', '2', '3', '4', '5', 'X'].map(value => [value, value]);
  return `<div class="gallery-filterbar gallery-filterbar-side" role="group" aria-label="Filtros da galeria">${group('type', 'Tipo:', types)}${group('cost', 'Custo:', costs)}<label class="gallery-search-control"><span>Buscar</span><input class="field" id="gallerySearch" type="search" value="${escapeHtml(__desktopGallerySearchQuery)}" placeholder="Nome, texto, elemento…" aria-label="Buscar cartas por nome, texto ou elemento" autocomplete="off"></label><div class="gallery-side-controls" role="group" aria-label="Controles da galeria"></div></div>`;
}

function __desktopGalleryColumnsMarkup() {
  return `<label class="gallery-filter-control gallery-columns-control"><span>Cartas por linha</span><select class="field" id="galleryColumns" aria-label="Cartas por linha">${[5, 6, 7, 8, 9, 10].map(value => `<option value="${value}" ${__desktopGalleryColumns() === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`;
}

function __desktopGalleryTooltip(item) {
  const card = item.card || {};
  const name = card.name || item.name || 'Carta sem nome';
  const type = card.type || 'Skill';
  const cost = card.cost ?? '1';
  const element = card.element || 'Neutral';
  const rule = card.ruleText || 'Sem texto de regra.';
  const flavour = card.flavourText || '';
  return `<span class="gallery-hover-tooltip" role="tooltip"><b>${escapeHtml(name)}</b><span>${escapeHtml(type)} · Custo ${escapeHtml(cost)} · ${escapeHtml(element)}</span><span class="gallery-tooltip-rule">${escapeHtml(rule)}</span>${flavour ? `<i>${escapeHtml(flavour)}</i>` : ''}</span>`;
}

function __desktopDecorateGalleryView() {
  if (state.tab !== 'gallery') return;
  const center = document.querySelector('#center');
  const toolbar = center?.querySelector('.gallery-toolbar');
  if (!center || !toolbar) return;
  center.querySelector('.gallery-filterbar')?.remove();
  const panel = document.querySelector('#tagpanel');
  panel?.querySelector('.gallery-filterbar-side')?.remove();
  panel?.insertAdjacentHTML('beforeend', __desktopGalleryFilterMarkup());
  const filterbar = panel?.querySelector('.gallery-filterbar-side');
  const controlbar = filterbar?.querySelector('.gallery-side-controls');
  if (!toolbar.querySelector('#galleryColumns')) toolbar.querySelector('.spacer')?.insertAdjacentHTML('beforebegin', __desktopGalleryColumnsMarkup());
  const category = toolbar.querySelector('#galleryCategory');
  const allClasses = toolbar.querySelector('[data-action="gallery-all"]');
  const columns = toolbar.querySelector('#galleryColumns')?.closest('.gallery-columns-control');
  toolbar.querySelectorAll('[data-action="gallery-add"]').forEach(button => button.remove());
  toolbar.querySelector('.gallery-caption')?.remove();
  toolbar.querySelector('.spacer')?.remove();
  for (const control of [category, allClasses, columns]) if (control && controlbar) controlbar.append(control);
  if (allClasses) allClasses.setAttribute('aria-label', state.galleryAll ? 'Mostrar apenas a seleção atual' : 'Mostrar cartas de todas as classes');
  if (category) category.classList.add('gallery-category-control');
  toolbar.remove();
  const items = galleryItems();
  if (state.galleryCategory !== 'class') __desktopUrgentRenderClassThumbnails();
  __desktopApplyGalleryFilters(center, items);
}

function __desktopApplyGalleryFilters(center = document.querySelector('#center'), items = galleryItems()) {
  if (!center || state.tab !== 'gallery') return;
  const itemMap = new Map(items.map(item => [`${item.kind}:${item.id}`, item]));
  const grid = center.querySelector('.gallery-cardgrid');
  if (grid) grid.style.setProperty('--gallery-columns', String(__desktopGalleryColumns()));
  const query = __desktopGallerySearchQuery.trim().normalize('NFKC').toLocaleLowerCase();
  let visible = 0;
  const filterActive = Object.values(__desktopGalleryFilters).some(values => values.length) || query.length > 0;
  for (const tile of center.querySelectorAll('.gallery-card[data-gallery-card]')) {
    const item = itemMap.get(tile.dataset.galleryCard);
    if (!item) continue;
    if (tile.dataset.galleryTooltipPositionHandler !== 'true') {
      tile.dataset.galleryTooltipPositionHandler = 'true';
      tile.addEventListener('mouseenter', () => __desktopShowGalleryTooltip(tile, item));
      tile.addEventListener('mouseleave', __desktopHideGalleryTooltip);
      tile.addEventListener('focus', () => __desktopShowGalleryTooltip(tile, item));
      tile.addEventListener('blur', __desktopHideGalleryTooltip);
    }
    const card = item.card || {};
    tile.classList.toggle('gallery-card-gpt-draft', String(card.name || item.name || '').startsWith('☺'));
    const searchable = [card.name, item.name, card.ruleText, card.flavourText, card.type, card.element, ...(Array.isArray(card.tags) ? card.tags : [])].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
    const matches = (!__desktopGalleryFilters.type.length || __desktopGalleryFilters.type.some(value => String(card.type || 'Skill').toLocaleLowerCase() === value.toLocaleLowerCase()))
      && (!__desktopGalleryFilters.cost.length || __desktopGalleryFilters.cost.some(value => String(card.cost ?? '1').toLocaleLowerCase() === value.toLocaleLowerCase()))
      && (!__desktopGalleryFilters.element.length || __desktopGalleryFilters.element.some(value => String(card.element || 'Neutral').toLocaleLowerCase() === value.toLocaleLowerCase()))
      && (!__desktopGalleryFilters.tags.length || __desktopGalleryFilters.tags.every(value => (Array.isArray(card.tags) && card.tags.includes(value)) || String(card.element || '').toLocaleLowerCase() === value.toLocaleLowerCase()))
      && (!query || searchable.includes(query));
    tile.hidden = !matches;
    tile.setAttribute('aria-hidden', String(!matches));
    tile.tabIndex = matches ? 0 : -1;
    if (matches) visible++;
    tile.setAttribute('aria-label', `${card.name || item.name || 'Carta'}, custo ${card.cost ?? '1'}, ${card.type || 'Skill'}, ${card.element || 'Neutral'}`);
    tile.title = `${card.name || item.name || 'Carta'} · ${card.type || 'Skill'} · Custo ${card.cost ?? '1'} · ${card.element || 'Neutral'}`;
    tile.querySelector('.gallery-hover-tooltip')?.remove();
    tile.__lcsGalleryItem = item;
    tile.removeAttribute('title');
    const cardPreview = tile.querySelector('.playcard[data-card-layout]');
    if (cardPreview) cardPreview.setAttribute('aria-hidden', 'true');
  }
  center.querySelector('#galleryFilterEmpty')?.remove();
  if (items.length && visible === 0) {
    const empty = document.createElement('div');
    empty.id = 'galleryFilterEmpty'; empty.className = 'gallery-empty'; empty.setAttribute('role', 'status');
    empty.textContent = 'Nenhuma carta corresponde aos filtros selecionados.';
    center.querySelector('.gallery-scroll')?.append(empty);
  }
  const count = center.querySelector('.gallery-sectiontop .count');
  if (count) {
    if (!count.dataset.galleryDefaultText) count.dataset.galleryDefaultText = count.textContent;
    count.textContent = filterActive ? `${visible} DE ${items.length} CARTAS · FILTRO` : count.dataset.galleryDefaultText;
  }
}

const __desktopGalleryDisplayStyle = document.createElement('style');
__desktopGalleryDisplayStyle.id = 'desktopGalleryDisplayStyle';
__desktopGalleryDisplayStyle.textContent = `
.gallery-filterbar{min-height:calc(42px * var(--S));display:flex;align-items:center;flex-wrap:wrap;gap:calc(8px * var(--S)) calc(12px * var(--S));padding:calc(5px * var(--S)) calc(14px * var(--S));box-sizing:border-box;flex:none;background:#091d29;border-bottom:1px solid #244758}
.gallery-filterbar.gallery-filterbar-side{position:absolute;z-index:11;left:-1px;right:-1px;top:calc(100% + 3px);width:auto;min-height:0;display:flex;flex-direction:column;align-items:stretch;gap:calc(6px * var(--S));padding:calc(7px * var(--S));border:1px solid #31596d;border-top:1px solid #31596d;border-radius:0 0 calc(4px * var(--S)) calc(4px * var(--S));background:#0a1c27f5;box-shadow:0 8px 18px #0009}
.gallery-filterbar-side .gallery-filter-group{display:grid;grid-template-columns:calc(54px * var(--S)) minmax(0,1fr);align-items:center;gap:calc(6px * var(--S));width:100%}
.gallery-filterbar-side .gallery-filter-group>span{white-space:nowrap}
.gallery-filterbar-side .gallery-filter-options{flex-wrap:wrap;align-content:flex-start;gap:calc(4px * var(--S));min-width:0;overflow:visible}
.gallery-filterbar-side .gallery-filter-chip{min-width:calc(36px * var(--S));height:calc(26px * var(--S));padding:0 calc(8px * var(--S));font-size:calc(12px * var(--S))}
#tagpanel .tagrow[data-family="elements"] .tagcell[data-gallery-filter-toggle="element"][aria-pressed="true"]{border-color:#39c9eb;color:#f1fcff;background:#087a9a;box-shadow:inset 0 0 0 1px #75e4ff}
.gallery-search-control{display:grid;grid-template-columns:calc(54px * var(--S)) minmax(0,1fr);align-items:center;gap:calc(6px * var(--S));color:#f3f0e5;font:700 calc(14px * var(--S)) Arial,sans-serif;letter-spacing:.03em;text-transform:uppercase}
.gallery-search-control input{min-width:0;width:100%;height:calc(30px * var(--S));box-sizing:border-box;padding:0 calc(8px * var(--S));font-size:calc(12px * var(--S));text-transform:none;letter-spacing:normal}
.gallery-side-controls{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:calc(5px * var(--S));width:100%;padding-top:calc(4px * var(--S));border-top:1px solid #244758}
.gallery-side-controls #galleryCategory{width:100%;min-width:0;height:calc(30px * var(--S));font-size:calc(12px * var(--S))}
.gallery-side-controls .globebtn{width:calc(30px * var(--S));height:calc(28px * var(--S));padding:0;font-size:calc(15px * var(--S))}
.gallery-side-controls .gallery-columns-control{margin:0;gap:calc(4px * var(--S));white-space:nowrap;font-size:calc(9px * var(--S))}
.gallery-side-controls .gallery-columns-control select{width:calc(48px * var(--S));height:calc(28px * var(--S))}
#app.gallery-tab-active #tagpanel{height:calc(132px * var(--S))!important}
#app.gallery-tab-active #tagrows{height:calc(100% - 32px * var(--S))!important;grid-template-rows:repeat(3,minmax(0,1fr))!important}
#app.gallery-tab-active #tagrows .tagrow[data-family="stats"],#app.gallery-tab-active #tagrows .tagrow[data-family="armor"],#app.gallery-tab-active #tagrows .tagrow[data-family="melee"],#app.gallery-tab-active #tagrows .tagrow[data-family="ranged"],#app.gallery-tab-active #tagrows .tagrow[data-family="other"],#app.gallery-tab-active #tagrows .tagrow[data-family="traits"],#app.gallery-tab-active #tagrows .tagrow[data-family="custom"]{display:none!important}
.gallery-filter-group{display:flex;align-items:center;gap:calc(5px * var(--S));color:#f3f0e5;font:700 calc(14px * var(--S)) Arial,sans-serif;letter-spacing:.03em;text-transform:uppercase}
.gallery-filter-options{display:flex;align-items:center;gap:calc(3px * var(--S))}
.gallery-filter-chip{min-width:calc(25px * var(--S));height:calc(32px * var(--S));padding:0 calc(8px * var(--S));border:1px solid #837548;border-radius:2px;background:#131313;color:#f3f0e5;font:700 calc(13px * var(--S)) Arial,sans-serif;cursor:pointer}
.gallery-filter-chip:hover{border-color:#e4c25a;color:#fffaf0;background:#2d2618}
.gallery-filter-chip[aria-pressed="true"]{border-color:#f0cf62;color:#fff9de;background:#67552a;box-shadow:inset 0 0 0 1px #ffe889}
.gallery-filter-chip:focus-visible{outline:2px solid #72ddfa;outline-offset:1px}
.gallery-filter-control{display:flex;align-items:center;gap:calc(5px * var(--S));color:#92b5c4;font:700 calc(9px * var(--S)) Arial,sans-serif;letter-spacing:.05em;text-transform:uppercase}
.gallery-filter-control select{width:calc(54px * var(--S));height:calc(27px * var(--S));padding:0 calc(7px * var(--S));font-size:calc(10px * var(--S));letter-spacing:normal;text-transform:none}
.gallery-columns-control{margin-left:auto}
.gallery-toolbar .gallery-columns-control{margin:0 calc(10px * var(--S)) 0 0;white-space:nowrap}
#app.gallery-class-mode #center .gallery-toolbar{display:none!important}
#app.gallery-class-mode .gallery-sectiontop{display:none!important}
#app.gallery-class-mode #center .gallery-scroll{padding:calc(12px * var(--S)) calc(20px * var(--S))}
.gallery-class-mode .gallery-cardgrid,.gallery-cardgrid{grid-template-columns:repeat(var(--gallery-columns,7),minmax(0,1fr));gap:calc(18px * var(--S)) calc(12px * var(--S));padding-right:0!important;align-items:start}
#app.gallery-class-mode .gallery-cardgrid{row-gap:calc(26px * var(--S));column-gap:calc(18px * var(--S));padding-right:calc(72px * var(--S))!important}
#artbody.gallery-artbody #artCardPreview{box-sizing:border-box;min-width:0;min-height:0;overflow:hidden;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
button.gallery-card{min-width:0;min-height:0;height:auto;padding:0;border:1px solid #34596a;border-radius:calc(5px * var(--S));overflow:visible;background:transparent;display:block;box-shadow:none;-webkit-user-select:none;user-select:none}
button.gallery-card *{-webkit-user-select:none;user-select:none}
button.gallery-card:focus-visible{outline:1px solid #e6c773;outline-offset:1px;box-shadow:0 0 0 1px #e1ba52,0 0 22px #d8ae4b24}
button.gallery-card .gallery-rarity,button.gallery-card>b,button.gallery-card>small{display:none!important}
.gallery-card .gallery-art{width:100%;height:auto!important;aspect-ratio:227.14/318;box-sizing:border-box;border:0;border-radius:calc(4px * var(--S));background:transparent;overflow:visible}
.gallery-card .gallery-art .gallery-card-preview{border-radius:calc(4px * var(--S))}
.gallery-card.gallery-card-gpt-draft .gallery-art{opacity:.7;transition:opacity .16s ease}
.gallery-card .gallery-art .playcard[data-card-layout]{filter:drop-shadow(0 4px 7px #000a)}
.gallery-card:hover .gallery-art .playcard[data-card-layout]{filter:drop-shadow(0 6px 12px #000d) brightness(1.06)}
.gallery-card[hidden]{display:none!important}
.gallery-hover-tooltip{display:none;position:absolute;z-index:100;left:calc(100% - 12px * var(--S));top:calc(14px * var(--S));width:calc(245px * var(--S));max-width:min(34vw,calc(300px * var(--S)));max-height:min(42vh,calc(420px * var(--S)));overflow-y:auto;box-sizing:border-box;padding:calc(10px * var(--S));border:1px solid #876e42;border-radius:calc(4px * var(--S));background:linear-gradient(145deg,#34201d,#1b1517);box-shadow:0 8px 24px #000c;color:#f6ead6;text-align:left;white-space:normal;pointer-events:none;font:calc(12px * var(--S)) Georgia,serif}
.gallery-hover-tooltip.gallery-tooltip-flip{left:auto;right:calc(100% - 12px * var(--S))}
.gallery-hover-tooltip.gallery-tooltip-above{top:auto;bottom:calc(14px * var(--S))}
.gallery-hover-tooltip b,.gallery-hover-tooltip span,.gallery-hover-tooltip i{display:block!important;margin:0!important;padding:0!important;color:inherit!important;font:inherit!important;line-height:1.35}
.gallery-hover-tooltip b{color:#f1cc67!important;font-size:calc(15px * var(--S))!important;margin-bottom:calc(3px * var(--S))!important}
.gallery-hover-tooltip .gallery-tooltip-rule{margin-top:calc(6px * var(--S))!important}
.gallery-hover-tooltip i{margin-top:calc(5px * var(--S))!important;color:#d9c5a7!important}
.gallery-card:hover .gallery-hover-tooltip,.gallery-card:focus-visible .gallery-hover-tooltip{display:block}
 #artCardPreview .playcard-layout-cost,#artCardPreview .playcard-layout-title,#artCardPreview .playcard-layout-type,#artCardPreview .playcard-layout-rules,#artCardPreview .playcard-layout-flavour,#artCardPreview .playcard-art-window,#artCardPreview .playcard-art-window img,#artCardPreview [alt^="Elemento "]{pointer-events:auto!important;cursor:pointer}
 #artCardPreview .playcard-layout-cost:hover,#artCardPreview .playcard-layout-title:hover,#artCardPreview .playcard-layout-type:hover,#artCardPreview .playcard-layout-rules:hover,#artCardPreview .playcard-layout-flavour:hover{outline:1px solid #69daf4;outline-offset:1px}
`;
document.head.append(__desktopGalleryDisplayStyle);

function __desktopFitGalleryTooltip(tile) {
  const tooltip = tile?.querySelector('.gallery-hover-tooltip');
  const scroller = tile?.closest('.gallery-scroll');
  if (!tooltip || !scroller) return;
  tooltip.classList.remove('gallery-tooltip-flip', 'gallery-tooltip-above');
  const scale = Math.max(1, Number.parseFloat(getComputedStyle(tile).getPropertyValue('--S')) || 1);
  const rect = scroller.getBoundingClientRect();
  const clip = {
    left: rect.left + scroller.clientLeft,
    top: rect.top + scroller.clientTop,
    right: rect.left + scroller.clientLeft + scroller.clientWidth,
    bottom: rect.top + scroller.clientTop + scroller.clientHeight
  };
  const margin = 8 * scale;
  let tip = tooltip.getBoundingClientRect();
  if (tip.right > clip.right - margin) tooltip.classList.add('gallery-tooltip-flip');
  tip = tooltip.getBoundingClientRect();
  if (tip.bottom > clip.bottom - margin) tooltip.classList.add('gallery-tooltip-above');
}

document.addEventListener('scroll', () => {
  const tile = document.querySelector('.gallery-card[data-gallery-card]:hover');
  if (tile) __desktopFitGalleryTooltip(tile);
}, true);
window.addEventListener('resize', () => {
  const tile = document.querySelector('.gallery-card[data-gallery-card]:hover');
  if (tile) __desktopFitGalleryTooltip(tile);
}, { passive: true });

const __desktopOriginalGalleryViewForControls = galleryView;
galleryView = function (...args) {
  const result = __desktopOriginalGalleryViewForControls.apply(this, args);
  __desktopDecorateGalleryView();
  return result;
};

const __desktopOriginalGalleryChangeForControls = eventChange;
eventChange = function (event) {
  const target = event.target;
  if (target?.id === 'galleryColumns') {
    const columns = Number(target.value);
    if (!Number.isInteger(columns) || columns < 5 || columns > 10) return;
    data.preferences = { ...(data.preferences || {}), galleryColumns: columns };
    const grid = document.querySelector('.gallery-cardgrid');
    grid?.style.setProperty('--gallery-columns', String(columns));
    if (grid) void grid.offsetWidth;
    __desktopFitGalleryCardThumbnails();
    __desktopScheduleUiPreferenceCommit(true);
    return;
  }
  return __desktopOriginalGalleryChangeForControls(event);
};

document.addEventListener('input', event => {
  const target = event.target;
  if (target?.id !== 'gallerySearch' || state.tab !== 'gallery') return;
  __desktopGallerySearchQuery = target.value;
  __desktopApplyGalleryFilters();
}, true);
document.addEventListener('input', event => {
  const target = event.target;
  if (state.tab !== 'gallery' || target?.dataset?.galleryEdit !== 'name') return;
  const tile = state.gallerySelected
    ? document.querySelector(`.gallery-card[data-gallery-card="${CSS.escape(state.gallerySelected)}"]`)
    : null;
  tile?.classList.toggle('gallery-card-gpt-draft', String(target.value || '').startsWith('☺'));
}, true);

document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-gallery-filter-toggle][data-gallery-filter-value]');
  if (!toggle || state.tab !== 'gallery') return;
  if (toggle.dataset.galleryFilterToggle === 'element' && state.tagMode !== 'filter') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const group = toggle.dataset.galleryFilterToggle;
  const value = toggle.dataset.galleryFilterValue;
  if (!Object.hasOwn(__desktopGalleryFilters, group)) return;
  const selectedValues = __desktopGalleryFilters[group];
  __desktopGalleryFilters[group] = selectedValues.includes(value)
    ? selectedValues.filter(item => item !== value)
    : [...selectedValues, value];
  if (group === 'element') for (const button of document.querySelectorAll('#tagrows .tagrow[data-family="elements"] .tagcell[data-gallery-filter-toggle="element"]')) button.setAttribute('aria-pressed', String(__desktopGalleryFilters.element.includes(button.dataset.galleryFilterValue)));
  const selected = state.gallerySelected;
  galleryView(); galleryInspect(); artPanel();
  state.gallerySelected = selected;
}, true);

document.addEventListener('click', event => {
  const tile = event.target.closest('.gallery-card[data-gallery-card]');
  if (!tile || state.tab !== 'gallery' || event.button !== 0) return;
  event.preventDefault(); event.stopImmediatePropagation();
  clearTimeout(__desktopGalleryCardClickTimer);
  const key = tile.dataset.galleryCard;
  if (__desktopGalleryFocusKey) {
    state.gallerySelected = key;
    __desktopCloseGalleryFocus();
    galleryInspect(); artPanel();
    return;
  }
  if (event.detail > 1) { state.gallerySelected = key; return; }
  if (event.ctrlKey || event.metaKey) {
    if (__desktopCardDeleteSelection.has(key)) __desktopCardDeleteSelection.delete(key);
    else __desktopCardDeleteSelection.add(key);
  } else {
    __desktopCardDeleteSelection.clear();
    __desktopCardDeleteSelection.add(key);
  }
  state.gallerySelected = key;
  __desktopCardDeleteAnchor = key;
  __desktopGalleryFocusKey = key;
  galleryView(); galleryInspect(); artPanel();
}, true);

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action="gallery-delete"]');
  if (!button || state.tab !== 'gallery' || button.disabled) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const key = state.gallerySelected;
  if (!key) return;
  if (!__desktopCardDeleteSelection.has(key)) {
    __desktopCardDeleteSelection.clear();
    __desktopCardDeleteSelection.add(key);
    __desktopCardDeleteAnchor = key;
    __desktopRefreshCardHighlights();
  }
  __desktopOpenCardDeleteDialog();
}, true);

document.addEventListener('keydown', event => {
  const form = document.querySelector('#modalForm');
  if (__desktopPendingCardDelete && form?.matches('[data-desktop-card-delete="true"]')) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      __desktopCancelCardDelete();
    } else if (event.key === 'Enter' || event.key === 'Delete') {
      event.preventDefault(); event.stopImmediatePropagation();
      void __desktopCommitCardDelete();
    }
    return;
  }
  if (document.querySelector('#modal')?.children.length) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (target?.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]')) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && state.tab === 'gallery') {
    const key = event.key.toLowerCase();
    if (key === 'c' || key === 'x') {
      if (!__desktopCardDeleteSelection.size) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const clipboard = __desktopSelectedCardClipboard();
      if (!clipboard) return toast('A seleção contém uma carta que não pode ser copiada.');
      if (key === 'c') {
        __desktopCardClipboard = clipboard;
        toast(`${clipboard.length} carta${clipboard.length === 1 ? '' : 's'} copiada${clipboard.length === 1 ? '' : 's'}; selecione a classe de destino e use Ctrl+V.`);
      } else __desktopOpenCardDeleteDialog(clipboard);
      return;
    }
    if (key === 'v' && __desktopCardClipboard.length) {
      event.preventDefault(); event.stopImmediatePropagation();
      void __desktopPasteCards();
      return;
    }
  }
  if (event.key !== 'Delete' || state.tab !== 'gallery' || !__desktopCardDeleteSelection.size) return;
  event.preventDefault(); event.stopImmediatePropagation();
  __desktopOpenCardDeleteDialog();
}, true);

document.addEventListener('dblclick', event => {
  if (state.tab !== 'gallery') return;
  const art = event.target.closest('.gallery-card .gallery-art,#inspect .gallery-hero,#artCardPreview .playcard-art-window');
  if (!art) return;
  event.preventDefault(); event.stopImmediatePropagation();
  clearTimeout(__desktopGalleryCardClickTimer); __desktopGalleryCardClickTimer = null;
  const tile = art.closest('.gallery-card[data-gallery-card]');
  if (tile) state.gallerySelected = tile.dataset.galleryCard;
  const selected = getGallerySelection();
  if (selected?.card?.status === 'CONFIRMADO') return toast('Desconfirme a carta antes de substituir a arte aprovada.');
  const picker = document.querySelector('#galleryArtUpload');
  if (picker && !picker.disabled) picker.click();
}, true);

document.addEventListener('click', event => {
  if (state.tab !== 'gallery') return;
  const preview = event.target.closest('#artCardPreview .playcard');
  if (!preview) return;
  const target = event.target;
  const field = target.closest('.playcard-layout-cost') ? 'cost'
    : target.closest('.playcard-layout-title') ? 'name'
      : target.closest('.playcard-layout-element') ? 'element'
      : target.closest('.playcard-layout-type') ? 'type'
        : target.closest('.playcard-layout-rules') ? 'ruleText'
          : target.closest('.playcard-layout-flavour') ? 'flavourText'
            : target.closest('[alt^="Elemento "]') ? 'element' : '';
  if (!field) return;
  const editor = document.querySelector(`#inspect [data-gallery-edit="${field}"]`);
  if (!editor || editor.disabled) return;
  event.preventDefault(); event.stopImmediatePropagation();
  editor.focus();
  if (editor instanceof HTMLSelectElement && typeof editor.showPicker === 'function') {
    try { editor.showPicker(); } catch {}
  } else if (editor instanceof HTMLInputElement) editor.select();
  else if (editor instanceof HTMLTextAreaElement) editor.setSelectionRange(editor.value.length, editor.value.length);
}, true);

const __desktopGalleryOriginalInspectCompact = galleryInspect;
galleryInspect = function (...args) {
  return __desktopGalleryOriginalInspectCompact.apply(this, args);
};

function __desktopFitCardDescriptions(root = document) {
  if (!root) return;
  const cards = root.matches?.('.playcard') ? [root] : root.querySelectorAll?.('.playcard[data-card-layout]') || [];
  for (const card of cards) {
    for (const [selector, floorRatio] of [['.playcard-layout-title', .58], ['.playcard-layout-rules', .52], ['.playcard-layout-flavour', .48]]) {
      const field = card.querySelector(selector);
      if (!field) continue;
      const originalFontSize = field.dataset.fitBaseFontStyle ?? field.style.fontSize;
      field.dataset.fitBaseFontStyle = originalFontSize;
      if (originalFontSize) field.style.fontSize = originalFontSize;
      else field.style.removeProperty('font-size');
      const base = Number.parseFloat(getComputedStyle(field).fontSize) || 8;
      field.dataset.fitBaseFontSize = String(base);
      if (!field.textContent.trim()) continue;
      const minimum = Math.max(4, base * floorRatio);
      const maximum = selector === '.playcard-layout-title' ? base : base * 1.6;
      let low = minimum;
      let high = maximum;
      let size = minimum;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = (low + high) / 2;
        field.style.fontSize = `${candidate}px`;
        if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) {
          size = candidate;
          low = candidate;
        } else {
          high = candidate;
        }
      }
      field.style.fontSize = `${size}px`;
      field.dataset.fitFontSize = String(size);
    }
  }
}

function __desktopGalleryTooltipElement() {
  let tooltip = document.querySelector('#galleryFloatingTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'galleryFloatingTooltip';
    tooltip.className = 'gallery-hover-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
  }
  return tooltip;
}

function __desktopShowGalleryTooltip(tile, item) {
  if (!tile?.isConnected || !item) return;
  const tooltip = __desktopGalleryTooltipElement();
  const template = document.createElement('template');
  template.innerHTML = __desktopGalleryTooltip(item);
  tooltip.replaceChildren(...template.content.firstElementChild.childNodes);
  tooltip.hidden = false;
  tile.setAttribute('aria-describedby', tooltip.id);
  const card = tile;
  const rect = card.getBoundingClientRect();
  const margin = 8;
  const boundsWidth = window.innerWidth;
  const boundsHeight = window.innerHeight;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = rect.right + margin;
  if (left + width > boundsWidth - margin) left = rect.left - width - margin;
  left = Math.max(margin, Math.min(boundsWidth - width - margin, left));
  let top = rect.top + 14;
  if (top + height > boundsHeight - margin) top = rect.bottom - height - 14;
  top = Math.max(margin, Math.min(boundsHeight - height - margin, top));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function __desktopHideGalleryTooltip() {
  const tooltip = document.querySelector('#galleryFloatingTooltip');
  tooltip?.setAttribute('hidden', '');
  document.querySelector('.gallery-card[aria-describedby="galleryFloatingTooltip"]')?.removeAttribute('aria-describedby');
}

function __desktopRefreshCardHighlights() {
  if (state.tab !== 'gallery') {
    __desktopCardDeleteSelection.clear();
    __desktopCardDeleteAnchor = null;
  } else if (state.gallerySelected !== __desktopCardDeleteAnchor) {
    __desktopCardDeleteSelection.clear();
    if (state.gallerySelected) __desktopCardDeleteSelection.add(state.gallerySelected);
    __desktopCardDeleteAnchor = state.gallerySelected;
  }
  for (const tile of document.querySelectorAll('.gallery-card[data-gallery-card]')) {
    const selected = __desktopCardDeleteSelection.has(tile.dataset.galleryCard);
    tile.classList.toggle('selected', selected);
    tile.setAttribute('aria-pressed', String(selected));
    tile.classList.toggle('highlight-4', selected);
  }
}

const __desktopClassHighlightStyle = document.createElement('style');
__desktopClassHighlightStyle.id = 'desktopClassHighlightStyle';
__desktopClassHighlightStyle.textContent = `
#urgentClassRails{position:absolute;inset:0;display:grid;grid-template-columns:repeat(15,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:calc(6px * var(--S));padding:calc(3px * var(--S)) calc(6px * var(--S));box-sizing:border-box}
.urgent-class-block{position:relative;isolation:isolate;display:grid;grid-template-rows:calc(26px * var(--S)) minmax(0,1fr);gap:calc(3px * var(--S));min-width:0;min-height:0;padding:calc(1px * var(--S));box-sizing:border-box;background:#06172088}
.urgent-class-block::before{content:"";position:absolute;z-index:0;inset:0;background-image:var(--class-block-bg);background-size:cover;background-position:center;opacity:.5;pointer-events:none}
.urgent-class-block>*{position:relative;z-index:1;min-width:0;min-height:0}
.urgent-class-top{position:relative;min-width:0;min-height:0}
.urgent-class-top>.urgent-class-slot{width:100%;height:100%;padding-right:calc(28px * var(--S))}
#urgentClassRails .urgent-class-top>.urgent-class-all{position:absolute!important;z-index:999!important;pointer-events:auto!important}
#urgentClassRails .urgent-class-top>.urgent-class-slot{z-index:0!important}
.urgent-class-subgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(3px * var(--S));min-height:0}
.urgent-class-path{display:grid;grid-template-rows:calc(25px * var(--S)) minmax(0,1fr);gap:calc(3px * var(--S));min-width:0;min-height:0}
.urgent-c3-branch{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:calc(3px * var(--S));min-width:0;min-height:0}
.urgent-class-slot{position:relative;z-index:1;appearance:none;min-width:0;min-height:0;overflow:hidden;display:flex;align-items:center;gap:calc(2px * var(--S));padding:calc(2px * var(--S));border:1px solid #183a4c;border-radius:3px;background:#0b202c88;color:#c0d8e2;text-align:left;font:700 calc(8px * var(--S)) Arial,sans-serif;cursor:pointer;transition:background-color .15s,border-color .15s,box-shadow .15s,filter .15s}
.urgent-class-slot img{width:calc(16px * var(--S));height:calc(18px * var(--S));margin-left:calc(-2px * var(--S));flex:none;object-fit:contain}
.urgent-class-slot .urgent-class-fallback{width:calc(16px * var(--S));height:calc(18px * var(--S));flex:none;font-size:calc(12px * var(--S))}
.urgent-class-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.urgent-class-all{position:absolute;z-index:12;right:calc(2px * var(--S));top:50%;transform:translateY(-50%);width:calc(24px * var(--S));height:calc(17px * var(--S));padding:0;border:1px solid #d9b759;border-radius:2px;background:#281f0f;color:#ffe28a;font:700 calc(8px * var(--S)) Arial,sans-serif;cursor:pointer;pointer-events:auto}
.urgent-class-all:hover{background:#58451d;color:#fff2c3}
.urgent-rail-c3 .urgent-class-slot{font-size:calc(7px * var(--S))}
.urgent-class-slot.highlight-1,.gallery-card.highlight-1{border-color:#56bad4;box-shadow:0 0 5px 1px #5bd1ef55}
.urgent-class-slot.highlight-2,.gallery-card.highlight-2{border-color:#72e5ff;background-color:#15506a;box-shadow:0 0 9px 2px #41c9ebaa;filter:brightness(1.12)}
.gallery-card.highlight-fade{transition:border-color 1s ease-out,box-shadow 1s ease-out,filter 1s ease-out,background-color 1s ease-out!important}
.urgent-class-slot.highlight-3{border-color:#f0c854;background-color:#59461c;color:#fff2bc;box-shadow:0 0 11px 3px #f1c95799;filter:brightness(1.15)}
.urgent-class-slot.highlight-4,.urgent-class-all.highlight-4,.gallery-card.highlight-4{position:relative;z-index:8;overflow:visible;border-color:#ffe276;background-color:#58451b;color:#fff8d8;box-shadow:none}
.urgent-class-slot.highlight-4,.urgent-class-all.highlight-4{animation:lcs-highlight-pulse 4s ease-in-out infinite!important}
.gallery-card.highlight-4{animation:lcs-highlight-pulse 4s ease-in-out infinite!important}
@keyframes lcs-highlight-pulse{0%,100%{box-shadow:0 0 7px 2px #71dcf288,0 0 12px 3px #f5d36744}50%{box-shadow:0 0 17px 7px #71dcf2dd,0 0 30px 12px #f5d36799}}
.gallery-class-mode .gallery-scroll{background:transparent!important}
.gallery-class-mode #center{background-color:#06151c}
#app.matrix #c1list button.c1item{min-width:calc(102px * var(--S))!important}
.gallery-cardgrid{grid-template-columns:repeat(var(--gallery-columns,7),minmax(0,1fr))!important;align-items:start}
.gallery-class-mode .gallery-cardgrid{grid-template-columns:repeat(var(--gallery-columns,7),minmax(0,1fr))!important;padding-right:calc(72px * var(--S))!important}
.gallery-card .gallery-art{width:100%;height:auto!important;aspect-ratio:227.14/318;overflow:hidden!important}
.gallery-card .gallery-art .gallery-card-preview{overflow:hidden!important}
.gallery-card .gallery-art .playcard[data-card-layout]{transform-origin:center center!important;transform-box:border-box;}
.gallery-hover-tooltip{display:block;position:fixed;z-index:2147483647;left:0;top:0;width:calc(245px * var(--S));max-width:min(34vw,calc(300px * var(--S)));max-height:min(42vh,calc(420px * var(--S)));overflow:auto;box-sizing:border-box;padding:calc(10px * var(--S));border:1px solid #876e42;border-radius:calc(4px * var(--S));background:linear-gradient(145deg,#34201d,#1b1517);box-shadow:0 8px 24px #000;color:#f6ead6;text-align:left;white-space:normal;pointer-events:none;font:calc(12px * var(--S)) Georgia,serif}
.gallery-hover-tooltip[hidden]{display:none!important}
.gallery-hover-tooltip b,.gallery-hover-tooltip span,.gallery-hover-tooltip i{display:block!important;margin:0!important;padding:0!important;color:inherit!important;font:inherit!important;line-height:1.35}
.gallery-hover-tooltip b{color:#f1cc67!important;font-size:calc(15px * var(--S))!important;margin-bottom:calc(3px * var(--S))!important}
.gallery-hover-tooltip .gallery-tooltip-rule{margin-top:calc(6px * var(--S))!important}
.gallery-hover-tooltip i{margin-top:calc(5px * var(--S))!important;color:#d9c5a7!important}
.playcard-layout-rules,.playcard-layout-flavour,.playcard-layout-title{overflow:hidden!important;overflow-wrap:anywhere;word-break:normal;box-sizing:border-box}
`;
document.head.append(__desktopClassHighlightStyle);

const __desktopButtonSounds = {
  hover: new Audio('lcs-app://app/assets/sfx/soft.mp3'),
  click: new Audio('lcs-app://app/assets/sfx/click.mp3')
};
function __desktopPlayButtonSound(kind) {
  if (lcsDesktop.mode.qa || lcsDesktop.mode.smoke || lcsDesktop.mode.hidden) return;
  const sound = __desktopButtonSounds[kind];
  if (!sound) return;
  const masterVolume = Math.max(0, Math.min(100, Number(data.preferences?.uiSoundVolume ?? 100))) / 100;
  sound.pause(); sound.currentTime = 0; sound.volume = (kind === 'hover' ? .24 : .34) * masterVolume;
  sound.play().catch(() => {});
}
const __desktopHighlightTimers = new Map();
function __desktopClearHighlightTimers(target) {
  const timers = __desktopHighlightTimers.get(target);
  if (timers) { clearTimeout(timers.hold); clearTimeout(timers.fade); }
  __desktopHighlightTimers.delete(target);
}
document.addEventListener('pointerover', event => {
  const button = event.target.closest('button:not(:disabled)');
  if (button && !button.contains(event.relatedTarget)) __desktopPlayButtonSound('hover');
  const target = event.target.closest('.urgent-class-slot,.urgent-class-all,.gallery-card[data-gallery-card]');
  if (!target || target.contains(event.relatedTarget)) return;
  __desktopClearHighlightTimers(target);
  target.classList.remove('highlight-1', 'highlight-fade');
  if (!target.classList.contains('highlight-3') && !target.classList.contains('highlight-4')) target.classList.add('highlight-2');
}, true);
document.addEventListener('pointerout', event => {
  const target = event.target.closest('.urgent-class-slot,.urgent-class-all,.gallery-card[data-gallery-card]');
  if (!target || target.contains(event.relatedTarget)) return;
  target.classList.remove('highlight-2');
  if (target.classList.contains('highlight-3') || target.classList.contains('highlight-4')) return;
  target.classList.add('highlight-1');
  __desktopClearHighlightTimers(target);
  const timers = { hold: null, fade: null };
  timers.hold = setTimeout(() => {
    if (!target.isConnected || target.matches(':hover') || target.classList.contains('highlight-4')) {
      __desktopHighlightTimers.delete(target);
      return;
    }
    if (target.matches('.gallery-card[data-gallery-card]')) {
      target.classList.add('highlight-fade');
      target.classList.remove('highlight-1');
      timers.fade = setTimeout(() => {
        target.classList.remove('highlight-fade');
        __desktopHighlightTimers.delete(target);
      }, 1000);
    } else {
      target.classList.remove('highlight-1');
      __desktopHighlightTimers.delete(target);
    }
  }, 2000);
  __desktopHighlightTimers.set(target, timers);
}, true);
document.addEventListener('click', event => {
  if (event.target.closest('button:not(:disabled)')) __desktopPlayButtonSound('click');
}, true);

const __desktopDecorateWithFloatingTooltips = __desktopDecorateGalleryView;
__desktopDecorateGalleryView = function (...args) {
  const result = __desktopDecorateWithFloatingTooltips.apply(this, args);
  __desktopRefreshCardHighlights();
  return result;
};
document.addEventListener('scroll', () => {
  const tooltip = document.querySelector('#galleryFloatingTooltip');
  const tile = document.querySelector('.gallery-card[data-gallery-card]:hover');
  if (tooltip && tile?.__lcsGalleryItem) __desktopShowGalleryTooltip(tile, tile.__lcsGalleryItem);
  else __desktopHideGalleryTooltip();
}, true);
window.addEventListener('resize', () => {
  const tooltip = document.querySelector('#galleryFloatingTooltip');
  const tile = document.querySelector('.gallery-card[data-gallery-card]:hover');
  if (tooltip && tile?.__lcsGalleryItem) __desktopShowGalleryTooltip(tile, tile.__lcsGalleryItem);
});

const __desktopOriginalRender = render;
render = function (...args) {
  const result = __desktopOriginalRender.apply(this, args);
  __desktopFitCardDescriptions(document);
  __desktopRefreshCardHighlights();
  __desktopHideGalleryTooltip();
  return result;
};
const __desktopFitOriginalGalleryInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopFitOriginalGalleryInspect.apply(this, args);
  __desktopFitCardDescriptions(document.querySelector('#inspect'));
  return result;
};
const __desktopOriginalSkillInspect = inspectSkill;
inspectSkill = function (...args) {
  const result = __desktopOriginalSkillInspect.apply(this, args);
  __desktopFitCardDescriptions(document.querySelector('#inspect'));
  return result;
};
const __desktopFitUpdatedCardPreview = updateCardPreview;
updateCardPreview = function (...args) {
  const result = __desktopFitUpdatedCardPreview.apply(this, args);
  __desktopFitCardDescriptions(document.querySelector('#cardLivePreview'));
  __desktopFitCardDescriptions(document.querySelector('#artCardPreview'));
  __desktopFitGalleryArtPanelPreview();
  return result;
};
const __desktopFitArtPanelPreview = artPanel;
artPanel = function (...args) {
  const result = __desktopFitArtPanelPreview.apply(this, args);
  __desktopFitCardDescriptions(document.querySelector('#artCardPreview'));
  __desktopFitGalleryArtPanelPreview();
  return result;
};

let __desktopGuidedCard = null;
const __desktopGuidedStages = ['name', 'ruleText', 'type', 'element', 'cost'];

function __desktopGuidedCurrentCard() {
  return __desktopGuidedCard && data.galleryCards.find(card => card.id === __desktopGuidedCard.id);
}

function __desktopGuidedFocus() {
  if (!__desktopGuidedCard || state.tab !== 'gallery') return;
  document.querySelector('#guidedCardStepHint')?.remove();
  document.querySelectorAll('#inspect .guided-card-step-active').forEach(field => { field.classList.remove('guided-card-step-active'); field.removeAttribute('aria-describedby'); });
  const field = document.querySelector(`#inspect [data-gallery-edit="${__desktopGuidedCard.stage}"]`);
  if (!field) return;
  field.classList.add('guided-card-step-active');
  const hint = document.createElement('small');
  hint.id = 'guidedCardStepHint';
  hint.textContent = __desktopGuidedCard.stage === 'ruleText' ? 'Enter avança · Shift+Enter quebra linha' : 'Enter avança · Esc mantém o rascunho nomeado';
  field.insertAdjacentElement('afterend', hint);
  field.setAttribute('aria-describedby', 'guidedCardStepHint');
  field.focus({ preventScroll: true });
  if (__desktopGuidedCard.stage === 'name' && typeof field.select === 'function') field.select();
}

function __desktopGuidedStop({ renderAfter = false } = {}) {
  const active = __desktopGuidedCard;
  if (!active) return;
  const record = __desktopGuidedCurrentCard();
  const title = String(record?.card?.name || record?.name || '').trim();
  let discarded = false;
  if (record?.__desktopGuidedPending && !title) {
    data.galleryCards = data.galleryCards.filter(card => card.id !== record.id);
    __desktopCards.delete(record.id);
    if (state.gallerySelected === `g:${record.id}`) state.gallerySelected = null;
    discarded = true;
  } else if (record?.__desktopGuidedPending) {
    delete record.__desktopGuidedPending;
    record.name = record.card.name;
    active.committed = true;
    active.lastName = record.card.name;
    mutate(null, false);
  }
  document.querySelectorAll('#inspect .guided-card-step-active').forEach(field => {
    field.classList.remove('guided-card-step-active');
    field.removeAttribute('aria-describedby');
  });
  document.querySelector('#guidedCardStepHint')?.remove();
  __desktopGuidedCard = null;
  if (discarded && renderAfter) requestAnimationFrame(() => render());
  if (!discarded) void __desktopFlush().then(() => __desktopSaveQueue).catch(error => toast('Rascunho mantido na tela; falha ao salvar no Vault: ' + String(error?.message || error)));
}

async function __desktopGuidedCompleteAndRestart() {
  const active = __desktopGuidedCard;
  const record = __desktopGuidedCurrentCard();
  if (!active || !record) return;
  if (!String(record.card?.name || record.name || '').trim()) {
    toast('Informe um nome para criar a carta.');
    __desktopGuidedStop({ renderAfter: true });
    return;
  }
  if (record.__desktopGuidedPending) {
    delete record.__desktopGuidedPending;
    record.name = record.card.name;
    active.committed = true;
    active.lastName = record.card.name;
    mutate(null, false);
  }
  document.querySelectorAll('#inspect .guided-card-step-active').forEach(field => {
    field.classList.remove('guided-card-step-active');
    field.removeAttribute('aria-describedby');
  });
  document.querySelector('#guidedCardStepHint')?.remove();
  __desktopGuidedCard = null;
  try {
    await __desktopFlush();
    await __desktopSaveQueue;
    if (state.tab === 'gallery') __desktopCreateGalleryCard();
  } catch (error) {
    toast('Carta preservada, mas não foi possível confirmar o salvamento: ' + String(error?.message || error));
  }
}

function __desktopCreateGalleryCard() {
  if (__desktopGuidedCard) __desktopGuidedStop({ renderAfter: true });
  const category = state.galleryCategory;
  const selected = category === 'class' ? getClass(state.galleryClassId) || getClass('base_' + state.gallerySlot) : null;
  const root = selected ? (selected.tier === 'C1' ? selected : rootOf(selected.id)) : null;
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  const slot = root ? Math.max(0, roots.findIndex(cls => cls.id === root.id)) : state.gallerySlot;
  const id = uid();
  const name = '';
  const record = {
    id, category, slot, name, __desktopGuidedPending: true,
    ...(selected && selected.tier !== 'C1' ? { layoutClassId: selected.id } : {}),
    card: { type: 'Attack', element: __desktopClassDefaultElement(selected), cost: '1', name, ruleText: '', flavourText: '', art: '', tags: [__desktopClassDefaultElement(selected)], workflowStatus: 'draft', nameFontSize: 17, typeFontSize: 6, elementFontSize: 6, ruleFontSize: 10, flavourFontSize: 7, ruleTextOffsetY: 0, flavourTextOffsetY: 0 }
  };
  data.galleryCards.push(record);
  state.gallerySelected = 'g:' + id;
  __desktopGuidedCard = { id, stage: 'name', committed: false, lastName: '' };
  render();
  __desktopGuidedFocus();
  return record;
}

galleryAdd = __desktopCreateGalleryCard;

let __desktopSelectedKeywordId = null;
let __desktopKeywordSearchQuery = '';

function __desktopKeywordNameKey(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase();
}

function __desktopKeywordHasMention(text, name) {
  const normalized = String(name || '').trim();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try { return new RegExp(`(^|[^\\p{L}\\p{N}_])#${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(String(text || '')); }
  catch { return false; }
}

function __desktopKeywordCardEntries() {
  const entries = [];
  const seen = new Set();
  for (const owner of data.skills || []) {
    const card = owner.card;
    const id = owner.cardId;
    if (!card || !id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ card, owner, kind: 's', selectionId: owner.id, cardId: id });
  }
  for (const owner of data.galleryCards || []) {
    const card = owner.card;
    const id = owner.id;
    if (!card || !id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ card, owner, kind: 'g', selectionId: id, cardId: id });
  }
  return entries;
}

function __desktopKeywordBacklinks(keyword) {
  if (!keyword?.name) return { classes: [], cards: [] };
  const cards = [];
  const classes = new Map();
  for (const cls of data.classes || []) {
    if (['name', 'concept', 'notes'].some(field => __desktopKeywordHasMention(cls[field], keyword.name))) classes.set(cls.id, cls);
  }
  for (const entry of __desktopKeywordCardEntries()) {
    if (!['name','ruleText','flavourText'].some(field => [entry.card[field], entry.owner[field]].some(value => __desktopKeywordHasMention(value, keyword.name)))) continue;
    const classId = entry.owner.layoutClassId || entry.owner.classId || (Number.isInteger(entry.owner.slot) ? `base_${entry.owner.slot}` : null);
    const cls = classId ? getClass(classId) : null;
    if (cls) classes.set(cls.id, cls);
    cards.push({ ...entry, classId: cls?.id || null, className: cls?.name || '', name: entry.card.name || entry.owner.name || 'Carta sem nome' });
  }
  return { classes: [...classes.values()], cards };
}

function __desktopRenderKeywordPage() {
  data.keywords = Array.isArray(data.keywords) ? data.keywords : [];
  if (!data.keywords.some(item => item.id === __desktopSelectedKeywordId)) __desktopSelectedKeywordId = data.keywords[0]?.id || null;
  const selected = data.keywords.find(item => item.id === __desktopSelectedKeywordId) || null;
  const inspector = document.querySelector('#inspect');
  const center = document.querySelector('#center');
  if (!inspector || !center) return;
  const list = data.keywords.map(item => `<button type="button" class="keyword-list-item ${item.id === selected?.id ? 'selected' : ''}" data-keyword-select="${escapeHtml(item.id)}" aria-current="${item.id === selected?.id ? 'true' : 'false'}"><span class="keyword-list-copy"><b>${escapeHtml(item.name || 'Nova keyword')}</b><span>${escapeHtml(item.effect || 'Sem efeito descrito')}</span></span><span class="keyword-list-arrow" aria-hidden="true">›</span></button>`).join('');
  inspector.innerHTML = `<div class="keyword-sidebar"><div class="sectiontop keyword-sidebar-heading"><div><div class="kicker">BIBLIOTECA · REGRAS</div><h2 class="inspector-title">Keywords</h2></div><button type="button" class="btn xs gold" data-action="keyword-add">＋ Criar</button></div><label class="keyword-search-label" for="keywordSearch">BUSCAR KEYWORD</label><input class="field keyword-search" id="keywordSearch" type="search" autocomplete="off" placeholder="Nome ou efeito…" value="${escapeHtml(__desktopKeywordSearchQuery)}"><div class="keyword-list" aria-label="Keywords cadastradas">${list}<div class="keyword-list-empty note" ${data.keywords.length ? 'hidden' : ''}>Nenhuma keyword criada. Use ＋ Criar para começar.</div><div class="keyword-list-empty keyword-no-results note" hidden>Nenhuma keyword corresponde à busca.</div></div><div class="keyword-sidebar-foot"><span>${data.keywords.length} keyword(s)</span><span>AUTO SAVE</span></div></div>`;
  if (__desktopKeywordSearchQuery) __desktopFilterKeywordList(__desktopKeywordSearchQuery);
  if (!selected) {
    center.innerHTML = `<div class="keyword-empty-state"><div class="keyword-empty-mark" aria-hidden="true">#</div><div class="kicker">KEYWORD LIST</div><h1>Glossário de regras</h1><p>Crie keywords. Classes e cartas que mencionam <b>#Nome</b> aparecem automaticamente nos backlinks.</p><button type="button" class="btn gold" data-action="keyword-add">＋ Criar primeira keyword</button></div>`;
    return;
  }
  center.innerHTML = `<div class="keyword-detail"><div class="modulebar keyword-modulebar"><div><div class="kicker">GLOSSÁRIO · REGISTRO SELECIONADO</div><input class="keyword-title-edit" id="keywordDetailTitle" data-keyword-edit="name" aria-label="Nome da keyword" maxlength="80" value="${escapeHtml(selected.name || '')}" placeholder="Nova keyword"></div><span class="keyword-autosave"><i></i> AUTOSAVE ATIVO</span></div><section class="keyword-editor-panel" aria-label="Definição da keyword"><div class="keyword-editor-heading"><h2>Definição</h2></div><textarea class="field keyword-definition" id="keywordEffect" data-keyword-edit="effect" aria-label="Definição da keyword" rows="4" maxlength="4000" placeholder="Descrição da keyword">${escapeHtml(selected.effect || '')}</textarea></section><div id="keywordBacklinks"></div></div>`;
  __desktopRenderKeywordBacklinks(selected);
}

function __desktopRenderKeywordBacklinks(selected) {
  const host = document.querySelector('#keywordBacklinks');
  if (!host || !selected) return;
  const backlinks = __desktopKeywordBacklinks(selected);
  const classItems = backlinks.classes.map(cls => `<button type="button" class="keyword-backlink keyword-class-backlink" data-keyword-class="${escapeHtml(cls.id)}"><span class="keyword-backlink-mark">${escapeHtml(cls.tier)}</span><span class="keyword-backlink-copy"><b>${escapeHtml(cls.name === 'Buccaneer' ? 'Follower of Avalyx' : cls.name)}</b><small>${escapeHtml(cls.tier)} · Classe</small></span><span class="keyword-backlink-arrow" aria-hidden="true">›</span></button>`).join('');
  const cardItems = backlinks.cards.map(entry => `<button type="button" class="keyword-backlink keyword-card-backlink" data-keyword-card="${escapeHtml(entry.selectionId)}" data-keyword-kind="${entry.kind}"><span class="keyword-backlink-mark">${entry.kind === 's' ? 'SK' : 'CA'}</span><span class="keyword-backlink-copy"><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(entry.className === 'Buccaneer' ? 'Follower of Avalyx' : entry.className || 'Independente')}</small></span><span class="keyword-backlink-arrow" aria-hidden="true">›</span></button>`).join('');
  host.innerHTML = `<div class="keyword-backlink-grid"><section class="keyword-backlink-column"><div class="keyword-backlink-heading"><div><div class="kicker">LINHAGENS</div><h2>Classes que usam</h2></div><span class="keyword-count">${backlinks.classes.length}</span></div><div class="keyword-backlink-list" id="keywordClassBacklinks">${classItems || '<div class="keyword-empty note">Nenhuma classe menciona esta keyword.</div>'}</div></section><section class="keyword-backlink-column"><div class="keyword-backlink-heading"><div><div class="kicker">REFERÊNCIAS</div><h2>Cartas que usam</h2></div><span class="keyword-count">${backlinks.cards.length}</span></div><div class="keyword-backlink-list" id="keywordCardBacklinks">${cardItems || '<div class="keyword-empty note">Nenhuma carta menciona esta keyword.</div>'}</div></section></div>`;
}

function __desktopFilterKeywordList(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  let visible = 0;
  for (const item of document.querySelectorAll('.keyword-list-item')) {
    const matches = !normalized || item.textContent.toLocaleLowerCase().includes(normalized);
    item.hidden = !matches;
    if (matches) visible++;
  }
  const empty = document.querySelector('.keyword-list-empty:not(.keyword-no-results)');
  if (empty) empty.hidden = document.querySelectorAll('.keyword-list-item').length > 0 || Boolean(normalized);
  const noResults = document.querySelector('.keyword-no-results');
  if (noResults) noResults.hidden = visible > 0 || !normalized;
}

function __desktopAddKeyword() {
  __desktopKeywordSearchQuery = '';
  const names = new Set((data.keywords || []).map(item => __desktopKeywordNameKey(item.name)));
  let name = 'Nova keyword';
  for (let suffix = 2; names.has(__desktopKeywordNameKey(name)); suffix++) name = `Nova keyword ${suffix}`;
  const keyword = { id: `keyword-${crypto.randomUUID()}`, name, effect: '' };
  data.keywords.push(keyword);
  __desktopSelectedKeywordId = keyword.id;
  mutate('Keyword criada', false);
  render();
  document.querySelector('#inspect [data-keyword-edit="name"]')?.focus();
}

function __desktopCreateKeywordMentions(text, includeTerminal = false) {
  const source = String(text || '');
  const boundary = includeTerminal ? '(?=$|[^\\p{L}\\p{N}_])' : '(?=[\\s.,!?;:)}\\]])';
  const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])#([\\p{Lu}][\\p{L}\\p{N}_-]{0,79})${boundary}`, 'gu');
  const existing = new Set((data.keywords || []).map(item => __desktopKeywordNameKey(item.name)));
  let match;
  const created = [];
  while ((match = expression.exec(source))) {
    const name = match[2];
    const key = __desktopKeywordNameKey(name);
    if (!key || existing.has(key)) continue;
    existing.add(key);
    const keyword = { id: `keyword-${crypto.randomUUID()}`, name, effect: '' };
    data.keywords.push(keyword);
    created.push(keyword);
  }
  if (created.length) {
    mutate('Keyword(s) criada(s) a partir de menções de carta', false);
    __desktopOfficialRefreshCardPreview();
  }
  return created;
}

const __desktopKeywordMarkupOriginal = __desktopRuleKeywordHtml;
__desktopRuleKeywordHtml = function (value) {
  let html = __desktopKeywordMarkupOriginal(value);
  const keywords = [...(data.keywords || [])].filter(item => String(item.name || '').trim()).sort((a, b) => b.name.length - a.name.length);
  for (const keyword of keywords) {
    const escapedName = String(keyword.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let expression;
    try { expression = new RegExp(`(^|[^\\p{L}\\p{N}_])#(${escapedName})(?=$|[^\\p{L}\\p{N}_])`, 'giu'); }
    catch { continue; }
    html = html.replace(expression, (_match, prefix, token) => `${prefix}<span class="rule-keyword-mention" role="term" data-keyword-id="${escapeHtml(keyword.id)}" data-rule-description="${escapeHtml(keyword.effect || '')}">${token}</span>`);
  }
  return html;
};

const __desktopKeywordPreviewOriginal = renderCardPreview;
renderCardPreview = function (owner, artOnly = false) {
  let html = __desktopKeywordPreviewOriginal(owner, artOnly);
  if (artOnly || !html) return html;
  html = html.replace(/(<b class="playcard-layout-title"[^>]*>)([\s\S]*?)(<\/b>)/, (_match, open, text, close) => open + __desktopRuleKeywordHtml(text) + close);
  html = html.replace(/(<div class="playcard-layout-flavour"[^>]*>)([\s\S]*?)(<\/div>)/, (_match, open, text, close) => open + __desktopRuleKeywordHtml(text) + close);
  html = html.replace(/(<div class="playcard-head">\s*<b[^>]*>)([\s\S]*?)(<\/b>)/, (_match, open, text, close) => open + __desktopRuleKeywordHtml(text) + close);
  html = html.replace(/(<div class="playcard-flavour"[^>]*>)([\s\S]*?)(<\/div>)/, (_match, open, text, close) => open + __desktopRuleKeywordHtml(text) + close);
  return html;
};

const __desktopKeywordNav = document.querySelector('[data-nav="gallery"]');
if (__desktopKeywordNav && !document.querySelector('[data-nav="keywords"]')) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'nav'; button.dataset.nav = 'keywords'; button.textContent = 'KEYWORD LIST';
  __desktopKeywordNav.insertAdjacentElement('afterend', button);
}

const __desktopKeywordRenderOriginal = render;
render = function (...args) {
  const keywordMode = state.tab === 'keywords';
  if (!keywordMode) {
    if (state.tab !== 'gallery' && __desktopGalleryFocusKey) __desktopCloseGalleryFocus();
    document.querySelector('#app')?.classList.remove('keyword-list-mode');
    const result = __desktopKeywordRenderOriginal.apply(this, args);
    return result;
  }
  if (__desktopGalleryFocusKey) __desktopCloseGalleryFocus();
  state.tab = 'database';
  const result = __desktopKeywordRenderOriginal.apply(this, args);
  state.tab = 'keywords';
  document.querySelector('#app')?.classList.add('keyword-list-mode');
  document.querySelectorAll('[data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === 'keywords'));
  __desktopRenderKeywordPage();
  return result;
};

document.addEventListener('click', event => {
  const nav = event.target instanceof Element ? event.target.closest('[data-nav="keywords"]') : null;
  if (nav) {
    event.preventDefault(); event.stopImmediatePropagation();
    state.tab = 'keywords'; render(); return;
  }
  const add = event.target instanceof Element ? event.target.closest('[data-action="keyword-add"]') : null;
  if (add && state.tab === 'keywords') {
    event.preventDefault(); event.stopImmediatePropagation(); __desktopAddKeyword(); return;
  }
  const select = event.target instanceof Element ? event.target.closest('[data-keyword-select]') : null;
  if (select && state.tab === 'keywords') {
    event.preventDefault(); event.stopImmediatePropagation(); __desktopSelectedKeywordId = select.dataset.keywordSelect; render(); return;
  }
  const keywordClass = event.target instanceof Element ? event.target.closest('[data-keyword-class]') : null;
  if (keywordClass && state.tab === 'keywords') {
    event.preventDefault(); event.stopImmediatePropagation();
    const cls = getClass(keywordClass.dataset.keywordClass);
    if (cls) { __desktopUrgentSelectClass(cls.id); state.tab = 'matrix'; render(); }
    return;
  }
  const keywordCard = event.target instanceof Element ? event.target.closest('[data-keyword-card]') : null;
  if (keywordCard && state.tab === 'keywords') {
    event.preventDefault(); event.stopImmediatePropagation();
    const kind = keywordCard.dataset.keywordKind;
    const id = keywordCard.dataset.keywordCard;
    const owner = kind === 's' ? getSkill(id) : (data.galleryCards || []).find(item => item.id === id);
    if (owner) __desktopUrgentFollowMention({ kind: 'card', selectionKind: kind, id, owner });
    return;
  }
  const mention = event.target instanceof Element ? event.target.closest('.rule-keyword-mention[data-keyword-id]') : null;
  if (mention) {
    event.preventDefault(); event.stopImmediatePropagation();
    __desktopSelectedKeywordId = mention.dataset.keywordId;
    state.tab = 'keywords'; render();
  }
}, true);

document.addEventListener('input', event => {
  const target = event.target;
  if (state.tab === 'keywords' && target?.id === 'keywordSearch') {
    __desktopKeywordSearchQuery = target.value;
    __desktopFilterKeywordList(target.value);
    return;
  }
  if (state.tab === 'keywords' && target?.dataset?.keywordEdit) {
    const keyword = data.keywords?.find(item => item.id === __desktopSelectedKeywordId);
    if (!keyword) return;
    if (target.dataset.keywordEdit === 'name' && !target.value.trim()) return;
    keyword[target.dataset.keywordEdit] = target.value;
    mutate('Keyword atualizada', false);
    if (target.dataset.keywordEdit === 'name') {
      const listItem = document.querySelector(`[data-keyword-select="${CSS.escape(keyword.id)}"] b`);
      if (listItem) listItem.textContent = keyword.name || 'Nova keyword';
      const title = document.querySelector('#keywordDetailTitle');
      if (title && title !== target) title.value = keyword.name || '';
      __desktopFilterKeywordList(__desktopKeywordSearchQuery);
    } else {
      const listItem = document.querySelector(`[data-keyword-select="${CSS.escape(keyword.id)}"] .keyword-list-copy > span`);
      if (listItem) listItem.textContent = keyword.effect || 'Sem efeito descrito';
    }
    __desktopRenderKeywordBacklinks(keyword);
    return;
  }
  const field = target?.dataset?.galleryEdit;
  const cardField = target?.dataset?.card;
  if ((field === 'ruleText' || field === 'flavourText' || field === 'name' || cardField === 'ruleText' || cardField === 'flavourText' || cardField === 'name') && typeof target.value === 'string') {
    __desktopCreateKeywordMentions(target.value, false);
  }
}, true);

document.addEventListener('focusout', event => {
  const target = event.target;
  if (state.tab !== 'keywords' || target?.dataset?.keywordEdit !== 'name' || target.value.trim()) return;
  const keyword = data.keywords?.find(item => item.id === __desktopSelectedKeywordId);
  if (keyword) target.value = keyword.name || '';
}, true);

document.addEventListener('focusout', event => {
  const target = event.target;
  const field = target?.dataset?.galleryEdit;
  const cardField = target?.dataset?.card;
  if ((field === 'ruleText' || field === 'flavourText' || field === 'name' || cardField === 'ruleText' || cardField === 'flavourText' || cardField === 'name') && typeof target.value === 'string') {
    __desktopCreateKeywordMentions(target.value, true);
  }
}, true);

document.addEventListener('input', event => {
  const target = event.target;
  if (!target?.matches?.('textarea[data-gallery-edit="ruleText"],textarea[data-gallery-edit="flavourText"],textarea[data-card="ruleText"],textarea[data-card="flavourText"]')) return;
  const style = getComputedStyle(target);
  const clone = document.createElement('div');
  clone.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box;width:${target.clientWidth}px;font:${style.font};line-height:${style.lineHeight};letter-spacing:${style.letterSpacing};padding:0;border:0`;
  clone.textContent = target.value || ' ';
  document.body.append(clone);
  const contentHeight = clone.getBoundingClientRect().height;
  clone.remove();
  const verticalPadding = Math.max(6, (target.clientHeight - contentHeight) / 2);
  target.style.paddingTop = `${verticalPadding}px`;
  target.style.paddingBottom = `${verticalPadding}px`;
}, true);

const __desktopKeywordStyle = document.createElement('style');
__desktopKeywordStyle.id = 'desktopKeywordListStyle';
__desktopKeywordStyle.textContent = `
#app.keyword-list-mode #c1strip,#app.keyword-list-mode #tagpanel,#app.keyword-list-mode #artside{display:none!important}
#app.keyword-list-mode #bodygrid{top:0!important;grid-template-columns:calc(340px * var(--S)) minmax(0,1fr)!important}
#app.keyword-list-mode #inspect{display:flex;flex-direction:column;overflow:hidden;padding:calc(14px * var(--S));box-sizing:border-box}
#app.keyword-list-mode #center{grid-column:2;overflow:auto;padding:calc(18px * var(--S));box-sizing:border-box}
.keyword-sidebar{display:flex;flex-direction:column;min-height:0;height:100%}
.keyword-sidebar-heading{align-items:center;margin-bottom:calc(14px * var(--S));padding-bottom:calc(11px * var(--S));border-bottom:1px solid #28495a}
.keyword-search-label{display:block;margin:0 0 calc(5px * var(--S));color:#80a9b9;font-size:calc(9px * var(--S));letter-spacing:.1em}
.keyword-search{flex:none}
.keyword-list{display:flex;flex:1;flex-direction:column;gap:calc(5px * var(--S));min-height:0;overflow:auto;margin:calc(10px * var(--S)) calc(-3px * var(--S));padding:0 calc(3px * var(--S))}
.keyword-list-item{display:flex;align-items:center;justify-content:space-between;gap:calc(8px * var(--S));width:100%;min-width:0;padding:calc(9px * var(--S));border:1px solid #1e4052;border-radius:4px;background:linear-gradient(115deg,#102b39,#0b202c);color:#d4e9f0;text-align:left;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
.keyword-list-item:hover{border-color:#4696ad;background:#123446}
.keyword-list-item.selected{border-color:#51cde1;background:linear-gradient(110deg,#15394a,#102a39);box-shadow:inset 2px 0 #d8b653,0 0 0 1px #23718a55}
.keyword-list-item[hidden]{display:none}
.keyword-list-copy{display:flex;flex:1;flex-direction:column;gap:calc(4px * var(--S));min-width:0}
.keyword-list-copy b{font-size:calc(12px * var(--S));color:#edf7fa}
.keyword-list-copy>span{overflow:hidden;color:#86aabb;font-size:calc(9px * var(--S));line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.keyword-list-arrow,.keyword-backlink-arrow{color:#6fa3b7;font-size:calc(20px * var(--S));line-height:1}
.keyword-list-empty{padding:calc(12px * var(--S));border:1px dashed #25485b;border-radius:4px;text-align:center}
.keyword-sidebar-foot{display:flex;justify-content:space-between;padding-top:calc(9px * var(--S));border-top:1px solid #203f50;color:#7096a8;font-size:calc(9px * var(--S));letter-spacing:.08em}
.keyword-sidebar-foot span:last-child{color:#6fc5c8}
.keyword-detail{display:flex;flex-direction:column;gap:calc(14px * var(--S));min-height:100%}
.keyword-modulebar{display:flex;align-items:center;justify-content:space-between;gap:calc(12px * var(--S));min-height:calc(48px * var(--S));padding-bottom:calc(10px * var(--S));border-bottom:1px solid #234457}
.keyword-modulebar h1{margin:calc(3px * var(--S)) 0 0;color:#e5f4f7;font-size:calc(22px * var(--S));line-height:1.15}
.keyword-title-edit{display:block;box-sizing:border-box;width:min(70vw,calc(680px * var(--S)));max-width:100%;margin:calc(3px * var(--S)) 0 0;padding:0;border:0!important;border-radius:0;background:transparent;color:#e5f4f7;font:700 calc(22px * var(--S))/1.15 Arial,sans-serif;text-align:left;box-shadow:none}
.keyword-title-edit:focus{outline:1px solid #51cde1;outline-offset:3px}
.keyword-autosave{display:flex;align-items:center;gap:calc(6px * var(--S));color:#78a8b3;font-size:calc(9px * var(--S));letter-spacing:.08em;white-space:nowrap}
.keyword-autosave i{width:calc(7px * var(--S));height:calc(7px * var(--S));border-radius:50%;background:#52c9bd;box-shadow:0 0 8px #52c9bd77}
.keyword-editor-panel{padding:calc(14px * var(--S));border:1px solid #2b5063;border-radius:5px;background:linear-gradient(135deg,#102b39,#0b202b);box-shadow:0 5px 18px #020a1266}
.keyword-editor-heading{display:flex;align-items:baseline;gap:calc(10px * var(--S));margin-bottom:calc(10px * var(--S))}
.keyword-editor-heading h2{margin:0;color:#dfbd5c;font-size:calc(13px * var(--S));text-transform:uppercase;letter-spacing:.09em}
.keyword-definition{display:block;box-sizing:border-box;width:100%;min-height:calc(110px * var(--S));resize:vertical;text-align:left;line-height:1.45}
.keyword-backlink-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(12px * var(--S));flex:1;min-height:calc(210px * var(--S))}
.keyword-backlink-column{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid #284e62;border-radius:5px;background:linear-gradient(150deg,#0d2330,#091b26)}
.keyword-backlink-heading{display:flex;align-items:center;justify-content:space-between;gap:calc(8px * var(--S));padding:calc(12px * var(--S));border-bottom:1px solid #234253;background:#102a38}
.keyword-backlink-heading .kicker{margin-bottom:calc(3px * var(--S));color:#7fa5b4}
.keyword-backlink-heading h2{margin:0;color:#e0edf0;font-size:calc(14px * var(--S))}
.keyword-count{display:grid;place-items:center;min-width:calc(26px * var(--S));height:calc(26px * var(--S));padding:0 calc(5px * var(--S));box-sizing:border-box;border:1px solid #886f36;border-radius:50%;color:#f0d17b;font-size:calc(11px * var(--S));font-weight:700}
.keyword-backlink-list{display:flex;flex:1;flex-direction:column;gap:calc(5px * var(--S));overflow:auto;padding:calc(10px * var(--S))}
.keyword-backlink{display:flex;align-items:center;gap:calc(9px * var(--S));width:100%;min-width:0;padding:calc(8px * var(--S));border:1px solid #214355;border-radius:4px;background:#102936;color:#d7ebf0;text-align:left;cursor:pointer;transition:background .14s,border-color .14s}
.keyword-backlink:hover,.keyword-backlink:focus-visible{border-color:#50c9df;background:#15394a;outline:none;box-shadow:0 0 0 1px #43b8cc44}
.keyword-backlink-mark{display:grid;place-items:center;flex:none;width:calc(31px * var(--S));height:calc(31px * var(--S));border:1px solid #376276;border-radius:4px;background:#0a202c;color:#54d5e8;font-size:calc(9px * var(--S));font-weight:800}
.keyword-backlink-copy{display:flex;flex:1;flex-direction:column;gap:calc(3px * var(--S));min-width:0}
.keyword-backlink-copy b{overflow:hidden;color:#e5f0f2;font-size:calc(11px * var(--S));text-overflow:ellipsis;white-space:nowrap}
.keyword-backlink-copy small{color:#7fa4b4;font-size:calc(9px * var(--S))}
.keyword-empty{margin:auto;padding:calc(20px * var(--S));color:#819eac;text-align:center}
.keyword-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;max-width:calc(520px * var(--S));margin:auto;text-align:center}
.keyword-empty-mark{display:grid;place-items:center;width:calc(86px * var(--S));height:calc(86px * var(--S));margin-bottom:calc(16px * var(--S));border:1px solid #957a3d;border-radius:50%;background:radial-gradient(circle,#183b4a,#0b1f2a 72%);box-shadow:0 0 32px #35c4d533;color:#e2bd54;font-size:calc(54px * var(--S));font-weight:800}
.keyword-empty-state h1{margin:calc(5px * var(--S)) 0;color:#e7f4f6;font-size:calc(23px * var(--S))}
.keyword-empty-state p{max-width:calc(440px * var(--S));margin:0 0 calc(16px * var(--S));color:#8cabb8;font-size:calc(12px * var(--S));line-height:1.6}
.keyword-empty-state p b{color:#58dcef}
@media(max-width:950px){.keyword-backlink-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-height:700px){#app.keyword-list-mode #center{padding-top:calc(10px * var(--S));padding-bottom:calc(10px * var(--S))}.keyword-detail{gap:calc(8px * var(--S))}.keyword-editor-panel{padding:calc(9px * var(--S))}.keyword-backlink-grid{min-height:calc(145px * var(--S))}}
@media(prefers-reduced-motion:reduce){.keyword-list-item,.keyword-backlink{transition:none}}
.rule-keyword-mention[data-keyword-id]{color:#57e7ff;text-shadow:0 0 5px #12cbe9b0;border-bottom:1px dotted currentColor;cursor:pointer;pointer-events:auto!important}
`;
document.head.append(__desktopKeywordStyle);

const __desktopGuidedFocusStyle = document.createElement('style');
__desktopGuidedFocusStyle.textContent = `
#inspect [data-gallery-edit].guided-card-step-active{outline:2px solid #57d8f2!important;outline-offset:1px;box-shadow:0 0 0 2px #36c9e855,0 0 16px #2fd9f0aa!important}
#guidedCardStepHint{color:#85eaff;font-size:calc(10px * var(--S))}
`;
document.head.append(__desktopGuidedFocusStyle);

const __desktopGuidedOriginalGalleryInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopGuidedOriginalGalleryInspect.apply(this, args);
  const type = document.querySelector('#inspect [data-gallery-edit="type"]');
  if (type && ![...type.options].some(option => option.value === 'Other')) type.add(new Option('Other', 'Other'));
  if (type && type.value !== (getGallerySelection()?.card?.type ?? 'Skill')) type.value = getGallerySelection()?.card?.type ?? 'Skill';
  return result;
};

document.addEventListener('input', event => {
  if (!__desktopGuidedCard || event.target?.dataset?.galleryEdit !== 'name') return;
  const record = __desktopGuidedCurrentCard();
  if (!record || record.id !== __desktopGuidedCard.id) return;
  const value = String(event.target.value || '');
  if (record.__desktopGuidedPending && value.trim()) {
    delete record.__desktopGuidedPending;
    record.name = value;
    __desktopGuidedCard.committed = true;
    __desktopGuidedCard.lastName = value;
    return;
  }
  if (__desktopGuidedCard.committed && !value.trim()) {
    event.target.value = __desktopGuidedCard.lastName;
    record.name = __desktopGuidedCard.lastName;
    record.card.name = __desktopGuidedCard.lastName;
  } else if (value.trim()) __desktopGuidedCard.lastName = value;
}, true);

document.addEventListener('pointerdown', event => {
  if (!__desktopGuidedCard) return;
  const stageField = document.querySelector(`#inspect [data-gallery-edit="${__desktopGuidedCard.stage}"]`);
  if (stageField && (event.target === stageField || stageField.contains(event.target))) return;
  __desktopGuidedStop({ renderAfter: true });
}, true);

document.addEventListener('keydown', event => {
  if (!__desktopGuidedCard) return;
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation();
    __desktopGuidedStop({ renderAfter: true });
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey) return;
  const stage = __desktopGuidedCard.stage;
  const field = document.querySelector(`#inspect [data-gallery-edit="${stage}"]`);
  if (!field || event.target !== field) return;
  if (stage === 'name' && !String(field.value || '').trim()) {
    event.preventDefault(); event.stopImmediatePropagation();
    __desktopGuidedStop({ renderAfter: true });
    return;
  }
  event.preventDefault(); event.stopImmediatePropagation();
  const index = __desktopGuidedStages.indexOf(stage);
  if (index === __desktopGuidedStages.length - 1) {
    void __desktopGuidedCompleteAndRestart();
    return;
  }
  __desktopGuidedCard.stage = __desktopGuidedStages[index + 1];
  __desktopGuidedFocus();
}, true);

document.addEventListener('dblclick', event => {
  if (state.tab !== 'gallery') return;
  const target = event.target instanceof Element ? event.target : null;
  const scroll = target?.closest('#center .gallery-scroll');
  if (!scroll || target.closest('.gallery-card,button,input,select,textarea,a,[contenteditable="true"],.gallery-toolbar,.gallery-filterbar')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  clearTimeout(__desktopGalleryCardClickTimer);
  __desktopGalleryCardClickTimer = null;
  __desktopCreateGalleryCard();
}, true);

const __desktopCardTextAdjustmentStyle = document.createElement('style');
__desktopCardTextAdjustmentStyle.textContent = `
.card-text-adjustment{display:flex;align-items:center;gap:calc(5px * var(--S));margin-top:calc(4px * var(--S));color:#8db4c5;font-size:calc(10px * var(--S))}
.card-text-adjustment label{display:flex;align-items:center;gap:calc(4px * var(--S));white-space:nowrap}
.card-text-adjustment input{width:calc(48px * var(--S));min-width:0;padding:calc(3px * var(--S)) calc(4px * var(--S))}
.card-text-adjustment .card-offset-buttons{display:inline-flex;gap:calc(2px * var(--S))}
.card-text-adjustment button{min-width:calc(23px * var(--S));height:calc(21px * var(--S));padding:0;border:1px solid #31596a;border-radius:3px;background:#102b38;color:#c7e6f1;cursor:pointer}
.card-text-adjustment output{min-width:calc(34px * var(--S));color:#a9ccd9;text-align:right}
.card-font-label-row{display:flex;align-items:center;justify-content:space-between;gap:calc(5px * var(--S))}
.card-font-label-row>.small{margin:0}
.card-font-control{display:inline-flex;align-items:center;gap:calc(4px * var(--S));color:#8db4c5;font-size:calc(9px * var(--S));white-space:nowrap}
.card-font-control input{box-sizing:border-box;width:calc(38px * var(--S));min-width:0;height:calc(20px * var(--S));padding:calc(2px * var(--S)) calc(3px * var(--S));text-align:center}
`;
document.head.append(__desktopCardTextAdjustmentStyle);

const __desktopCardVisualOriginalInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopCardVisualOriginalInspect.apply(this, args);
  if (state.tab !== 'gallery') return result;
  const selected = getGallerySelection();
  if (!selected?.card || selected.card.status === 'RASCUNHO' && selected.card.noteOwnerId) return result;
  const fontEntries = [
    ['name', 'nameFontSize', 'nome da carta'],
    ['type', 'typeFontSize', 'tipo'],
    ['element', 'elementFontSize', 'elemento'],
  ];
  for (const [field, fontField, label] of fontEntries) {
    const control = document.querySelector(`#inspect [data-gallery-edit="${field}"]`);
    if (!control || control.parentElement?.querySelector(`[data-card-font-control="${fontField}"]`)) continue;
    const group = document.createElement('span');
    group.className = 'card-font-control';
    group.dataset.cardFontControl = fontField;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Tamanho da fonte: ${label}`);
    const fontCaption = document.createElement('span');
    fontCaption.textContent = 'Fonte';
    const fontInput = document.createElement('input');
    fontInput.className = 'field';
    fontInput.type = 'number';
    fontInput.min = String(__desktopCardVisualBounds[fontField][0]);
    fontInput.max = String(__desktopCardVisualBounds[fontField][1]);
    fontInput.step = '1';
    fontInput.value = String(__desktopCardVisualValue(selected.card, fontField));
    fontInput.dataset.galleryEdit = fontField;
    fontInput.setAttribute('aria-label', `Tamanho da fonte: ${label}`);
    group.append(fontCaption, fontInput);
    const container = control.parentElement;
    const fieldLabel = container?.querySelector(':scope > label.small');
    if (fieldLabel) {
      const labelRow = document.createElement('div');
      labelRow.className = 'card-font-label-row';
      fieldLabel.replaceWith(labelRow);
      labelRow.append(fieldLabel, group);
    } else control.insertAdjacentElement('beforebegin', group);
  }
  const entries = [
    ['ruleText', 'RULE TEXT', 'ruleFontSize', 'ruleTextOffsetY'],
    ['flavourText', 'FLAVOUR TEXT', 'flavourFontSize', 'flavourTextOffsetY']
  ];
  for (const [textField, label, fontField, offsetField] of entries) {
    const textarea = document.querySelector(`#inspect [data-gallery-edit="${textField}"]`);
    if (!textarea || textarea.parentElement?.querySelector('.card-text-adjustment')) continue;
    const group = document.createElement('div');
    group.className = 'card-text-adjustment';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Ajustes de ${label.toLocaleLowerCase()}`);
    const fontLabel = document.createElement('label');
    fontLabel.textContent = 'Fonte';
    const fontInput = document.createElement('input');
    fontInput.className = 'field';
    fontInput.type = 'number';
    fontInput.min = String(__desktopCardVisualBounds[fontField][0]);
    fontInput.max = String(__desktopCardVisualBounds[fontField][1]);
    fontInput.step = '1';
    fontInput.value = String(__desktopCardVisualValue(selected.card, fontField));
    fontInput.dataset.galleryEdit = fontField;
    fontInput.setAttribute('aria-label', `Tamanho da fonte de ${label.toLocaleLowerCase()}`);
    fontLabel.append(fontInput);
    group.append(fontLabel);
    const positionLabel = document.createElement('span');
    positionLabel.textContent = 'Posição';
    group.append(positionLabel);
    const buttons = document.createElement('span');
    buttons.className = 'card-offset-buttons';
    for (const [symbol, delta, title] of [['↑', -2, 'Mover para cima'], ['↓', 2, 'Mover para baixo']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = symbol;
      button.title = `${title}: ${label.toLocaleLowerCase()}`;
      button.setAttribute('aria-label', `${title} ${label.toLocaleLowerCase()}`);
      button.dataset.cardOffsetStep = offsetField;
      button.dataset.step = String(delta);
      buttons.append(button);
    }
    group.append(buttons);
    const output = document.createElement('output');
    output.dataset.cardOffsetValue = offsetField;
    output.textContent = `${__desktopCardVisualValue(selected.card, offsetField)} px`;
    group.append(output);
    textarea.insertAdjacentElement('afterend', group);
  }
  return result;
};

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('button[data-card-offset-step]') : null;
  if (!button || state.tab !== 'gallery') return;
  const selected = getGallerySelection();
  const field = button.dataset.cardOffsetStep;
  if (!selected?.card || !Object.hasOwn(__desktopCardVisualBounds, field)) return;
  event.preventDefault();
  const [min, max] = __desktopCardVisualBounds[field];
  const value = __desktopCardVisualValue(selected.card, field) + Number(button.dataset.step || 0);
  selected.owner.card[field] = Math.max(min, Math.min(max, value));
  const output = document.querySelector(`#inspect [data-card-offset-value="${field}"]`);
  if (output) output.textContent = `${selected.owner.card[field]} px`;
  mutate(null, false);
  __desktopOfficialRefreshCardPreview();
  __desktopUrgentRenderClassThumbnails();
}, true);

const __desktopVisualCardPreview = renderCardPreview;
renderCardPreview = function (owner, artOnly = false) {
  let html = __desktopVisualCardPreview(owner, artOnly);
  if (artOnly) return html;
  const card = owner?.card || {};
  const ruleOffset = __desktopCardVisualValue(card, 'ruleTextOffsetY');
  const flavourOffset = __desktopCardVisualValue(card, 'flavourTextOffsetY');
  const ruleTop = ruleOffset ? `calc(64% ${ruleOffset < 0 ? '-' : '+'} ${Math.abs(ruleOffset)}px * var(--S))` : '64%';
  const flavourTop = flavourOffset ? `calc(88% ${flavourOffset < 0 ? '-' : '+'} ${Math.abs(flavourOffset)}px * var(--S))` : '88%';
  html = html
    .replace(/(class="playcard-layout-rules" style="[^"]*top:)[^;]+/, `$1${ruleTop}`)
    .replace(/(class="playcard-layout-rules" style="[^"]*font-size:)calc\(\d+px \* var\(--S\)\)/, `$1calc(${__desktopCardVisualValue(card, 'ruleFontSize')}px * var(--S))`)
    .replace(/(class="playcard-layout-flavour" style="[^"]*top:)[^;]+/, `$1${flavourTop}`)
    .replace(/(class="playcard-layout-flavour" style="[^"]*font-size:)calc\(\d+px \* var\(--S\)\)/, `$1calc(${__desktopCardVisualValue(card, 'flavourFontSize')}px * var(--S))`)
    .replace(/(<b class="playcard-layout-title[^>]*style="[^"]*font-size:)calc\([\d.]+px \* var\(--S\)\)/, (_match, prefix) => `${prefix}calc(${__desktopCardVisualValue(card, 'nameFontSize') * (owner?.card?.type === 'Class Mechanic' ? 79.3 / 17 : 1)}px * var(--S))`)
    .replace(/(class="playcard-layout-type" style="[^"]*font:700 )calc\([\d.]+px \* var\(--S\)\)/, `$1calc(${__desktopCardVisualValue(card, 'typeFontSize')}px * var(--S))`)
    .replace(/(class="playcard-layout-element" style="[^"]*font:700 )calc\([\d.]+px \* var\(--S\)\)/, `$1calc(${__desktopCardVisualValue(card, 'elementFontSize')}px * var(--S))`);
  return html;
};

const __desktopDeleteActionOriginalGalleryInspect = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopDeleteActionOriginalGalleryInspect.apply(this, args);
  if (state.tab !== 'gallery') return result;
  const selected = getGallerySelection();
  if (selected?.card) __desktopLockConfirmedCard(selected.card, document.querySelector('#inspect'));
  return result;
};

// Card workflow status is separate from the editorial RASCUNHO/CONFIRMADO lifecycle.
const __desktopCardWorkflowStatuses = Object.freeze({
  F1: { value: 'draft', label: 'Rascunho', color: '#ff3c4b' },
  F2: { value: 'review', label: 'Em Análise', color: '#ffd44f' },
  F3: { value: 'completed', label: 'Concluída', color: '#49df82' },
  F4: { value: 'audited', label: 'Auditada', color: '#42ddf3' }
});
const __desktopWorkflowStatusByValue = Object.fromEntries(Object.values(__desktopCardWorkflowStatuses).map(item => [item.value, item]));
state.tagMode = state.tagMode === 'filter' ? 'filter' : 'assign';
data.keywords ||= [];

const __desktopDefaultElementsByClass = Object.freeze({
  arcanist: 'Arcane', naturalist: 'Nature', cleric: 'Holy', acolyte: 'Profane',
  spiritualist: 'Spiritual', draconologist: 'Fire', dragonologist: 'Fire',
  enlightened: 'Holy', taoist: 'Spiritual', spellblade: 'Arcane', viper: 'Nature',
  'arcane trickster': 'Arcane', buccaneer: 'Water', 'follower of avalyx': 'Water'
});

function __desktopClassDefaultElement(classOrId) {
  let current = typeof classOrId === 'string' ? getClass(classOrId) : classOrId;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const mapped = __desktopDefaultElementsByClass[String(current.name || '').trim().normalize('NFKC').toLocaleLowerCase()];
    if (mapped) return mapped;
    current = current.parentId ? getClass(current.parentId) : null;
  }
  return 'Neutral';
}

function __desktopEnsureClassMechanics() {
  const classes = (data.classes || []).filter(cls => ['C1', 'C2', 'C3'].includes(String(cls.tier).toUpperCase()));
  const roots = (data.classes || []).filter(cls => cls.tier === 'C1');
  const existing = new Set();
  for (const gallery of data.galleryCards || []) {
    const classId = gallery.classMechanicForClassId || (gallery.card?.type === 'Class Mechanic' ? gallery.layoutClassId : null);
    if (classId) existing.add(classId);
  }
  let added = 0;
  for (const cls of classes) {
    if (existing.has(cls.id)) continue;
    const root = rootOf(cls.id);
    const slot = roots.findIndex(item => item.id === root?.id);
    if (slot < 0) continue;
    const element = __desktopClassDefaultElement(cls);
    const name = `${cls.name} Class Mechanic`;
    const id = uid();
    const gallery = {
      id, category: 'class', slot, name, layoutClassId: cls.id, classMechanicForClassId: cls.id,
      card: { name, type: 'Class Mechanic', element, cost: '0', ruleText: 'No final do turno, X.', flavourText: '', art: '', tags: [element], workflowStatus: 'draft', nameFontSize: 17, typeFontSize: 6, elementFontSize: 6, ruleFontSize: 10, flavourFontSize: 7, ruleTextOffsetY: 0, flavourTextOffsetY: 0 }
    };
    data.galleryCards.push(gallery);
    const card = __desktopBindCard(gallery, id, gallery.card);
    card.layoutClassId = cls.id;
    card.classMechanicForClassId = cls.id;
    existing.add(cls.id);
    added++;
  }
  return added;
}

function __desktopDefaultElementForOwner(owner) {
  const classId = owner?.classId || owner?.layoutClassId;
  const cls = classId ? getClass(classId) : (Number.isInteger(owner?.slot) ? getClass(`base_${owner.slot}`) : null);
  return __desktopClassDefaultElement(cls);
}

const __desktopOriginalCanonicalizeWorkflow = __desktopCanonicalize;
let __desktopPreserveCopiedSkillElement = false;
__desktopCanonicalize = function (...args) {
  for (const skill of data.skills || []) {
    const isNewCard = !skill.cardId || !__desktopCards.has(skill.cardId);
    if (isNewCard && skill.card) {
      if (!__desktopPreserveCopiedSkillElement && (!skill.card.element || skill.card.element === 'Neutral')) skill.card.element = __desktopClassDefaultElement(getClass(skill.classId));
      skill.card.workflowStatus = 'draft';
      __desktopSyncCardElementTag(skill.card);
    }
  }
  return __desktopOriginalCanonicalizeWorkflow.apply(this, args);
};

const __desktopOriginalDuplicateSkillWorkflow = duplicateSkill;
duplicateSkill = function (...args) {
  if (state.focusType !== 'skill' || !getSkill(state.focusId)) return __desktopOriginalDuplicateSkillWorkflow.apply(this, args);
  __desktopPreserveCopiedSkillElement = true;
  try { return __desktopOriginalDuplicateSkillWorkflow.apply(this, args); }
  finally { __desktopPreserveCopiedSkillElement = false; }
};

function __desktopSelectedCardEntries() {
  const entries = [];
  if (state.tab === 'gallery') {
    const keys = __desktopCardDeleteSelection.size ? [...__desktopCardDeleteSelection] : state.gallerySelected ? [state.gallerySelected] : [];
    const seen = new Set();
    for (const key of keys) {
      const [kind, id] = String(key).split(':', 2);
      const owner = kind === 's' ? getSkill(id) : kind === 'g' ? (data.galleryCards || []).find(item => item.id === id) : null;
      const cardId = kind === 's' ? owner?.cardId : kind === 'g' ? owner?.id : null;
      if (!owner?.card || !cardId || seen.has(cardId)) continue;
      seen.add(cardId);
      entries.push({ card: owner.card, owner, kind, cardId });
    }
  } else if (state.tab === 'matrix' && state.focusType === 'skill' && state.skillMode === 'card') {
    for (const skill of selection().filter(item => item?.card && item.cardId)) entries.push({ card: skill.card, owner: skill, kind: 's', cardId: skill.cardId });
  }
  return entries;
}

function __desktopSetWorkflowStatus(status) {
  const meta = __desktopWorkflowStatusByValue[status];
  const entries = __desktopSelectedCardEntries();
  if (!meta || !entries.length) return false;
  for (const { card } of entries) card.workflowStatus = status;
  mutate(`Status atualizado: ${meta.label}`, false);
  render();
  drawEffects();
  toast(`${entries.length} carta${entries.length === 1 ? '' : 's'}: ${meta.label}.`);
  return true;
}

document.addEventListener('keydown', event => {
  if (!/^F[1-4]$/.test(event.key) || editing(event.target) || document.querySelector('#modal')?.children.length) return;
  const entries = __desktopSelectedCardEntries();
  if (!entries.length) return;
  const status = __desktopCardWorkflowStatuses[event.key]?.value;
  if (!status) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  __desktopSetWorkflowStatus(status);
}, true);

function __desktopStatusMeta(card) {
  return __desktopWorkflowStatusByValue[card?.workflowStatus] || __desktopWorkflowStatusByValue.draft;
}

function __desktopShowCardStatus(inspector, card) {
  if (!inspector || !card) return;
  const title = inspector.querySelector('.sectiontop .inspector-title');
  if (!title) return;
  let status = inspector.querySelector('.card-workflow-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'card-workflow-status';
    status.setAttribute('role', 'status');
    title.insertAdjacentElement('afterend', status);
  }
  const meta = __desktopStatusMeta(card);
  status.textContent = meta.label;
  status.dataset.status = meta.value;
  status.style.setProperty('--workflow-status-color', meta.color);
}

function __desktopStripRarity(root = document) {
  if (!root?.querySelectorAll) return;
  for (const field of root.querySelectorAll('[data-gallery-edit="rarity"],[data-card="rarity"],[data-skill-edit="rarity"]')) {
    const control = field.closest('.control') || field.closest('label') || field;
    const row = control.closest('.compactrow');
    control.remove();
    if (row && !row.children.length) row.remove();
  }
  for (const label of root.querySelectorAll('label.small')) {
    if (label.textContent.trim().toLocaleLowerCase() !== 'rarity') continue;
    const control = label.closest('.control');
    if (control) control.remove(); else label.remove();
  }
  root.querySelectorAll('.gallery-rarity,.playcard-layout-rarity,.playcard-foot').forEach(item => item.remove());
  root.querySelectorAll('[data-action="gallery-delete"]').forEach(button => button.remove());
  root.querySelectorAll('label[for="galleryArtUpload"],label[for="cardArt"]').forEach(label => label.remove());
  root.querySelectorAll('button').forEach(button => {
    if (/^[+＋]?\s*arte$/i.test(button.textContent.trim())) button.remove();
  });
  for (const line of root.querySelectorAll('.ghostline')) {
    const match = line.textContent.match(/ID canônico:\s*(\S+)/i);
    if (match) line.textContent = `ID canônico: ${match[1]}`;
  }
  root.querySelectorAll('.gallery-inspect textarea[data-gallery-edit="ruleText"]').forEach(field => { field.rows = 2; field.style.height = 'calc(48px * var(--S))'; });
  root.querySelectorAll('.gallery-inspect textarea[data-gallery-edit="flavourText"]').forEach(field => { field.rows = 1; field.style.height = 'calc(34px * var(--S))'; });
  const hero = root.querySelector('.gallery-inspect .gallery-hero');
  if (hero) hero.style.height = 'calc(90px * var(--S))';
}

function __desktopPositionGalleryToolbar() {
  document.querySelectorAll('#artside .gallery-toolbar-inspect').forEach(toolbar => toolbar.remove());
}

const __desktopCompactInspectorOriginal = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopCompactInspectorOriginal.apply(this, args);
  if (state.tab !== 'gallery') return result;
  const inspector = document.querySelector('#inspect');
  const side = document.querySelector('#artside');
  __desktopStripRarity(inspector);
  const selected = getGallerySelection();
  const typeSelect = inspector?.querySelector('select[data-gallery-edit="type"]');
  if (typeSelect) {
    if (![...typeSelect.options].some(option => option.value === 'Class Mechanic')) {
      const option = document.createElement('option'); option.value = 'Class Mechanic'; option.textContent = 'Class Mechanic'; typeSelect.append(option);
    }
    if (selected?.card?.type) typeSelect.value = selected.card.type;
  }
  if (selected?.card) __desktopShowCardStatus(inspector, selected.card);
  side?.querySelectorAll('.gallery-toolbar-inspect').forEach(toolbar => toolbar.remove());
  return result;
};

const __desktopCompactSkillInspectOriginal = inspectSkill;
inspectSkill = function (...args) {
  const result = __desktopCompactSkillInspectOriginal.apply(this, args);
  if (state.skillMode === 'card') {
    const skill = getSkill(state.focusId);
    const inspector = document.querySelector('#inspect');
    __desktopStripRarity(inspector);
    __desktopShowCardStatus(inspector, skill?.card);
    const hero = inspector?.querySelector('.inspector-hero');
    if (hero) {
      hero.style.setProperty('height', 'calc(96px * var(--S))', 'important');
      hero.style.setProperty('margin-bottom', 'calc(4px * var(--S))', 'important');
    }
    const artControl = inspector?.querySelector('#cardArt')?.closest('.control');
    if (artControl) artControl.style.display = 'none';
    for (const [field, rows, height] of [['ruleText', 2, 48], ['flavourText', 1, 34]]) {
      const textarea = inspector?.querySelector(`textarea[data-card="${field}"]`);
      if (!textarea) continue;
      textarea.rows = rows;
      textarea.style.setProperty('height', `calc(${height}px * var(--S))`, 'important');
      textarea.style.setProperty('min-height', `calc(${height}px * var(--S))`, 'important');
      textarea.style.resize = 'none';
    }
    inspector?.querySelectorAll('.control').forEach(control => { control.style.marginBottom = 'calc(5px * var(--S))'; });
  }
  return result;
};

document.addEventListener('dblclick', event => {
  const art = event.target.closest('#inspect .inspector-hero');
  if (state.tab !== 'database' || state.focusType !== 'skill' || state.skillMode !== 'card' || !art) return;
  event.preventDefault(); event.stopImmediatePropagation();
  document.querySelector('#inspect #cardArt')?.click();
}, true);

const __desktopWorkflowPreviewOriginal = renderCardPreview;
renderCardPreview = function (owner, artOnly = false) {
  let html = __desktopWorkflowPreviewOriginal(owner, artOnly);
  if (artOnly || !html) return html;
  html = html
    .replace(/<div class="playcard-layout-rarity"[^>]*>[\s\S]*?<\/div>/, '')
    .replace(/<div class="playcard-foot">[\s\S]*?<\/div>/, '');
  const status = __desktopStatusMeta(owner?.card || {});
  html = html.replace(/(<div class="playcard(?: playcard-art)?(?: rarity-[^"]*)?"[^>]*)(>)/, `$1 data-workflow-status="${status.value}"$2`);
  return html;
};

const __desktopWorkflowGalleryOriginal = galleryView;
galleryView = function (...args) {
  const result = __desktopWorkflowGalleryOriginal.apply(this, args);
  if (state.tab === 'gallery') {
    const items = new Map(galleryItems().map(item => [`${item.kind}:${item.id}`, item]));
    for (const tile of document.querySelectorAll('.gallery-card[data-gallery-card]')) {
      const item = items.get(tile.dataset.galleryCard);
      const status = __desktopStatusMeta(item?.card || {});
      tile.dataset.workflowStatus = status.value;
      tile.style.setProperty('--workflow-status-color', status.color);
      tile.setAttribute('aria-label', `${item?.card?.name || item?.name || 'Carta'} · ${status.label}`);
    }
    __desktopStripRarity(document.querySelector('#center'));
  }
  return result;
};

const __desktopWorkflowRenderOriginal = render;
render = function (...args) {
  const result = __desktopWorkflowRenderOriginal.apply(this, args);
  __desktopStripRarity(document);
  document.querySelector('#app')?.classList.toggle('gallery-tab-active', state.tab === 'gallery');
  if (state.tab === 'gallery') {
    const selected = getGallerySelection();
    if (selected?.card) __desktopShowCardStatus(document.querySelector('#inspect'), selected.card);
    if (state.galleryCategory === 'class') __desktopPositionGalleryToolbar();
  } else if (state.tab === 'matrix' && state.focusType === 'skill' && state.skillMode === 'card') {
    __desktopShowCardStatus(document.querySelector('#inspect'), getSkill(state.focusId)?.card);
  }
  __desktopApplyFollowerAvalyxAlias();
  return result;
};

const __desktopWorkflowArtPanelOriginal = artPanel;
artPanel = function (...args) {
  const result = __desktopWorkflowArtPanelOriginal.apply(this, args);
  __desktopStripRarity(document.querySelector('#artside'));
  __desktopPositionGalleryToolbar();
  __desktopPositionGalleryArtBody();
  return result;
};

const __desktopWorkflowStatusStyle = document.createElement('style');
__desktopWorkflowStatusStyle.id = 'desktopWorkflowStatusStyle';
__desktopWorkflowStatusStyle.textContent = `
.card-workflow-status{display:inline-flex;align-items:center;margin-top:calc(3px * var(--S));padding:calc(2px * var(--S)) calc(6px * var(--S));border:1px solid color-mix(in srgb,var(--workflow-status-color) 70%,transparent);border-radius:999px;color:var(--workflow-status-color);font:800 calc(9px * var(--S)) Arial,sans-serif;letter-spacing:.05em;text-shadow:0 0 7px color-mix(in srgb,var(--workflow-status-color) 55%,transparent);box-shadow:0 0 8px color-mix(in srgb,var(--workflow-status-color) 32%,transparent)}
.gallery-card[data-workflow-status]{box-shadow:0 0 8px color-mix(in srgb,var(--workflow-status-color) 34%,transparent);border-color:color-mix(in srgb,var(--workflow-status-color) 58%,#34596a)}
.gallery-card[data-workflow-status="review"]{--workflow-status-color:#ffd44f}.gallery-card[data-workflow-status="completed"]{--workflow-status-color:#49df82}.gallery-card[data-workflow-status="audited"]{--workflow-status-color:#42ddf3}.gallery-card[data-workflow-status="draft"]{--workflow-status-color:#ff3c4b}
.gallery-card[data-workflow-status] .playcard[data-card-layout]{filter:drop-shadow(0 0 7px color-mix(in srgb,var(--workflow-status-color) 54%,transparent))}
.gallery-card[data-workflow-status="review"] .playcard[data-card-layout]{--workflow-status-color:#ffd44f}.gallery-card[data-workflow-status="completed"] .playcard[data-card-layout]{--workflow-status-color:#49df82}.gallery-card[data-workflow-status="audited"] .playcard[data-card-layout]{--workflow-status-color:#42ddf3}.gallery-card[data-workflow-status="draft"] .playcard[data-card-layout]{--workflow-status-color:#ff3c4b}
.playcard[data-workflow-status]{filter:drop-shadow(0 0 7px color-mix(in srgb,var(--workflow-status-color) 56%,transparent))}
.gallery-inspect{gap:calc(4px * var(--S))}.gallery-inspect .fieldarea{min-height:calc(34px * var(--S));resize:vertical}.gallery-inspect textarea[data-gallery-edit="ruleText"]{height:calc(48px * var(--S))!important;min-height:calc(48px * var(--S))!important}.gallery-inspect textarea[data-gallery-edit="flavourText"]{height:calc(34px * var(--S))!important;min-height:calc(34px * var(--S))!important}
#inspect .gallery-inspect input.field[data-gallery-edit="name"],#inspect .gallery-inspect select.field[data-gallery-edit],#inspect [data-card],#inspect [data-gallery-edit],.playcard-layout-title,.playcard-layout-rules,.playcard-layout-flavour,.playcard-type,.playcard-rules,.playcard-flavour{text-align:center}
#inspect .field{text-align:center}#inspect textarea.field{align-content:center}
.gallery-inspect textarea.field[data-gallery-edit="ruleText"],.gallery-inspect textarea.field[data-gallery-edit="flavourText"],#inspect textarea[data-card],#inspect textarea[data-gallery-edit]{text-align:center;align-content:center}
.gallery-inspect .compactrow{grid-template-columns:1fr 1fr}
#tagmini{display:flex!important;height:calc(28px * var(--S));min-height:calc(28px * var(--S));box-sizing:border-box;border-bottom:1px solid #284b5e;margin-bottom:calc(3px * var(--S));padding:0 calc(3px * var(--S));gap:calc(7px * var(--S))}
#tagrows{height:calc(100% - 32px * var(--S))!important}
#tagpanel.closed{height:calc(374px * var(--S))!important}#tagpanel.closed #tagrows{display:grid!important}
.tag-mode-switch{display:inline-flex;align-items:center;border:1px solid #397287;border-radius:4px;overflow:hidden}.tag-mode-switch button{border:0;border-right:1px solid #397287;background:#0b2634;color:#8db6c5;padding:calc(3px * var(--S)) calc(7px * var(--S));font:800 calc(8px * var(--S)) Arial,sans-serif;cursor:pointer}.tag-mode-switch button:last-child{border-right:0}.tag-mode-switch button[aria-pressed="true"]{background:#147491;color:#e9fbff;box-shadow:inset 0 0 0 1px #64dcf2}
#tagrows .tagcell[aria-pressed="true"]{border-color:#43d4ef;color:#f1fcff;background:#0c7896;box-shadow:inset 0 0 0 1px #76e9ff,0 0 6px #2ecbe955}
`;
document.head.append(__desktopWorkflowStatusStyle);

function __desktopApplyFollowerAvalyxAlias(root = document) {
  if (!root?.createTreeWalker && !root?.querySelectorAll) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,textarea,input')) continue;
    if (/\bBuccaneer\b/.test(node.nodeValue)) node.nodeValue = node.nodeValue.replace(/\bBuccaneer\b/g, 'Follower of Avalyx');
  }
  root.querySelectorAll('input[data-edit="name"],option').forEach(control => {
    if (control.value === 'Buccaneer') control.value = 'Follower of Avalyx';
    if (control.textContent === 'Buccaneer') control.textContent = 'Follower of Avalyx';
  });
}

const __desktopWorkflowClassCardOriginal = classCard;
classCard = function (cls, ...args) {
  const markup = __desktopWorkflowClassCardOriginal.call(this, cls, ...args);
  return cls?.name === 'Buccaneer' ? markup.replace(/\bBuccaneer\b/g, 'Follower of Avalyx') : markup;
};

// `Rarity` has been retired from the app's editing and export surfaces.
const __desktopNoRarityOriginalExportCsv = exportCsv;
exportCsv = function (...args) {
  if (state.dbMode !== 'skills') return __desktopNoRarityOriginalExportCsv.apply(this, args);
  const rows = dbRows();
  const headers = ['id','name','kind','owner','tags','type','element','cost','rule_text','flavour_text'];
  const values = rows.map(item => [item.id,item.name,item.kind,getClass(item.classId)?.name || '',(item.tags || []).join(';'),item.card?.type,item.card?.element,item.card?.cost,item.card?.ruleText,item.card?.flavourText]);
  const csv = [headers,...values].map(row => row.map(value => { const text = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g,'""') + '"'; }).join(',')).join('\r\n');
  downloadText('Loknite_LCS_skills.csv','\uFEFF' + csv,'text/csv;charset=utf-8');
  toast('CSV exportado · ' + rows.length + ' registros');
};

const __desktopNoRarityOriginalColumnsModal = columnsModal;
columnsModal = function (...args) {
  const result = __desktopNoRarityOriginalColumnsModal.apply(this, args);
  document.querySelector('#modal input[name="col"][value="rarity"]')?.closest('label')?.remove();
  return result;
};

const __desktopTagOriginalPanel = tagPanel;
tagPanel = function (...args) {
  state.tagOpen = true;
  const result = __desktopTagOriginalPanel.apply(this, args);
  const panel = document.querySelector('#tagpanel');
  panel?.classList.remove('closed');
  panel?.querySelector('.tagclose')?.remove();
  const mini = panel?.querySelector('#tagmini');
  if (mini) mini.innerHTML = `<b>▦ TAG PANEL</b><div class="tag-mode-switch" role="group" aria-label="Modo das tags"><button type="button" data-tag-mode="assign" aria-pressed="${state.tagMode === 'assign'}">ATRIBUIR</button><button type="button" data-tag-mode="filter" aria-pressed="${state.tagMode === 'filter'}">FILTRAR</button></div>`;
  const selected = __desktopSelectedCardEntries();
  for (const button of panel?.querySelectorAll('#tagrows .tagcell[data-tag]') || []) {
    const tag = button.dataset.tag;
    const isElement = groupDefs.find(group => group.id === 'elements')?.tags.some(item => item[0] === tag) || false;
    if (state.tab === 'gallery' && state.tagMode === 'filter') {
      const chosen = isElement ? __desktopGalleryFilters.element.includes(tag) : __desktopGalleryFilters.tags.includes(tag);
      button.setAttribute('aria-pressed', String(chosen));
    } else if (state.tab === 'gallery' && selected.length) {
      const hits = selected.filter(({ card }) => (Array.isArray(card.tags) && card.tags.includes(tag)) || (isElement && String(card.element || '').toLocaleLowerCase() === tag.toLocaleLowerCase())).length;
      button.classList.toggle('direct', hits === selected.length);
      button.classList.toggle('mixed', hits > 0 && hits < selected.length);
      button.setAttribute('aria-pressed', String(hits === selected.length));
    } else button.removeAttribute('aria-pressed');
  }
  return result;
};

function __desktopSetTagMode(mode) {
  if (!['assign','filter'].includes(mode)) return;
  state.tagMode = mode;
  state.tagOpen = true;
  tagPanel();
  if (state.tab === 'gallery') galleryView();
}

function __desktopElementTagValues() {
  return new Set((groupDefs.find(group => group.id === 'elements')?.tags || []).map(item => item[0]));
}

function __desktopSyncCardElementTag(card) {
  if (!card) return;
  const elementValues = __desktopElementTagValues();
  const tags = Array.isArray(card.tags) ? card.tags.filter(tag => !elementValues.has(tag)) : [];
  const element = String(card.element || '').trim();
  if (elementValues.has(element)) tags.push(element);
  card.tags = [...new Set(tags)];
}

function __desktopAssignTagToSelectedCards(tag, asElement) {
  const entries = __desktopSelectedCardEntries();
  if (!entries.length) return toast('Selecione uma carta antes de atribuir tags.');
  for (const { card } of entries) {
    if (asElement) {
      card.element = tag;
      __desktopSyncCardElementTag(card);
    } else {
      const tags = new Set(Array.isArray(card.tags) ? card.tags : []);
      if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
      card.tags = [...tags];
      __desktopSyncCardElementTag(card);
    }
  }
  mutate('Tags da carta atualizadas', false);
  render();
}

document.addEventListener('click', event => {
  const mode = event.target instanceof Element ? event.target.closest('[data-tag-mode]') : null;
  if (mode) {
    event.preventDefault(); event.stopImmediatePropagation();
    __desktopSetTagMode(mode.dataset.tagMode);
    return;
  }
  const tagButton = event.target instanceof Element ? event.target.closest('#tagrows .tagcell[data-tag]') : null;
  if (!tagButton || state.tab !== 'gallery') return;
  const tag = tagButton.dataset.tag;
  const isElement = __desktopElementTagValues().has(tag);
  if (state.tagMode === 'filter') {
    if (isElement) return; // The existing element-filter handler owns these cells.
    event.preventDefault(); event.stopImmediatePropagation();
    const values = __desktopGalleryFilters.tags;
    __desktopGalleryFilters.tags = values.includes(tag) ? values.filter(item => item !== tag) : [...values, tag];
    const selected = state.gallerySelected;
    tagPanel(); galleryView(); state.gallerySelected = selected; galleryInspect(); artPanel();
    return;
  }
  event.preventDefault(); event.stopImmediatePropagation();
  __desktopAssignTagToSelectedCards(tag, isElement);
}, true);

document.addEventListener('keyup', event => {
  if (!['Quote','Backquote'].includes(event.code) || editing(event.target) || state.quoteUsed) return;
  event.preventDefault(); event.stopImmediatePropagation();
  state.quoteDown = false; state.quoteUsed = false;
  __desktopSetTagMode(state.tagMode === 'assign' ? 'filter' : 'assign');
}, true);

const __desktopElementEditOriginalGalleryEdit = galleryEdit;
galleryEdit = function (event) {
  const target = event?.target;
  const result = __desktopElementEditOriginalGalleryEdit(event);
  if (target?.dataset?.galleryEdit === 'element') {
    const selected = getGallerySelection();
    if (selected?.card) { __desktopSyncCardElementTag(selected.card); mutate('Elemento e tag sincronizados', false); }
  }
  return result;
};

const __desktopElementEditOriginalEventInput = eventInput;
eventInput = function (event) {
  const target = event?.target;
  const result = __desktopElementEditOriginalEventInput(event);
  if (target?.dataset?.card === 'element' && state.focusType === 'skill') {
    const skill = getSkill(state.focusId);
    if (skill?.card) { __desktopSyncCardElementTag(skill.card); mutate('Elemento e tag sincronizados', false); }
  }
  return result;
};

// Keep Gallery creation defaults tied to the nearest explicit class in its lineage.
const __desktopDefaultElementOriginalCreateCard = __desktopCreateGalleryCard;
__desktopCreateGalleryCard = function (...args) {
  const created = __desktopDefaultElementOriginalCreateCard.apply(this, args);
  const selected = state.galleryCategory === 'class' ? getClass(state.galleryClassId) || getClass('base_' + state.gallerySlot) : null;
  if (created?.card) {
    created.card.element = __desktopClassDefaultElement(selected);
    created.card.workflowStatus = 'draft';
    __desktopSyncCardElementTag(created.card);
  }
  return created;
};
galleryAdd = __desktopCreateGalleryCard;

// Canonical class rename is applied only in memory during install, then paired with the next boot save.
let __desktopFollowerRenameIds = new Set();
const __desktopFollowerInstallOriginal = __desktopInstall;
__desktopInstall = function (...args) {
  const result = __desktopFollowerInstallOriginal.apply(this, args);
  const found = (data.classes || []).filter(cls => cls.name === 'Buccaneer');
  for (const cls of found) {
    cls.name = 'Follower of Avalyx';
    __desktopFollowerRenameIds.add(cls.id);
  }
  return result;
};

const __desktopFollowerBootOriginal = boot;
boot = async function (...args) {
  await __desktopFollowerBootOriginal.apply(this, args);
  if (!booted || !__desktopFollowerRenameIds.size) return;
  try {
    const persisted = await lcsDesktop.vault.load();
    if (persisted.state !== 'ready') return;
    const renameNeeded = (persisted.legacy?.classes || []).some(cls => __desktopFollowerRenameIds.has(cls.id) && cls.name === 'Buccaneer');
    if (!renameNeeded) { __desktopFollowerRenameIds.clear(); return; }
    __desktopPersistedRevision = saveRevision;
    mutate('Classe renomeada para Follower of Avalyx', false);
    const saved = await __desktopFlush();
    await __desktopSaveQueue;
    if (saved?.state === 'ready' || saved?.vault?.transactionId) {
      __desktopPersistedRevision = saveRevision;
      undoStack = []; redoStack = []; historyBaseline = snapshot();
      __desktopMarkSaved(saved, saved.vault?.revision);
      __desktopFollowerRenameIds.clear();
      render(); drawEffects();
      await lcsDesktop.app.reportStatus(__desktopReadyStatus(saved));
    }
  } catch (error) {
    toast('Falha ao salvar a renomeação de Buccaneer; ela será tentada novamente ao abrir o app: ' + String(error?.message || error));
  }
};

function __desktopClassMechanicPresentation(owner) {
  const record = owner?.owner?.card ? owner.owner : owner;
  const card = owner?.card || record?.card || {};
  if (card.type !== 'Class Mechanic') return null;
  const classId = record?.classMechanicForClassId || record?.layoutClassId || record?.classId || owner?.root?.id || (Number.isInteger(record?.slot) ? `base_${record.slot}` : '');
  const selectedClass = getClass(classId);
  const root = selectedClass ? (selectedClass.tier === 'C1' ? selectedClass : rootOf(selectedClass.id)) : null;
  const match = /^base_(\d+)$/.exec(root?.id || '');
  const slot = match ? Number(match[1]) : -1;
  const layout = slot >= 0 ? __desktopOfficialClassMechanicLayouts.get(`class-mechanic-layout.base_${slot}`) : null;
  if (!layout) return null;
  const classIcon = root ? officialIcon(root) : '';
  const importedArt = imgSrc(card.artPath || card.art || '');
  const art = importedArt || classIcon;
  const status = __desktopStatusMeta(card);
  const ruleOffset = __desktopCardVisualValue(card, 'ruleTextOffsetY');
  const ruleTop = ruleOffset ? `calc(72% ${ruleOffset < 0 ? '-' : '+'} ${Math.abs(ruleOffset)}px * var(--S))` : '72%';
  const title = String(card.name || record?.name || owner?.name || '');
  const rules = String(card.ruleText ?? '');
  return { layout, root, art, importedArt, title, rules, status, ruleTop, titleFontSize: __desktopCardVisualValue(card, 'nameFontSize') * (79.3 / 17), card };
}

const __desktopClassMechanicPreviewOriginal = renderCardPreview;
renderCardPreview = function (owner, artOnly = false) {
  const presentation = __desktopClassMechanicPresentation(owner);
  if (!presentation || artOnly) return __desktopClassMechanicPreviewOriginal(owner, artOnly);
  const { layout, root, art, importedArt, title, rules, status, ruleTop, titleFontSize, card } = presentation;
  const layoutUrl = 'lcs-app://app/class-mechanics/' + layout.path.split('/').map(encodeURIComponent).join('/');
  const artMarkup = art ? `<img class="class-mechanic-art-image ${importedArt ? '' : 'class-mechanic-class-icon'}" src="${escapeHtml(art)}" alt="${importedArt ? 'Arte da carta' : `Ícone oficial de ${escapeHtml(root?.name || layout.className)}`}">` : '';
  const rulesFontSize = __desktopCardVisualValue(card, 'ruleFontSize') * (1060 / 227.14);
  return `<div class="playcard class-mechanic-playcard" data-card-layout="${escapeHtml(layout.id)}" data-class-mechanic-layout="${escapeHtml(layout.classId)}" data-workflow-status="${status.value}" aria-label="${escapeHtml(title || layout.className)} · Class Mechanic" style="position:relative;display:block;box-sizing:border-box;width:calc(1060px * var(--S));height:calc(1484px * var(--S));min-height:0;max-height:none;padding:0;border:0;border-radius:0;box-shadow:none;overflow:hidden;background:transparent;color:#f6e8c9;font-family:Georgia,serif"><div class="playcard-art-window class-mechanic-art-window">${artMarkup}</div><img class="class-mechanic-template" src="${escapeHtml(layoutUrl)}" alt="Layout final Class Mechanic ${escapeHtml(layout.className)}" draggable="false"><b class="playcard-layout-title class-mechanic-title" style="position:absolute;z-index:3;left:15%;top:5.2%;width:70%;height:8.6%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;text-align:center;white-space:normal;font-size:calc(${titleFontSize}px * var(--S));font-weight:700;line-height:1.05">${__desktopRuleKeywordHtml(escapeHtml(title))}</b><div class="playcard-layout-rules class-mechanic-rules" style="position:absolute;z-index:3;left:13%;top:${escapeHtml(ruleTop)};width:74%;height:17%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;text-align:center;white-space:pre-line;font-size:calc(${rulesFontSize}px * var(--S));font-family:Georgia,serif;font-weight:600;line-height:1.25;color:#f5e8cb;text-shadow:0 1px 3px #130e0d">${__desktopRuleKeywordHtml(escapeHtml(rules))}</div></div>`;
};

const __desktopClassMechanicCardStyle = document.createElement('style');
__desktopClassMechanicCardStyle.id = 'desktopClassMechanicCardStyle';
__desktopClassMechanicCardStyle.textContent = `
.class-mechanic-playcard{isolation:isolate;overflow:hidden!important;aspect-ratio:1060/1484}
.class-mechanic-template{position:absolute;z-index:2;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}
.class-mechanic-art-window{position:absolute;z-index:1;left:17.8%;top:18.2%;width:64.4%;height:46.3%;overflow:hidden;border-radius:50%;background:radial-gradient(circle,#0a1723 55%,#07111a 100%);cursor:pointer;pointer-events:auto}
.class-mechanic-art-window .class-mechanic-art-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.class-mechanic-art-window .class-mechanic-class-icon{box-sizing:border-box;object-fit:contain;padding:15%;background:radial-gradient(circle,#102c3d 0,#07111a 68%,transparent 100%)}
.class-mechanic-title,.class-mechanic-rules{overflow:hidden!important;overflow-wrap:anywhere;word-break:normal;pointer-events:auto;cursor:text}
`;
document.head.append(__desktopClassMechanicCardStyle);

function __desktopPlacementClasses(root) {
  if (!root) return [];
  const branches = data.classes.filter(cls => cls.tier === 'C2' && cls.parentId === root.id).flatMap(c2 => [
    c2,
    ...data.classes.filter(cls => cls.tier === 'C3' && cls.parentId === c2.id)
  ]);
  return branches;
}

function __desktopPlacementForOwner(owner) {
  const linked = getClass(owner?.layoutClassId || owner?.classId);
  const root = linked ? rootOf(linked.id) : (owner?.category === 'class' && Number.isInteger(owner?.slot) ? getClass('base_' + owner.slot) : null);
  return { linked, root: root?.tier === 'C1' ? root : null };
}

function __desktopPlacementLock(selected) {
  const owner = selected?.owner;
  const card = selected?.card;
  if (!owner || !card) return 'Selecione uma carta.';
  if (selected.kind !== 'gallery') return 'Carta vinculada a uma Skill.';
  if (owner.category !== 'class') return 'Disponível para cartas da categoria Class Cards.';
  if (owner.noteOwnerId || card.noteOwnerId) return 'Free Note vinculada à árvore de classes.';
  if (card.type === 'Class Mechanic' || owner.classMechanicForClassId || card.classMechanicForClassId) return 'Class Mechanic pertence à classe correspondente.';
  if (card.status === 'CONFIRMADO') return 'Desconfirme a carta antes de movê-la.';
  return '';
}

function __desktopPlacementMarkup(selected) {
  const owner = selected.owner;
  const { linked, root } = __desktopPlacementForOwner(owner);
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  const lock = __desktopPlacementLock(selected);
  const currentTierClass = linked?.tier === 'SPEC' ? getClass(linked.parentId) : linked;
  const currentPlacement = currentTierClass && ['C1', 'C2', 'C3'].includes(currentTierClass.tier) ? currentTierClass.id : '';
  const rootOptions = roots.map(cls => `<option value="${escapeHtml(cls.id)}" ${root?.id === cls.id ? 'selected' : ''}>${escapeHtml(cls.name)}</option>`).join('');
  const targetOptions = root ? [
    `<option value="" ${!currentPlacement || currentPlacement === root.id ? 'selected' : ''}>C1 · ${escapeHtml(root.name)} (base)</option>`,
    ...__desktopPlacementClasses(root).map(cls => {
      const parent = cls.tier === 'C3' ? getClass(cls.parentId) : null;
      const label = cls.tier === 'C3' ? `C3 · ${cls.name} (${parent?.name || 'C2'})` : `C2 · ${cls.name}`;
      return `<option value="${escapeHtml(cls.id)}" ${currentPlacement === cls.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
  ].join('') : '<option value="">Sem classe atribuída</option>';
  return `<section class="card-class-placement" aria-label="Destino da carta"><div class="hlabel">CLASSE DA CARTA</div><div class="card-class-placement-grid"><label class="control"><span class="small">C1</span><select class="field" data-card-placement="root" aria-label="C1 da carta" ${lock ? 'disabled' : ''}>${rootOptions}</select></label><label class="control"><span class="small">C2 / C3</span><select class="field" data-card-placement="tier" aria-label="C2 ou C3 da carta" ${lock ? 'disabled' : ''}>${targetOptions}</select></label></div>${lock ? `<p class="card-class-placement-note">${escapeHtml(lock)}</p>` : '<p class="card-class-placement-note">Mover a carta atualiza a Galeria e salva no Vault.</p>'}</section>`;
}

const __desktopPlacementInspectorOriginal = galleryInspect;
galleryInspect = function (...args) {
  const result = __desktopPlacementInspectorOriginal.apply(this, args);
  if (state.tab !== 'gallery') return result;
  const selected = getGallerySelection();
  const inspector = document.querySelector('#inspect .gallery-inspect');
  if (!selected?.card || !inspector || state.galleryCategory !== 'class') return result;
  inspector.insertAdjacentHTML('beforeend', __desktopPlacementMarkup(selected));
  return result;
};

document.addEventListener('change', event => {
  const control = event.target instanceof Element ? event.target.closest('[data-card-placement]') : null;
  if (!control || state.tab !== 'gallery') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const selected = getGallerySelection();
  const lock = __desktopPlacementLock(selected);
  if (lock) { toast(lock); galleryInspect(); return; }
  const roots = data.classes.filter(cls => cls.tier === 'C1');
  let destination;
  if (control.dataset.cardPlacement === 'root') {
    destination = roots.find(cls => cls.id === control.value);
  } else {
    const { root } = __desktopPlacementForOwner(selected.owner);
    if (!root) { toast('Escolha primeiro a classe C1.'); galleryInspect(); return; }
    destination = control.value ? data.classes.find(cls => cls.id === control.value) : root;
    if (!destination || (destination.id !== root.id && !__desktopPlacementClasses(root).some(cls => cls.id === destination.id))) {
      toast('A classe C2/C3 escolhida não pertence à C1 selecionada.'); galleryInspect(); return;
    }
  }
  if (!destination || !['C1', 'C2', 'C3'].includes(destination.tier)) { toast('Destino de classe inválido.'); galleryInspect(); return; }
  const owner = selected.owner;
  const root = rootOf(destination.id);
  const slot = roots.findIndex(cls => cls.id === root?.id);
  if (slot < 0) { toast('Não foi possível localizar a C1 de destino.'); galleryInspect(); return; }
  owner.slot = slot;
  owner.layoutClassId = destination.tier === 'C1' ? null : destination.id;
  const card = __desktopCards.get(owner.id);
  if (card) { card.category = 'class'; card.slot = slot; }
  state.galleryCategory = 'class';
  state.gallerySlot = slot;
  state.galleryClassId = destination.id;
  state.galleryRailC2Id = destination.tier === 'C3' ? destination.parentId : destination.tier === 'C2' ? destination.id : '';
  state.galleryAll = false;
  state.gallerySelected = 'g:' + owner.id;
  state.rootId = root.id;
  __desktopGalleryAllRootId = null;
  mutate('Classe da carta atualizada', false);
  render(); drawEffects();
}, true);

const __desktopPlacementStyle = document.createElement('style');
__desktopPlacementStyle.id = 'desktopCardPlacementStyle';
__desktopPlacementStyle.textContent = `
.card-class-placement{margin-top:calc(8px * var(--S));padding:calc(7px * var(--S));border:1px solid #28556a;border-radius:calc(5px * var(--S));background:#0a1d28}
.card-class-placement .hlabel{margin:0 0 calc(5px * var(--S));color:#d6b252;font-size:calc(10px * var(--S));letter-spacing:.08em}
.card-class-placement-grid{display:grid;grid-template-columns:1fr 1fr;gap:calc(6px * var(--S))}
.card-class-placement-grid .control{min-width:0;margin:0}
.card-class-placement-grid .small{display:block;margin-bottom:calc(3px * var(--S));color:#8fb2c1;font-size:calc(9px * var(--S))}
.card-class-placement-grid .field{width:100%;min-width:0}
.card-class-placement-note{margin:calc(5px * var(--S)) 0 0;color:#7896a4;font-size:calc(9px * var(--S));line-height:1.25}
.card-class-placement select:disabled{opacity:.65;cursor:not-allowed}
`;
document.head.append(__desktopPlacementStyle);

// Gallery sort and card focus are limited to the card viewport. Menus and Inspect remain interactive.
const __desktopGalleryItemSortOriginal = galleryItems;
function __desktopGalleryTreePath(item) {
  const cls = getClass(item.owner?.layoutClassId || item.owner?.classId);
  const root = cls ? rootOf(cls.id) : item.root || (item.owner?.category === 'class' ? getClass('base_' + item.owner.slot) : null);
  const path = String(cls?.statedPath || root?.statedPath || '').split('/').map(part => {
    const match = /_(\d+)$/.exec(part);
    return match ? Number(match[1]) : null;
  }).filter(Number.isInteger);
  if (path.length) return path;
  return root ? [Number.isInteger(item.owner?.slot) ? item.owner.slot : 999] : [999, 999];
}
function __desktopCompareGalleryTreePath(left, right) {
  const a = __desktopGalleryTreePath(left), b = __desktopGalleryTreePath(right);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
function __desktopGalleryTypeRank(item) {
  const type = String(item.card?.type || item.type || 'Other').toLocaleLowerCase();
  if (type === 'class mechanic' || type === 'mechanic') return 0;
  if (type === 'power') return 1;
  if (type === 'attack') return 2;
  if (type === 'skill') return 3;
  return 4;
}
function __desktopGalleryCostRank(item) {
  const cost = String(item.card?.cost ?? item.cost ?? '1').toUpperCase();
  return cost === 'X' ? 0 : /^[0-5]$/.test(cost) ? Number(cost) + 1 : 7;
}
galleryItems = function (...args) {
  return __desktopGalleryItemSortOriginal.apply(this, args).slice().sort((a, b) =>
    __desktopCompareGalleryTreePath(a, b)
      || Number(String(a.card?.name || a.name || '').startsWith('☺')) - Number(String(b.card?.name || b.name || '').startsWith('☺'))
      || __desktopGalleryTypeRank(a) - __desktopGalleryTypeRank(b)
      || __desktopGalleryCostRank(a) - __desktopGalleryCostRank(b)
      || String(a.card?.name || a.name || '').replace(/^☺/, '').localeCompare(String(b.card?.name || b.name || '').replace(/^☺/, ''), undefined, { sensitivity: 'base' })
  );
};

let __desktopGalleryFocusKey = null;
let __desktopGalleryFocusLayer = null;
function __desktopGalleryFocusItem(key) {
  if (!key) return null;
  const [kind, id] = key.split(':');
  return galleryItems().find(item => item.kind === kind && item.id === id) || null;
}
function __desktopGalleryFocusCardMarkup(item) {
  const owner = item.owner || {};
  const displayOwner = { name: item.card?.name || item.name, card: item.card, classId: owner.classId, layoutClassId: owner.layoutClassId, category: owner.category, slot: owner.slot ?? item.slot, noteOwnerId: owner.noteOwnerId, noteTier: owner.noteTier, source: owner.source };
  const markup = renderCardPreview(displayOwner);
  return `<div class="gallery-focus-card" data-gallery-focus-card="${escapeHtml(`${item.kind}:${item.id}`)}" role="group" aria-label="Carta ampliada: ${escapeHtml(item.card?.name || item.name || '')}"><div class="gallery-focus-preview">${markup}</div></div>`;
}
function __desktopFocusValue(item, field) {
  const card = item?.card || {};
  return String(({ name: card.name || item?.name || '', type: card.type || 'Skill', element: card.element || 'Neutral', cost: card.cost ?? '1', ruleText: card.ruleText || '', flavourText: card.flavourText || '' })[field] ?? '');
}
function __desktopGalleryFocusSetDisplay(field, value, source = null) {
  const layer = document.querySelector('#galleryFocusLayer');
  if (!layer) return;
  const editor = layer.querySelector(`[data-gallery-focus-edit="${field}"]`);
  if (!editor || (editor === source && editor.isContentEditable)) return;
  if (['name', 'ruleText', 'flavourText'].includes(field)) editor.textContent = String(value);
  else {
    const display = editor.parentElement?.querySelector('[data-gallery-focus-display]');
    if (display) display.textContent = String(value);
    if (editor instanceof HTMLSelectElement) editor.value = String(value);
  }
}
function __desktopGalleryFocusMakeSelect(playcard, field, selector, options, item) {
  const host = playcard.querySelector(selector);
  if (!host || host.querySelector(`[data-gallery-focus-edit="${field}"]`)) return;
  const value = __desktopFocusValue(item, field);
  host.dataset.galleryFocusHost = field;
  host.style.position = 'relative';
  const select = document.createElement('select');
  select.className = 'gallery-focus-edit-select';
  select.dataset.galleryEdit = field;
  select.dataset.galleryFocusEdit = field;
  select.setAttribute('aria-label', `Editar ${field === 'cost' ? 'custo' : field === 'type' ? 'tipo' : 'elemento'} da carta`);
  select.innerHTML = options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('');
  select.value = value;
  const display = document.createElement('span');
  display.dataset.galleryFocusDisplay = 'true';
  display.textContent = value;
  display.setAttribute('aria-hidden', 'true');
  host.replaceChildren(display);
  host.append(select);
}
function __desktopGalleryFocusEnableEditors(layer, item) {
  const card = layer.querySelector('.gallery-focus-preview .playcard');
  if (!card) return;
  const textFields = [
    ['name', '.playcard-layout-title,.class-mechanic-title,.playcard-head b'],
    ['ruleText', '.playcard-layout-rules,.class-mechanic-rules,.playcard-rules'],
    ['flavourText', '.playcard-layout-flavour,.playcard-flavour']
  ];
  for (const [field, selector] of textFields) {
    const editor = card.querySelector(selector);
    if (!editor) continue;
    editor.dataset.galleryEdit = field;
    editor.dataset.galleryFocusEdit = field;
    editor.contentEditable = 'true';
    editor.spellcheck = false;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', `Editar ${field === 'name' ? 'nome' : field === 'ruleText' ? 'texto de regras' : 'flavour text'} da carta`);
  }
  __desktopGalleryFocusMakeSelect(card, 'cost', '.playcard-layout-cost,.energy-orb', ['X', '0', '1', '2', '3', '4', '5'], item);
  __desktopGalleryFocusMakeSelect(card, 'type', '.playcard-layout-type,.playcard-type', ['Class Mechanic', 'Attack', 'Power', 'Skill', 'Other'], item);
  __desktopGalleryFocusMakeSelect(card, 'element', '.playcard-layout-element,.playcard-element', ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'], item);
}
function __desktopUpdateGalleryFocusGeometry() {
  const layer = document.querySelector('#galleryFocusLayer');
  const scroll = document.querySelector('#center .gallery-scroll');
  if (!layer || !scroll) return;
  const rect = scroll.getBoundingClientRect();
  Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}
function __desktopRenderGalleryFocusLayer() {
  const scroll = document.querySelector('#center .gallery-scroll');
  const item = state.tab === 'gallery' ? __desktopGalleryFocusItem(__desktopGalleryFocusKey) : null;
  if (!scroll || !item) {
    document.querySelector('#galleryFocusLayer')?.remove();
    __desktopGalleryFocusLayer = null;
    document.querySelectorAll('#center .gallery-scroll').forEach(element => element.classList.remove('gallery-focus-open', 'gallery-hover-dim'));
    document.querySelectorAll('.gallery-card-focus-source,.gallery-card-spotlight').forEach(element => element.classList.remove('gallery-card-focus-source', 'gallery-card-spotlight'));
    __desktopGalleryFocusKey = null;
    return;
  }
  __desktopHideGalleryTooltip();
  scroll.classList.add('gallery-focus-open');
  scroll.classList.remove('gallery-hover-dim');
  document.querySelectorAll('.gallery-card-focus-source').forEach(element => element.classList.remove('gallery-card-focus-source'));
  const sourceTile = [...document.querySelectorAll('.gallery-card[data-gallery-card]')].find(tile => tile.dataset.galleryCard === __desktopGalleryFocusKey);
  sourceTile?.classList.add('gallery-card-focus-source');
  const previous = document.querySelector('#galleryFocusLayer');
  previous?.remove();
  const layer = document.createElement('div');
  layer.id = 'galleryFocusLayer';
  layer.className = 'gallery-focus-layer';
  layer.dataset.dimEnabled = String(data.preferences?.galleryDimEnabled !== false);
  layer.innerHTML = `<div class="gallery-focus-backdrop" aria-hidden="true"></div>${__desktopGalleryFocusCardMarkup(item)}`;
  document.body.append(layer);
  __desktopGalleryFocusLayer = layer;
  const focusCard = layer.querySelector('.gallery-focus-card');
  const preview = focusCard?.querySelector('.gallery-focus-preview');
  const playcard = preview?.querySelector('.playcard');
  if (focusCard && playcard) {
    playcard.style.transform = 'none';
    playcard.style.removeProperty('--S');
    const natural = playcard.getBoundingClientRect();
    const availableWidth = Math.max(220, Math.min(680, scroll.clientWidth * .44));
    const availableHeight = Math.max(300, scroll.clientHeight * .86);
    const scale = natural.width > 0 && natural.height > 0 ? Math.min(availableWidth / natural.width, availableHeight / natural.height) : 1;
    const baseScale = parseFloat(getComputedStyle(playcard).getPropertyValue('--S')) || 1;
    playcard.style.setProperty('--S', String(baseScale * scale));
    __desktopFitCardDescriptions(playcard);
    focusCard.style.width = `${Math.min(natural.width * scale, availableWidth)}px`;
    focusCard.style.height = `${Math.min(natural.height * scale, availableHeight)}px`;
    __desktopGalleryFocusEnableEditors(layer, item);
  }
  __desktopUpdateGalleryFocusGeometry();
}
function __desktopCloseGalleryFocus() {
  __desktopGalleryFocusKey = null;
  document.querySelector('#galleryFocusLayer')?.remove();
  __desktopGalleryFocusLayer = null;
  document.querySelectorAll('#center .gallery-scroll').forEach(element => element.classList.remove('gallery-focus-open', 'gallery-hover-dim'));
  document.querySelectorAll('.gallery-card-focus-source,.gallery-card-spotlight').forEach(element => element.classList.remove('gallery-card-focus-source', 'gallery-card-spotlight'));
}
const __desktopGalleryFocusOriginalView = galleryView;
galleryView = function (...args) {
  const result = __desktopGalleryFocusOriginalView.apply(this, args);
  if (state.tab === 'gallery') __desktopRenderGalleryFocusLayer();
  else if (__desktopGalleryFocusKey) __desktopCloseGalleryFocus();
  return result;
};

const __desktopGalleryFocusStyle = document.createElement('style');
__desktopGalleryFocusStyle.id = 'desktopGalleryFocusStyle';
__desktopGalleryFocusStyle.textContent = `
#center .gallery-scroll{position:relative!important}
#center .gallery-scroll.gallery-hover-dim::before{content:"";position:absolute;z-index:30;inset:0;background:rgba(0,0,0,.30);pointer-events:none}
#center .gallery-scroll.gallery-hover-dim .gallery-card-spotlight{position:relative;z-index:31;filter:none!important}
#center .gallery-scroll.gallery-focus-open .gallery-card-focus-source{visibility:hidden!important}
.gallery-focus-layer{position:fixed;z-index:90;box-sizing:border-box;overflow:hidden;isolation:isolate;display:grid;place-items:center;pointer-events:auto}
.gallery-focus-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.30);pointer-events:auto}
.gallery-focus-layer[data-dim-enabled="false"] .gallery-focus-backdrop{background:transparent}
.gallery-focus-card{position:relative;z-index:1;max-width:94%;max-height:94%;display:grid;place-items:center;overflow:visible;filter:drop-shadow(0 10px 24px #000e)}
.gallery-focus-preview{position:absolute;inset:0;display:grid;place-items:center;overflow:visible}
.gallery-focus-preview>.playcard{flex:none;overflow:hidden!important;max-width:none!important;max-height:none!important}
.gallery-focus-preview .playcard-layout-title,.gallery-focus-preview .class-mechanic-title,.gallery-focus-preview .playcard-head b,.gallery-focus-preview .playcard-layout-rules,.gallery-focus-preview .class-mechanic-rules,.gallery-focus-preview .playcard-rules,.gallery-focus-preview .playcard-layout-flavour,.gallery-focus-preview .playcard-flavour{pointer-events:auto!important;cursor:text!important;user-select:text!important;-webkit-user-select:text!important}
.gallery-focus-preview .playcard-art-window{pointer-events:auto!important;cursor:pointer!important}
.gallery-focus-preview [contenteditable="true"]:focus{outline:2px solid #70e2ff!important;outline-offset:1px;box-shadow:0 0 10px #54d9f8aa}
.gallery-focus-edit-select{position:absolute!important;z-index:8!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;opacity:.001!important;cursor:pointer!important}
.gallery-focus-preview [data-gallery-focus-host]{pointer-events:auto!important;cursor:pointer!important}
.gallery-focus-preview .playcard-layout-cost,.gallery-focus-preview .playcard-layout-type,.gallery-focus-preview .playcard-layout-element,.gallery-focus-preview .playcard-type,.gallery-focus-preview .playcard-element,.gallery-focus-preview .energy-orb{pointer-events:auto!important;cursor:pointer!important}
`;
document.head.append(__desktopGalleryFocusStyle);

document.addEventListener('pointerover', event => {
  if (state.tab !== 'gallery' || __desktopGalleryFocusKey || data.preferences?.galleryDimEnabled === false) return;
  const tile = event.target instanceof Element ? event.target.closest('#center .gallery-card[data-gallery-card]') : null;
  const scroll = tile?.closest('.gallery-scroll');
  if (!tile || !scroll || tile.contains(event.relatedTarget)) return;
  scroll.classList.add('gallery-hover-dim');
  tile.classList.add('gallery-card-spotlight');
}, true);
document.addEventListener('pointerout', event => {
  const tile = event.target instanceof Element ? event.target.closest('#center .gallery-card[data-gallery-card]') : null;
  if (!tile || tile.contains(event.relatedTarget)) return;
  tile.classList.remove('gallery-card-spotlight');
  const scroll = tile.closest('.gallery-scroll');
  if (!scroll?.querySelector('.gallery-card-spotlight')) scroll?.classList.remove('gallery-hover-dim');
}, true);
document.addEventListener('click', event => {
  const layer = document.querySelector('#galleryFocusLayer');
  if (!layer || !(event.target instanceof Element) || !layer.contains(event.target)) return;
  if (event.target.closest('.gallery-focus-card')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const focusedKey = __desktopGalleryFocusKey;
  if (event.detail > 1) {
    layer.style.visibility = 'hidden';
    const beneath = document.elementFromPoint(event.clientX, event.clientY);
    layer.style.visibility = '';
    const tile = beneath?.closest?.('.gallery-card[data-gallery-card]');
    if (tile?.dataset.galleryCard === focusedKey && beneath.closest('.gallery-art')) {
      __desktopCloseGalleryFocus();
      state.gallerySelected = focusedKey;
      const picker = document.querySelector('#galleryArtUpload');
      if (picker && !picker.disabled) picker.click();
      return;
    }
  }
  __desktopCloseGalleryFocus();
}, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !__desktopGalleryFocusKey || document.querySelector('#modal')?.children.length) return;
  event.preventDefault(); event.stopImmediatePropagation();
  __desktopCloseGalleryFocus();
}, true);
document.addEventListener('input', event => {
  const editor = event.target instanceof Element ? event.target.closest('#galleryFocusLayer [contenteditable="true"][data-gallery-focus-edit]') : null;
  if (!editor || state.tab !== 'gallery') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const field = editor.dataset.galleryFocusEdit;
  editor.dataset.galleryEdit = field;
  editor.value = editor.textContent || '';
  galleryEdit({ target: editor });
}, true);
document.addEventListener('change', event => {
  const editor = event.target instanceof Element ? event.target.closest('#galleryFocusLayer select[data-gallery-focus-edit]') : null;
  if (!editor || state.tab !== 'gallery') return;
  event.preventDefault(); event.stopImmediatePropagation();
  galleryEdit({ target: editor });
}, true);
document.addEventListener('dblclick', event => {
  const art = event.target instanceof Element ? event.target.closest('#galleryFocusLayer .playcard-art-window') : null;
  if (!art || state.tab !== 'gallery') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const selected = getGallerySelection();
  if (selected?.card?.status === 'CONFIRMADO') return toast('Desconfirme a carta antes de substituir a arte aprovada.');
  const picker = document.querySelector('#galleryArtUpload');
  if (picker && !picker.disabled) picker.click();
}, true);

const __desktopGalleryFocusOriginalEdit = galleryEdit;
galleryEdit = function (event) {
  const source = event?.target;
  const field = source?.dataset?.galleryEdit;
  const result = __desktopGalleryFocusOriginalEdit(event);
  if (!result || !field) return result;
  const value = source.value ?? source.textContent ?? '';
  const inspector = document.querySelector(`#inspect [data-gallery-edit="${field}"]`);
  if (inspector && inspector !== source) inspector.value = String(value);
  __desktopGalleryFocusSetDisplay(field, value, source);
  return result;
};
document.addEventListener('input', event => {
  if (event.target?.id !== 'uiSoundVolume' || !event.target.isConnected) return;
  const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
  const output = document.querySelector('#uiSoundVolumeValue');
  if (output) output.value = `${value}%`;
  data.preferences = { ...(data.preferences || {}), uiSoundVolume: value };
  __desktopScheduleUiPreferenceCommit(true);
}, true);
document.addEventListener('change', event => {
  if (event.target?.id === 'galleryDimDisabled') {
    data.preferences = { ...(data.preferences || {}), galleryDimEnabled: !event.target.checked };
    __desktopScheduleUiPreferenceCommit(true);
    if (event.target.checked) {
      document.querySelectorAll('#center .gallery-scroll.gallery-hover-dim').forEach(scroll => scroll.classList.remove('gallery-hover-dim'));
      document.querySelectorAll('.gallery-card-spotlight').forEach(tile => tile.classList.remove('gallery-card-spotlight'));
    }
    const layer = document.querySelector('#galleryFocusLayer');
    if (layer) layer.dataset.dimEnabled = String(!event.target.checked);
    return;
  }
  if (event.target?.id === 'uiSoundVolume') {
    const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
    data.preferences = { ...(data.preferences || {}), uiSoundVolume: value };
    __desktopScheduleUiPreferenceCommit(true);
  }
}, true);
window.addEventListener('resize', __desktopUpdateGalleryFocusGeometry, { passive: true });
document.addEventListener('scroll', __desktopUpdateGalleryFocusGeometry, true);
