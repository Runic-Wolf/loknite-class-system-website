import type { CardCategory, CardElement, CardStatus, CardType } from './types';

export type CardFilters = {
  q: string;
  category: CardCategory | '';
  status: CardStatus | '';
  tags: string[];
  types: CardType[];
  costs: string[];
  elements: CardElement[];
  tiers: Array<'C1' | 'C2' | 'C3' | 'SPEC'>;
};

export const categoryOptions: Array<[CardCategory | '', string]> = [
  ['', 'All categories'], ['class', 'Class'], ['enemy', 'Enemy'], ['neutral', 'Neutral'],
  ['equipment', 'Equipment'], ['species', 'Species'], ['status', 'Status'],
];

export const cardTypeOptions: CardType[] = ['Class Mechanic', 'Power', 'Attack', 'Skill', 'Other'];
export const costOptions = ['X', '0', '1', '2', '3', '4', '5'];
export const elementOptions: CardElement[] = ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'];
export const roleTagOptions = ['DPS', 'TANK', 'HEAL', 'CTRL', 'BUFF', 'DEBUFF', 'BURST', 'DOT'];
export const classTierOptions: Array<'C1' | 'C2' | 'C3' | 'SPEC'> = ['C1', 'C2', 'C3', 'SPEC'];
export const statusOptions: Array<[CardStatus | '', string]> = [['', 'All statuses'], ['RASCUNHO', 'Draft'], ['CONFIRMADO', 'Confirmed']];

export function filtersFromParams(params: URLSearchParams): CardFilters {
  return {
    q: params.get('q') ?? '',
    category: (params.get('category') ?? '') as CardCategory | '',
    status: (params.get('status') ?? '') as CardStatus | '',
    tags: params.getAll('tag'),
    types: params.getAll('type') as CardType[],
    costs: params.getAll('cost'),
    elements: params.getAll('element') as CardElement[],
    tiers: params.getAll('tier') as CardFilters['tiers'],
  };
}

export function cardListParams(params: URLSearchParams): URLSearchParams {
  const list = new URLSearchParams();
  for (const key of ['q', 'category', 'status', 'tag', 'type', 'cost', 'element', 'tier', 'owner', 'origin', 'family', 'classId', 'compareClass', 'group', 'after']) {
    for (const value of params.getAll(key)) if (value) list.append(key, value);
  }
  return list;
}
