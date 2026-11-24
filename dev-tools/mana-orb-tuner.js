const card = document.querySelector('#card-preview');
const controls = {
  diameter: document.querySelector('#diameter'),
  offsetX: document.querySelector('#offset-x'),
  offsetY: document.querySelector('#offset-y'),
  layer: document.querySelector('#layer'),
  costFont: document.querySelector('#cost-font'),
  cost: document.querySelector('#cost-text'),
};
const outputs = {
  diameter: document.querySelector('#diameter-output'),
  offsetX: document.querySelector('#offset-x-output'),
  offsetY: document.querySelector('#offset-y-output'),
  costFont: document.querySelector('#cost-font-output'),
};
const configOutput = document.querySelector('#config');
const status = document.querySelector('#status');
const storageKey = 'lcs.mana-orb-tuner.v2';
const defaults = { diameter: 69, offsetX: 0.2, offsetY: 0.2, layer: 'behind', costFont: 5.8, cost: '2' };

function readSavedSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!value || typeof value !== 'object') return defaults;
    return {
      diameter: clamp(value.diameter, 58, 82, defaults.diameter),
      offsetX: clamp(value.offsetX, -1.5, 1.5, defaults.offsetX),
      offsetY: clamp(value.offsetY, -1.5, 1.5, defaults.offsetY),
      layer: value.layer === 'behind' ? 'behind' : 'front',
      costFont: clamp(value.costFont, 5, 9.5, defaults.costFont),
      cost: typeof value.cost === 'string' ? value.cost.slice(0, 2) : defaults.cost,
    };
  } catch {
    return defaults;
  }
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function settings() {
  return {
    diameter: Number(controls.diameter.value),
    offsetX: Number(controls.offsetX.value),
    offsetY: Number(controls.offsetY.value),
    layer: controls.layer.value,
    costFont: Number(controls.costFont.value),
    cost: controls.cost.value.slice(0, 2),
  };
}

function applySettings(value, announce = false) {
  controls.diameter.value = String(value.diameter);
  controls.offsetX.value = String(value.offsetX);
  controls.offsetY.value = String(value.offsetY);
  controls.layer.value = value.layer;
  controls.costFont.value = String(value.costFont);
  controls.cost.value = value.cost;
  card.dataset.layer = value.layer;
  card.style.setProperty('--orb-diameter', `${value.diameter}%`);
  card.style.setProperty('--slot-x', `${value.offsetX}%`);
  card.style.setProperty('--slot-y', `${value.offsetY}%`);
  card.style.setProperty('--cost-font', `${value.costFont}cqi`);
  document.querySelector('#cost-value').textContent = value.cost || ' ';
  outputs.diameter.value = `${value.diameter}%`;
  outputs.offsetX.value = `${value.offsetX.toFixed(1)}%`;
  outputs.offsetY.value = `${value.offsetY.toFixed(1)}%`;
  outputs.costFont.value = `${value.costFont.toFixed(1)}cqi`;
  const config = {
    manaOrb: {
      version: 1,
      diameterPercentOfSlot: value.diameter,
      slotOffsetXPercentOfCard: Number(value.offsetX.toFixed(1)),
      slotOffsetYPercentOfCard: Number(value.offsetY.toFixed(1)),
      renderLayer: value.layer === 'behind' ? 'behind-frame' : 'above-frame',
      costFontCqi: Number(value.costFont.toFixed(1)),
      chargePercent: 97,
    },
  };
  configOutput.value = JSON.stringify(config, null, 2);
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  if (announce) status.textContent = 'Preview updated. Copy the config when it looks right.';
}

for (const control of Object.values(controls)) {
  control.addEventListener('input', () => applySettings(settings(), true));
  control.addEventListener('change', () => applySettings(settings(), true));
}

document.querySelector('#reset').addEventListener('click', () => {
  try { localStorage.removeItem(storageKey); } catch {}
  applySettings(defaults, true);
  status.textContent = 'Defaults restored.';
});

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(configOutput.value);
    status.textContent = 'Config copied. Paste it into the chat.';
  } catch {
    configOutput.focus();
    configOutput.select();
    status.textContent = 'Clipboard unavailable. Config selected; press Ctrl+C to copy.';
  }
});

for (const image of document.querySelectorAll('.card-frame, .orb-image')) {
  image.addEventListener('error', () => {
    status.textContent = `Could not load preview asset: ${image.getAttribute('src')}`;
  }, { once: true });
}

applySettings(readSavedSettings());
