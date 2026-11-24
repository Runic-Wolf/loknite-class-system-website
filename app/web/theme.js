(() => {
  const themes = new Set(['classic', 'obsidian', 'ember']);
  const densities = new Set(['comfortable', 'compact']);
  const colors = { classic: '#07131d', obsidian: '#111315', ember: '#17120f' };
  try {
    const theme = localStorage.getItem('lcs-theme');
    const density = localStorage.getItem('lcs-density');
    if (themes.has(theme)) {
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
    }
    if (densities.has(density)) document.documentElement.dataset.density = density;
  } catch {
    // Preferences still work for this page session when browser storage is disabled.
  }
})();
