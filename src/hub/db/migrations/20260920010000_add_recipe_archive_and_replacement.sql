-- migrate:up
INSERT INTO recipe_status (id, name) VALUES (3, 'Archived');

ALTER TABLE recipe ADD COLUMN replaces_recipe_id INTEGER REFERENCES recipe (id);

-- migrate:down
ALTER TABLE recipe DROP COLUMN replaces_recipe_id;
DELETE FROM recipe_status WHERE id = 3;
