import { normalizeMentionKey, MAX_CLASS_NOTE_MENTIONS } from '../shared/class-mentions.js';
import { HttpError } from './http.js';
import { listTagGroups } from './catalog-tags.js';

const tiers = new Set(['C1', 'C2', 'C3']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const cardContext = row => [row.category, row.type, row.ownerName].filter(Boolean).join(' · ') || 'Card';

function validateMentions(input) {
  if (!input || !Array.isArray(input.mentions) || input.mentions.length > MAX_CLASS_NOTE_MENTIONS) {
    throw new HttpError(422, 'Send up to 40 class note references at a time.', 'INVALID_MENTIONS');
  }
  return input.mentions.map(mention => {
    if (!mention || typeof mention !== 'object' || Array.isArray(mention)
      || !Number.isInteger(mention.line) || mention.line < 0 || mention.line > 32_000
      || !tiers.has(mention.tier) || typeof mention.name !== 'string'
      || !mention.name.trim() || mention.name.length > 100
      || (mention.ownerId !== null && !validId(mention.ownerId))) {
      throw new HttpError(422, 'One or more class note references are invalid.', 'INVALID_MENTIONS');
    }
    return { line: mention.line, tier: mention.tier, name: mention.name.trim(), key: normalizeMentionKey(mention.name), ownerId: mention.ownerId };
  });
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.kind === 'tag' ? `${item.group}:${item.value}` : `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateGroups(sql, targets) {
  const keys = [...new Set(targets.map(item => item.key).filter(Boolean))];
  if (!keys.length) return { scoped: [], classes: [], catalog: [], tags: [] };
  const keySet = JSON.stringify(keys);

  const scoped = targets.some(item => item.ownerId !== null)
    ? sql.exec(`WITH matches AS (
      SELECT cards.id, cards.name, cards.mention_key AS mentionKey, cards.category, cards.type, cards.owner_id AS ownerId,
        owner.name AS ownerName, owner.slot AS ownerSlot,
        json_extract(cards.details, '$[0].noteTier') AS noteTier
      FROM cards
      LEFT JOIN classes owner ON owner.id = cards.owner_id
      WHERE cards.mention_key IN (SELECT value FROM json_each(?))
        AND cards.mention_key <> ''
        AND json_extract(cards.details, '$[0].noteOwnerId') IN (SELECT DISTINCT value FROM json_each(?))
        AND json_extract(cards.details, '$[0].noteTier') IN ('C1', 'C2', 'C3')
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY mentionKey, noteTier ORDER BY name COLLATE NOCASE, id) AS matchRank FROM matches
      ) SELECT * FROM ranked WHERE matchRank <= 12`, keySet, JSON.stringify([...new Set(targets.map(item => item.ownerId).filter(Boolean))])).toArray()
    : [];

  const classes = sql.exec(`WITH matches AS (
      SELECT c.id, c.name, c.mention_key AS mentionKey, c.tier, c.slot, c.position,
        parent.name AS parentName, root.name AS rootName
      FROM classes c
      LEFT JOIN classes parent ON parent.id = c.parent_id
      LEFT JOIN classes root ON root.slot = CASE WHEN instr(c.slot, '/') = 0 THEN c.slot ELSE substr(c.slot, 1, instr(c.slot, '/') - 1) END
      WHERE c.mention_key IN (SELECT value FROM json_each(?)) AND c.mention_key <> '' AND c.tier IN ('C1', 'C2', 'C3')
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY mentionKey, tier ORDER BY position, id) AS matchRank FROM matches
    ) SELECT * FROM ranked WHERE matchRank <= 12`, keySet).toArray();

  const cards = sql.exec(`WITH matches AS (
      SELECT cards.id, cards.name, cards.mention_key AS mentionKey, cards.category, cards.type,
        cards.owner_id AS ownerId, owner.name AS ownerName, owner.slot AS ownerSlot, cards.slot
      FROM cards
      LEFT JOIN classes owner ON owner.id = cards.owner_id
      WHERE cards.mention_key IN (SELECT value FROM json_each(?)) AND cards.mention_key <> ''
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY mentionKey ORDER BY name COLLATE NOCASE, id) AS matchRank FROM matches
    ) SELECT * FROM ranked WHERE matchRank <= 12`, keySet).toArray();

  const skills = sql.exec(`WITH matches AS (
      SELECT skills.id, skills.name, skills.mention_key AS mentionKey, skills.kind,
        skills.class_id AS classId, owner.name AS className, owner.tier AS classTier, owner.slot AS classSlot
      FROM skills
      JOIN classes owner ON owner.id = skills.class_id
      WHERE skills.mention_key IN (SELECT value FROM json_each(?)) AND skills.mention_key <> ''
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY mentionKey ORDER BY name COLLATE NOCASE, id) AS matchRank FROM matches
    ) SELECT * FROM ranked WHERE matchRank <= 12`, keySet).toArray();

  const tags = listTagGroups(sql).groups.flatMap(group => group.structural ? [] : group.tags.flatMap(tag => {
    const keysForTag = new Set([normalizeMentionKey(tag.value), normalizeMentionKey(tag.label)]);
    return [...keysForTag].filter(key => keys.includes(key)).map(mentionKey => ({
      kind: 'tag', name: tag.label, value: tag.value, group: group.id, groupLabel: group.label, mentionKey,
    }));
  }));

  return {
    scoped: scoped.map(row => ({ kind: 'card', id: row.id, name: row.name, category: row.category, type: row.type, ownerId: row.ownerId, ownerSlot: row.ownerSlot, context: cardContext(row), mentionKey: row.mentionKey, tier: row.noteTier })),
    classes: classes.map(row => ({ kind: 'class', id: row.id, name: row.name, tier: row.tier, slot: row.slot, context: [row.tier, row.rootName, row.parentName].filter(Boolean).join(' · '), mentionKey: row.mentionKey })),
    catalog: [
      ...skills.map(row => ({ kind: 'skill', id: row.id, name: row.name, skillKind: row.kind ?? 'Skill', classId: row.classId, classSlot: row.classSlot, context: [row.kind ?? 'Skill', row.className, row.classTier].filter(Boolean).join(' · '), mentionKey: row.mentionKey })),
      ...cards.map(row => ({ kind: 'card', id: row.id, name: row.name, category: row.category, type: row.type, ownerId: row.ownerId, ownerSlot: row.ownerSlot, slot: row.slot, context: cardContext(row), mentionKey: row.mentionKey })),
    ],
    tags,
  };
}

function resultFor(target, groups) {
  const scoped = groups.scoped.filter(item => item.mentionKey === target.key && item.tier === target.tier && target.ownerId && item.ownerId === target.ownerId);
  const classes = groups.classes.filter(item => item.mentionKey === target.key && item.tier === target.tier);
  const catalog = groups.catalog.filter(item => item.mentionKey === target.key);
  const tags = groups.tags.filter(item => item.mentionKey === target.key);
  const candidates = uniqueCandidates(scoped.length ? scoped : classes.length ? classes : catalog.length ? catalog : tags);
  const status = candidates.length === 0 ? 'pending' : candidates.length === 1 ? 'resolved' : 'ambiguous';
  return { line: target.line, tier: target.tier, name: target.name, status, candidates: candidates.slice(0, 6), truncated: candidates.length > 6 };
}

export function resolveClassMentions(sql, input) {
  const mentions = validateMentions(input);
  if (!mentions.length) return { items: [] };
  const groups = candidateGroups(sql, mentions);
  return { items: mentions.map(target => resultFor(target, groups)) };
}
