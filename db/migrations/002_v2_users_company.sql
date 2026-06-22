-- Migração 002: Adicionar campos de empresa/SSO em users
ALTER TABLE users ADD COLUMN company TEXT;
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN entra_oid TEXT;
ALTER TABLE users ADD COLUMN entra_tenant TEXT;
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
