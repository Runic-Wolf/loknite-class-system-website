export const tagGroups = [
  { id: 'tier', label: 'C-Tier', tags: ['C1', 'C2', 'C3', 'SPEC'], structural: true },
  { id: 'roles', label: 'Roles', tags: ['DPS', 'TANK', 'HEAL', 'CTRL', 'BUFF', 'DEBUFF', 'BURST', 'DOT'] },
  { id: 'stats', label: 'Stats', tags: ['STR', 'DEX', 'AGI', 'VIT', 'INT', 'WIL', 'AUS', 'WIT', 'CHA'] },
  { id: 'armor', label: 'Armor', tags: ['LIGHT', 'MEDIUM', 'HEAVY', 'SHIELD'] },
  { id: 'melee', label: 'Melee Weapons', tags: ['1H Sword', '2H Sword', '1H Axe', '2H Axe', '1H Mace', '2H Mace', '1H Spear', '2H Spear', '1H Katana', '2H Katana'] },
  { id: 'ranged', label: 'Ranged Weapons', tags: ['Shortbow', 'Longbow', 'Handgun', 'Crossbow', 'Pistol', 'Blunderbuss', 'Cannon', 'Musket'] },
  { id: 'other', label: 'Other Weapons', tags: ['1H Wand', '2H Rod', '2H Staff', 'Knuckles', 'Claws', 'Dagger', 'Katar'] },
  { id: 'elements', label: 'Elements', tags: ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'] },
  { id: 'traits', label: 'Traits', custom: true, tags: [] },
  { id: 'custom', label: 'Custom', custom: true, tags: [] },
];

export const tagCatalog = new Set(tagGroups.flatMap(group => group.tags));
export const customTagGroupIds = ['traits', 'custom'];
