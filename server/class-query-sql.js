export function compileClassQueryRules(query, alias = 't') {
  if (!['t', 'c'].includes(alias)) throw new TypeError('Alias de consulta inválido.');
  const bindings = [];
  const requirements = { needsPath: false, needsEffectiveTags: false };
  function compile(current) {
    const activeRules = current?.rules.filter(rule => rule.enabled) ?? [];
    const predicates = activeRules.map(rule => {
    let condition;
    if (rule.field === 'tag') {
      if (['C1', 'C2', 'C3', 'SPEC'].includes(rule.value)) condition = '0';
      else if (current.source === 'effective') {
        requirements.needsPath = true;
        requirements.needsEffectiveTags = true;
        condition = `EXISTS (SELECT 1 FROM effective_class_tags rule_tag WHERE rule_tag.class_id = ${alias}.id AND rule_tag.tag = ?)`;
        bindings.push(rule.value);
      } else {
        condition = `EXISTS (SELECT 1 FROM class_tags rule_tag WHERE rule_tag.entity_id = ${alias}.id AND rule_tag.tag = ?)`;
        bindings.push(rule.value);
      }
    } else if (rule.field === 'tier') {
      condition = `${alias}.tier = ?`;
      bindings.push(rule.value);
    } else if (rule.field === 'name') {
      condition = `instr(lower(${alias}.name), lower(?)) > 0`;
      bindings.push(rule.value);
    } else if (rule.field === 'kind') {
      requirements.needsPath = true;
      condition = `EXISTS (SELECT 1 FROM class_path rule_path JOIN skills available ON available.class_id = rule_path.ancestor_id
        WHERE rule_path.class_id = ${alias}.id AND available.kind = ?)`;
      bindings.push(rule.value);
    } else if (rule.field === 'hasSkills') {
      requirements.needsPath = true;
      condition = `EXISTS (SELECT 1 FROM class_path rule_path JOIN skills available ON available.class_id = rule_path.ancestor_id
        WHERE rule_path.class_id = ${alias}.id)`;
      if (rule.value === 'no') condition = `NOT (${condition})`;
    } else {
      condition = `COALESCE(json_extract(${alias}.details, '$[0].favorite'), 0) = ?`;
      bindings.push(rule.value === 'yes' ? 1 : 0);
    }
    return rule.exclude ? `NOT (${condition})` : condition;
    });
    const parts = [];
    if (predicates.length) parts.push('(' + predicates.join(current.logic === 'AND' ? ' AND ' : ' OR ') + ')');
    if (current.scope) {
      const scoped = compile(current.scope);
      if (scoped) parts.push(`(${scoped})`);
    }
    return parts.length ? parts.join(' AND ') : null;
  }
  return {
    predicate: compile(query),
    bindings,
    ...requirements,
  };
}

export function classQueryCte(compiled) {
  if (!compiled.needsPath) return '';
  return `WITH RECURSIVE class_path(class_id, ancestor_id, depth) AS (
      SELECT id, id, 0 FROM classes
      UNION ALL
      SELECT path.class_id, parent.id, path.depth + 1
      FROM class_path path JOIN classes current ON current.id = path.ancestor_id
        JOIN classes parent ON parent.id = current.parent_id
      WHERE path.depth < 3
    )${compiled.needsEffectiveTags ? `, effective_class_tags(class_id, tag) AS (
      SELECT entity_id, tag FROM class_tags WHERE tag NOT IN ('C1', 'C2', 'C3', 'SPEC')
      UNION
      SELECT path.class_id, skill_tag.tag
      FROM class_path path JOIN skills skill ON skill.class_id = path.ancestor_id
        JOIN skill_tags skill_tag ON skill_tag.entity_id = skill.id
      WHERE skill_tag.tag NOT IN ('C1', 'C2', 'C3', 'SPEC')
    )` : ''} `;
}
