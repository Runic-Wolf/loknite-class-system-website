export type ClassNoteMention = {
  line: number;
  text: string;
  start: number;
  end: number;
  tier: 'C1' | 'C2' | 'C3';
  name: string;
  valid: boolean;
};

export function normalizeMentionKey(value: unknown): string;
export function parseClassNoteMentions(notes: string): {
  mentions: ClassNoteMention[];
  overflow: boolean;
};
export const MAX_CLASS_NOTE_MENTIONS: number;
