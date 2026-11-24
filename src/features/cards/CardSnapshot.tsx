import { memo } from 'react';
import type { CardRow } from './types';
import { CardFace } from './CardFace';

function sameCard(left: CardRow, right: CardRow) {
  const keys = Object.keys(left) as (keyof CardRow)[];
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

/** Static gallery composition. The visible card only updates when its record changes. */
export const CardSnapshot = memo(function CardSnapshot({ row }: { row: CardRow }) {
  return <CardFace row={row} />;
}, (previous, next) => sameCard(previous.row, next.row));
