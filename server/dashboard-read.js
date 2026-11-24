import { HttpError } from './http.js';
import { classQueryCte, compileClassQueryRules } from './class-query-sql.js';
import { readClassQuery } from '../shared/class-query.js';

const structuralTiers = ['C1', 'C2', 'C3', 'SPEC'];

export function dashboardQuery(sql, params) {
  let query;
  try { query = readClassQuery(params); }
  catch { throw new HttpError(422, 'Consulta do Dashboard inválida.'); }

  const rawSearch = (params.get('q') ?? '').trim();
  if (rawSearch.length > 120) throw new HttpError(422, 'A busca do Dashboard deve ter até 120 caracteres.');
  const compiled = compileClassQueryRules(query, 'c');
  const predicates = [];
  const bindings = [...compiled.bindings];
  if (compiled.predicate) predicates.push(compiled.predicate);
  if (rawSearch) {
    predicates.push(`(instr(lower(c.name), lower(?)) > 0
      OR instr(lower(COALESCE(c.concept, '')), lower(?)) > 0
      OR instr(lower(COALESCE(c.notes, '')), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM effective_class_tags search_tag
        WHERE search_tag.class_id = c.id AND instr(lower(search_tag.tag), lower(?)) > 0))`);
    bindings.push(rawSearch, rawSearch, rawSearch, rawSearch);
  }
  const where = predicates.length ? ' WHERE ' + predicates.join(' AND ') : '';
  const withSql = `${classQueryCte({ needsPath: true, needsEffectiveTags: true })}, filtered_classes AS (
    SELECT c.id, c.name, c.tier, c.slot, c.position, c.parent_id AS parentId, c.concept
    FROM classes c${where}
  ) `;
  const metrics = sql.exec(`${withSql}SELECT
    count(*) AS classes,
    coalesce(sum(CASE WHEN tier = 'C3' THEN 1 ELSE 0 END), 0) AS c3,
    coalesce(sum(CASE WHEN tier = 'SPEC' THEN 1 ELSE 0 END), 0) AS specializations,
    (SELECT count(DISTINCT available.id)
      FROM filtered_classes selected
      JOIN class_path path ON path.class_id = selected.id
      JOIN skills available ON available.class_id = path.ancestor_id) AS skills,
    coalesce(sum(CASE WHEN tier = 'C1' THEN 1 ELSE 0 END), 0) AS c1,
    coalesce(sum(CASE WHEN tier = 'C2' THEN 1 ELSE 0 END), 0) AS c2
    FROM filtered_classes`, ...bindings).one();
  const tierCounts = { C1: metrics.c1, C2: metrics.c2, C3: metrics.c3, SPEC: metrics.specializations };
  const tagCoverage = sql.exec(`${withSql}SELECT tags.tag, count(DISTINCT selected.id) AS classes
    FROM filtered_classes selected JOIN effective_class_tags tags ON tags.class_id = selected.id
    WHERE tags.tag NOT IN ('C1', 'C2', 'C3', 'SPEC')
    GROUP BY tags.tag ORDER BY classes DESC, tags.tag COLLATE NOCASE, tags.tag LIMIT 12`, ...bindings).toArray();
  const classes = sql.exec(`${withSql}SELECT selected.id, selected.name, selected.tier, selected.slot, selected.parentId, selected.concept, selected.position,
      (SELECT count(*) FROM effective_class_tags tags WHERE tags.class_id = selected.id AND tags.tag NOT IN ('C1', 'C2', 'C3', 'SPEC')) AS effectiveTagCount
    FROM filtered_classes selected ORDER BY selected.position, selected.id LIMIT 8`, ...bindings).toArray();

  return {
    query,
    search: rawSearch,
    total: metrics.classes,
    counts: { classes: metrics.classes, c3: metrics.c3, skills: metrics.skills, specializations: metrics.specializations },
    tierCounts,
    tagCoverage,
    classes,
    resultsTruncated: metrics.classes > classes.length,
  };
}
