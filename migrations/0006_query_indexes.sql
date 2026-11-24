-- EXPLAIN QUERY PLAN showed a temporary sort for class children and selected
-- only the status index for the cards list when category + status were used.
-- Keep these common detail/list paths ordered directly by their access index.
DROP INDEX classes_parent_idx;
CREATE INDEX classes_parent_position_idx ON classes(parent_id, position, id);
CREATE INDEX cards_category_status_name_idx ON cards(category, status, name COLLATE NOCASE, id);
