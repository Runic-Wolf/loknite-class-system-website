import { useState } from 'react';
import type { ClassQuery, ClassQueryField, ClassQueryRule } from '../../../shared/class-query.js';
import styles from './query-builder.module.css';

type BuilderField = Exclude<ClassQueryField, 'tag'>;
const fieldOptions: Array<{ value: BuilderField; label: string }> = [
  { value: 'tier', label: 'Class tier' },
  { value: 'name', label: 'Class name contains' },
  { value: 'kind', label: 'Available skill kind' },
  { value: 'hasSkills', label: 'Available skills' },
  { value: 'favorite', label: 'Favorite' },
];
const choices: Partial<Record<BuilderField, string[]>> = {
  tier: ['C1', 'C2', 'C3', 'SPEC'],
  kind: ['Passive', 'Active', 'Signature', 'Ultimate'],
  hasSkills: ['yes', 'no'],
  favorite: ['yes', 'no'],
};
const defaults: Record<BuilderField, string> = { tier: 'C1', name: '', kind: 'Passive', hasSkills: 'yes', favorite: 'yes' };

function describe(rule: ClassQueryRule): string {
  if (rule.field === 'tag') return `Tag · ${rule.value}`;
  if (rule.field === 'tier') return `Tier · ${rule.value}`;
  if (rule.field === 'name') return `Name contains · ${rule.value}`;
  if (rule.field === 'kind') return `Available skill · ${rule.value}`;
  if (rule.field === 'hasSkills') return rule.value === 'yes' ? 'Has available skills' : 'No available skills';
  return rule.value === 'yes' ? 'Favorite' : 'Not a favorite';
}

function describeScope(query: ClassQuery): string {
  let activeRules = 0;
  const groups: string[] = [];
  function visit(current: ClassQuery) {
    activeRules += current.rules.filter(rule => rule.enabled).length;
    groups.push(current.logic);
    if (current.scope) visit(current.scope);
  }
  visit(query);
  return `${activeRules} active rule(s) across ${groups.join(' → ')} groups. This preserves the dashboard result set.`;
}

export function ClassQueryBuilder({ query, onChange }: { query: ClassQuery; onChange: (query: ClassQuery) => void }) {
  const [field, setField] = useState<BuilderField>('tier');
  const [value, setValue] = useState(defaults.tier);
  const [exclude, setExclude] = useState(false);
  const options = choices[field];
  const ready = field === 'name' ? value.trim().length > 0 : Boolean(value);

  function changeField(next: BuilderField) {
    setField(next);
    setValue(defaults[next]);
  }

  function addRule() {
    const normalizedValue = field === 'name' ? value.trim() : value;
    if (!normalizedValue || query.rules.length >= 12) return;
    const duplicate = query.rules.some(rule => rule.field === field && rule.value === normalizedValue && rule.exclude === exclude);
    if (duplicate) return;
    onChange({ ...query, rules: [...query.rules, { field, value: normalizedValue, enabled: true, exclude }] });
  }

  function updateRule(index: number, update: Partial<ClassQueryRule>) {
    onChange({ ...query, rules: query.rules.map((rule, position) => position === index ? { ...rule, ...update } : rule) });
  }

  return <section className={styles.builder} aria-label="Class query rules">
    <div className={styles.controls}>
      <label><span>Combine rules</span><select aria-label="Combine class query rules" value={query.logic} onChange={event => onChange({ ...query, logic: event.currentTarget.value as ClassQuery['logic'] })}><option value="AND">Match all · AND</option><option value="OR">Match any · OR</option></select></label>
      <label><span>Add a rule</span><select aria-label="New rule field" value={field} onChange={event => changeField(event.currentTarget.value as BuilderField)}>{fieldOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className={styles.valueField}><span>Value</span>{options
        ? <select aria-label="New rule value" value={value} onChange={event => setValue(event.currentTarget.value)}>{options.map(option => <option value={option} key={option}>{option === 'yes' ? 'Yes' : option === 'no' ? 'No' : option}</option>)}</select>
        : <input aria-label="Class name contains" value={value} onChange={event => setValue(event.currentTarget.value)} maxLength={80} placeholder="Enter a name fragment" />}</label>
      <label className={styles.notControl}><input type="checkbox" checked={exclude} onChange={event => setExclude(event.currentTarget.checked)} /><span>NOT</span></label>
      <button className="button button-quiet" type="button" disabled={!ready || query.rules.length >= 12 || query.rules.some(rule => rule.field === field && rule.value === value.trim() && rule.exclude === exclude)} onClick={addRule}>Add rule</button>
    </div>
    <div className={styles.ruleList} aria-label="Current rules">
      {query.rules.length === 0 ? <p className={styles.noRules}>Add a rule or select tags. Search text is combined with these rules.</p> : query.rules.map((rule, index) => {
        const label = `${rule.exclude ? 'NOT ' : ''}${describe(rule)}`;
        return <div className={`${styles.rule}${rule.enabled ? '' : ` ${styles.disabled}`}`} key={`${rule.field}:${rule.value}:${index}`}>
          <button className={styles.toggleRule} type="button" aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${label}`} aria-pressed={rule.enabled} onClick={() => updateRule(index, { enabled: !rule.enabled })}>{rule.enabled ? '●' : '○'}</button>
          <span>{label}</span>
          <button className={styles.excludeRule} type="button" aria-label={`${rule.exclude ? 'Remove NOT from' : 'Negate'} ${describe(rule)}`} aria-pressed={rule.exclude} onClick={() => updateRule(index, { exclude: !rule.exclude })}>{rule.exclude ? 'NOT' : '¬'}</button>
          <button className={styles.removeRule} type="button" aria-label={`Remove ${label}`} onClick={() => onChange({ ...query, rules: query.rules.filter((_, position) => position !== index) })}>×</button>
        </div>;
      })}
    </div>
    {query.scope && <div className={styles.scopeNotice} role="note"><span><strong>Scoped to a previous query</strong><small>{describeScope(query.scope)}</small></span><button className="button button-quiet" type="button" onClick={() => { const next = { ...query }; delete next.scope; onChange(next); }}>Remove scope</button></div>}
    <p className={styles.ruleHint}>A tag rule follows the selected source. Skill-kind and skill-availability rules include skills inherited from ancestor classes.</p>
  </section>;
}
