-- Migração 003: Adicionar tipo e propriedade em desks
ALTER TABLE desks ADD COLUMN type TEXT DEFAULT 'rotative';
ALTER TABLE desks ADD COLUMN owner_id INTEGER REFERENCES users(id);
ALTER TABLE desks ADD COLUMN rotative_days TEXT DEFAULT '[]';
