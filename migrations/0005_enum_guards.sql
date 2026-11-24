-- SQLite has no native ENUM. Keep the existing canonical columns and enforce
-- their finite domains at the database boundary with INSERT/UPDATE triggers.
-- Empty card type/element/cost values remain valid for legacy Free Notes.

CREATE TRIGGER cards_enum_insert
BEFORE INSERT ON cards
WHEN NEW.type NOT IN ('', 'Attack', 'Skill', 'Power', 'Other', 'Class Mechanic')
  OR NEW.element NOT IN ('', 'Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy')
  OR NEW.cost NOT IN ('', '0', '1', '2', '3', '4', '5', 'X')
  OR NEW.workflow_status IS NULL
  OR NEW.workflow_status NOT IN ('draft', 'review', 'completed', 'audited')
BEGIN
  SELECT RAISE(ABORT, 'invalid card enum value');
END;

CREATE TRIGGER cards_enum_update
BEFORE UPDATE OF type, element, cost, workflow_status ON cards
WHEN NEW.type NOT IN ('', 'Attack', 'Skill', 'Power', 'Other', 'Class Mechanic')
  OR NEW.element NOT IN ('', 'Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy')
  OR NEW.cost NOT IN ('', '0', '1', '2', '3', '4', '5', 'X')
  OR NEW.workflow_status IS NULL
  OR NEW.workflow_status NOT IN ('draft', 'review', 'completed', 'audited')
BEGIN
  SELECT RAISE(ABORT, 'invalid card enum value');
END;

CREATE TRIGGER skills_kind_insert
BEFORE INSERT ON skills
WHEN NEW.kind IS NULL OR NEW.kind NOT IN ('Passive', 'Active', 'Signature', 'Ultimate')
BEGIN
  SELECT RAISE(ABORT, 'invalid skill kind');
END;

CREATE TRIGGER skills_kind_update
BEFORE UPDATE OF kind ON skills
WHEN NEW.kind IS NULL OR NEW.kind NOT IN ('Passive', 'Active', 'Signature', 'Ultimate')
BEGIN
  SELECT RAISE(ABORT, 'invalid skill kind');
END;
