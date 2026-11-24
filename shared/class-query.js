export const classQueryDefaults = Object.freeze({ logic: 'AND', source: 'effective', rules: [] });

const queryFields = new Set(['tag', 'tier', 'name', 'kind', 'hasSkills', 'favorite']);
const tiers = new Set(['C1', 'C2', 'C3', 'SPEC']);
const skillKinds = new Set(['Passive', 'Active', 'Signature', 'Ultimate']);

function fail() {
  throw new TypeError('Consulta de classes inválida.');
}

export function normalizeClassQuery(value, depth = 0) {
  if (depth > 8) fail();
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const logic = value.logic === undefined ? classQueryDefaults.logic : value.logic;
  const source = value.source === undefined ? classQueryDefaults.source : value.source;
  if (!['AND', 'OR'].includes(logic) || !['direct', 'effective'].includes(source) || !Array.isArray(value.rules) || value.rules.length > 12) fail();

  const rules = value.rules.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !queryFields.has(rule.field)
      || typeof rule.value !== 'string' || typeof (rule.enabled ?? true) !== 'boolean' || typeof (rule.exclude ?? false) !== 'boolean') fail();
    const content = rule.value.trim();
    if (!content || content.length > 80) fail();
    if (rule.field === 'tier' && !tiers.has(content)) fail();
    if (rule.field === 'kind' && !skillKinds.has(content)) fail();
    if (['hasSkills', 'favorite'].includes(rule.field) && !['yes', 'no'].includes(content)) fail();
    return { field: rule.field, value: content, enabled: rule.enabled ?? true, exclude: rule.exclude ?? false };
  });

  const normalized = { logic, source, rules };
  if (value.scope !== undefined) {
    const scope = normalizeClassQuery(value.scope, depth + 1);
    if (!scope.rules.length && !scope.scope) fail();
    normalized.scope = scope;
  }
  return normalized;
}

export function readClassQuery(params) {
  const raw = params.get('where');
  if (raw !== null) {
    if (raw.length > 6000 || params.getAll('tag').length) fail();
    let value;
    try { value = JSON.parse(raw); } catch { fail(); }
    return normalizeClassQuery(value);
  }

  const source = params.get('tagSource') ?? classQueryDefaults.source;
  if (!['direct', 'effective'].includes(source)) fail();
  const rules = params.getAll('tag').map(tag => ({ field: 'tag', value: tag, enabled: true, exclude: false }));
  return normalizeClassQuery({ logic: 'AND', source, rules });
}

export function classQueryToSearchParams(query, current = new URLSearchParams()) {
  const normalized = normalizeClassQuery(query);
  const params = new URLSearchParams(current);
  params.delete('tag');
  params.delete('tagSource');
  if (normalized.rules.length || normalized.scope || normalized.logic !== 'AND' || normalized.source !== 'effective') {
    params.set('where', JSON.stringify(normalized));
  } else {
    params.delete('where');
  }
  params.delete('after');
  params.delete('id');
  return params;
}
