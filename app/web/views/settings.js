const themes = [
  { id: 'classic', name: 'Lok’nite Classic', copy: 'The original deep navy, cyan and warm gold palette.' },
  { id: 'obsidian', name: 'Obsidian', copy: 'A quieter graphite surface with gold highlights.' },
  { id: 'ember', name: 'Ember', copy: 'Warm charcoal, copper and soft amber accents.' }
];
const themeColors = { classic: '#07131d', obsidian: '#111315', ember: '#17120f' };

function selected(value, candidate) {
  return value === candidate ? 'checked' : '';
}

export function renderSettings() {
  const theme = document.documentElement.dataset.theme || 'classic';
  const density = document.documentElement.dataset.density || 'comfortable';
  return `<section class="page-heading"><div><span class="eyebrow">WORKSPACE PREFERENCES</span><h1>Appearance</h1><p>Choose a palette and reading density for this browser. These preferences do not change Vault records.</p></div></section>
    <section class="surface settings-panel" aria-labelledby="theme-title"><div class="surface-heading"><div><span class="eyebrow">COLOR SYSTEM</span><h2 id="theme-title">Choose a palette</h2></div><span class="surface-note">Saved on this device</span></div>
      <fieldset class="theme-options"><legend class="sr-only">Color palette</legend>${themes.map(option => `<label class="theme-option"><input type="radio" name="theme" value="${option.id}" ${selected(theme, option.id)}><span class="theme-preview theme-preview-${option.id}" aria-hidden="true"><i></i><i></i><i></i></span><span class="theme-option-copy"><strong>${option.name}</strong><small>${option.copy}</small></span></label>`).join('')}</fieldset>
    </section>
    <section class="surface settings-panel density-panel" aria-labelledby="density-title"><div class="surface-heading"><div><span class="eyebrow">CONTENT SPACING</span><h2 id="density-title">Reading density</h2></div></div>
      <fieldset class="density-options"><legend class="sr-only">Reading density</legend>
        <label class="density-option"><input type="radio" name="density" value="comfortable" ${selected(density, 'comfortable')}><span><strong>Comfortable</strong><small>More breathing room between records.</small></span></label>
        <label class="density-option"><input type="radio" name="density" value="compact" ${selected(density, 'compact')}><span><strong>Compact</strong><small>Fit more rows on smaller displays.</small></span></label>
      </fieldset><p class="preference-status" data-preference-status role="status" aria-live="polite">Preferences apply immediately.</p>
    </section>`;
}

export function wireSettings() {
  const status = document.querySelector('[data-preference-status]');
  if (!status) return;
  document.querySelectorAll('input[name="theme"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    document.documentElement.dataset.theme = input.value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[input.value] ?? themeColors.classic);
    persist('lcs-theme', input.value, status);
  }));
  document.querySelectorAll('input[name="density"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    document.documentElement.dataset.density = input.value;
    persist('lcs-density', input.value, status);
  }));
}

function persist(key, value, status) {
  try {
    localStorage.setItem(key, value);
    status.textContent = 'Preference saved on this device.';
  } catch {
    status.textContent = 'Preference applied for this session; browser storage is unavailable.';
  }
}
