export type SkillKind = 'Passive' | 'Active' | 'Signature' | 'Ultimate';

export type SkillRow = {
  id: string;
  name: string;
  kind: SkillKind;
  classId: string;
  cardId: string;
  className: string;
  slot: string;
  tags: string[];
  icon: string | null;
};

export type SkillItem = { id: string; name: string; kind: SkillKind; classId: string; cardId: string; lcsNotes: string; mobileNotes: string; tags: string[] };
export type SkillList = { items: SkillRow[]; next: string | null };
export type SkillRecord = { item: SkillItem; version: string; position: number };
export type SkillWrite = { name: string; kind: SkillKind; classId: string; lcsNotes: string; mobileNotes: string; tags: string[] };
export type SkillWriteResult = SkillRecord & { revision: number; unchanged?: boolean };
export type ClassOption = { id: string; name: string; tier: 'C1' | 'C2' | 'C3' | 'SPEC'; slot: string; icon: string | null };
