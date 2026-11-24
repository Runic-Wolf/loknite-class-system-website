import { useRef } from 'react';

export function useIdempotencyKey() {
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  function forPayload(payload: unknown): string {
    const signature = JSON.stringify(payload);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { signature, key: globalThis.crypto.randomUUID() };
    }
    return attempt.current.key;
  }

  function clear(): void {
    attempt.current = null;
  }

  return { forPayload, clear };
}
