WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category, slot ORDER BY rowid, id) - 1 AS next_position
  FROM cards
)
UPDATE cards
SET position = (SELECT ranked.next_position FROM ranked WHERE ranked.id = cards.id);

CREATE INDEX cards_category_slot_position_idx ON cards(category, slot, position, id);
