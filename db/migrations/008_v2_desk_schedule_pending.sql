-- Migração 008: Configuração pendente de rotative_days para próxima semana
ALTER TABLE desks ADD COLUMN rotative_days_next TEXT DEFAULT NULL;
ALTER TABLE desks ADD COLUMN rotative_days_next_from TEXT DEFAULT NULL;
