-- Neon auxiliar: preparação para PW e Central de Alocação.
-- Nenhuma tabela do aplicativo é redirecionada por este arquivo.
-- Aplicado e validado em branch isolada antes de aplicar na main do Neon.
CREATE SCHEMA IF NOT EXISTS grcon_auxiliary;

REVOKE ALL ON SCHEMA grcon_auxiliary FROM PUBLIC;

CREATE TABLE IF NOT EXISTS grcon_auxiliary.snapshots(
source_kind text NOT NULL CHECK(source_kind IN('pw','allocation_registry')),
workspace_id uuid NOT NULL,contract_id uuid NOT NULL,id uuid NOT NULL,
source_json jsonb NOT NULL CHECK(jsonb_typeof(source_json)='object'),
record_count integer NOT NULL CHECK(record_count BETWEEN 0 AND 1000000),
state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','verified')),
checksum text CHECK(checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$'),
PRIMARY KEY(source_kind,workspace_id,contract_id,id));

CREATE TABLE IF NOT EXISTS grcon_auxiliary.rows(
source_kind text NOT NULL,workspace_id uuid NOT NULL,contract_id uuid NOT NULL,snapshot_id uuid NOT NULL,
row_number integer NOT NULL CHECK(row_number>0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
PRIMARY KEY(source_kind,workspace_id,contract_id,snapshot_id,row_number),
FOREIGN KEY(source_kind,workspace_id,contract_id,snapshot_id) REFERENCES grcon_auxiliary.snapshots(source_kind,workspace_id,contract_id,id));

CREATE INDEX IF NOT EXISTS grcon_auxiliary_document_idx ON grcon_auxiliary.rows(source_kind,workspace_id,contract_id,snapshot_id,(payload->>'document'));

ALTER TABLE grcon_auxiliary.snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE grcon_auxiliary.rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA grcon_auxiliary FROM PUBLIC;
