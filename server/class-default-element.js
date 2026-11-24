const defaultElements = Object.freeze({
  arcanist: 'Arcane',
  naturalist: 'Nature',
  cleric: 'Holy',
  acolyte: 'Profane',
  spiritualist: 'Spiritual',
  draconologist: 'Fire',
  dragonologist: 'Fire',
  enlightened: 'Holy',
  taoist: 'Spiritual',
  spellblade: 'Arcane',
  viper: 'Nature',
  'arcane trickster': 'Arcane',
  buccaneer: 'Water',
  'follower of avalyx': 'Water',
});

export function defaultElementForClassLineage(lineage) {
  for (const item of [...lineage].reverse()) {
    const key = String(item.name ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
    if (defaultElements[key]) return defaultElements[key];
  }
  return 'Neutral';
}
