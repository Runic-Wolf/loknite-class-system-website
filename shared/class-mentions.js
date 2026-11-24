export const MAX_CLASS_NOTE_MENTIONS = 40;

export function normalizeMentionKey(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function parseClassNoteMentions(notes) {
  const mentions = [];
  const lines = String(notes ?? '').split(/\r?\n/u);
  let overflow = false;

  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line];
    const match = /@([123])([^\r\n]*)/u.exec(text);
    if (!match) continue;
    if (mentions.length >= MAX_CLASS_NOTE_MENTIONS) {
      overflow = true;
      break;
    }
    const name = match[2].trim();
    mentions.push({
      line,
      text,
      start: match.index,
      end: match.index + match[0].length,
      tier: `C${match[1]}`,
      name,
      valid: name.length > 0 && name.length <= 100,
    });
  }

  return { mentions, overflow };
}
