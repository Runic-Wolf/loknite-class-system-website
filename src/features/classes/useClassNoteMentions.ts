import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseClassNoteMentions } from '../../../shared/class-mentions.js';
import { resolveClassNoteMentions } from './api';
import type { ClassMentionResolution } from './types';

export function useClassNoteMentions(note: string, ownerId: string, enabled: boolean) {
  const parsed = useMemo(() => parseClassNoteMentions(note), [note]);
  const targets = parsed.mentions.filter(item => item.valid)
    .map(({ line, tier, name }) => ({ line, tier, name }));
  const targetKey = JSON.stringify(targets);
  const [debouncedKey, setDebouncedKey] = useState(targetKey);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKey(targetKey), 240);
    return () => window.clearTimeout(timer);
  }, [targetKey]);

  const isDebouncing = targetKey !== debouncedKey;
  const references = isDebouncing ? [] : targets.map(item => ({ ...item, ownerId }));
  const query = useQuery({
    queryKey: ['catalog', 'mentions', ownerId, debouncedKey],
    queryFn: ({ signal }) => resolveClassNoteMentions({ mentions: references }, signal),
    enabled: enabled && !isDebouncing && references.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const byLine = useMemo(() => new Map<number, ClassMentionResolution>(
    query.data?.items.map(item => [item.line, item]) ?? [],
  ), [query.data]);

  return { ...parsed, byLine, isDebouncing, query };
}

export type ReturnTypeOfClassNoteMentions = ReturnType<typeof useClassNoteMentions>;
