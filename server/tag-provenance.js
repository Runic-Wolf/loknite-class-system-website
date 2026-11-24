import { HttpError } from './http.js';

const structuralTiers = new Set(['C1', 'C2', 'C3', 'SPEC']);

export function classTagProvenance(sql, id) {
  const lineageRows = sql.exec(`WITH RECURSIVE lineage(id, name, tier, parent_id, depth) AS (
    SELECT id, name, tier, parent_id, 0 FROM classes WHERE id = ?
    UNION ALL
    SELECT parent.id, parent.name, parent.tier, parent.parent_id, lineage.depth + 1
      FROM classes parent JOIN lineage ON parent.id = lineage.parent_id
      WHERE lineage.depth < 3
  ) SELECT id, name, tier, depth FROM lineage ORDER BY depth DESC`, id).toArray();
  const current = lineageRows.at(-1);
  if (!current) throw new HttpError(404, 'Classe indisponível.');

  const classTagRows = sql.exec(`SELECT t.tag, c.id AS classId, c.name AS className
    FROM class_tags t JOIN classes c ON c.id = t.entity_id
    WHERE t.entity_id = ? ORDER BY t.position, t.tag`, id).toArray();
  const skillTagRows = sql.exec(`WITH RECURSIVE lineage(id, name, tier, parent_id, depth) AS (
    SELECT id, name, tier, parent_id, 0 FROM classes WHERE id = ?
    UNION ALL
    SELECT parent.id, parent.name, parent.tier, parent.parent_id, lineage.depth + 1
      FROM classes parent JOIN lineage ON parent.id = lineage.parent_id
      WHERE lineage.depth < 3
  )
  SELECT skills.id AS skillId, skills.name AS skillName, skills.class_id AS classId,
    lineage.name AS className, lineage.depth, skill_tags.tag
    FROM lineage JOIN skills ON skills.class_id = lineage.id
    JOIN skill_tags ON skill_tags.entity_id = skills.id
    ORDER BY lineage.depth DESC, skills.position, skills.id, skill_tags.position, skill_tags.tag`, id).toArray();

  const tags = new Map();
  const addSource = (tag, source) => {
    if (structuralTiers.has(tag)) return;
    let entry = tags.get(tag);
    if (!entry) {
      entry = {
        value: tag,
        occurrenceCount: 0,
        directOnClass: false,
        fromOwnSkills: false,
        fromAncestorSkills: false,
        sources: [],
      };
      tags.set(tag, entry);
    }
    entry.occurrenceCount += 1;
    entry.directOnClass ||= source.kind === 'class';
    entry.fromOwnSkills ||= source.kind === 'skill' && !source.inherited;
    entry.fromAncestorSkills ||= source.kind === 'skill' && source.inherited;
    entry.sources.push(source);
  };

  for (const row of classTagRows) {
    addSource(row.tag, {
      kind: 'class', recordId: row.classId, recordName: row.className,
      classId: row.classId, className: row.className, inherited: false,
    });
  }
  for (const row of skillTagRows) {
    const inherited = row.classId !== id;
    addSource(row.tag, {
      kind: 'skill', recordId: row.skillId, recordName: row.skillName,
      classId: row.classId, className: row.className, inherited,
    });
  }

  const items = [...tags.values()];
  return {
    class: { id: current.id, name: current.name, tier: current.tier },
    lineage: lineageRows.map(({ id: classId, name, tier }) => ({ id: classId, name, tier })),
    counts: {
      effective: items.length,
      directOnClass: items.filter(tag => tag.directOnClass).length,
      ownSkills: items.filter(tag => tag.fromOwnSkills).length,
      inheritedSkills: items.filter(tag => tag.fromAncestorSkills).length,
    },
    tags: items,
  };
}
