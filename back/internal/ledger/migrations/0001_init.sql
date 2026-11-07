-- Bitácora append-only de decisiones. Nunca se borra ni se edita una fila
-- (regla 2 y regla del servicio PostgreSQL en el brief): los triggers de
-- abajo lo hacen imposible incluso por error humano.

CREATE TABLE IF NOT EXISTS decisions (
    id              BIGSERIAL PRIMARY KEY,
    run_id          UUID NOT NULL,
    workflow_id     TEXT NOT NULL,
    workflow_version INTEGER NOT NULL,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    input_text      TEXT NOT NULL,
    answers         JSONB NOT NULL,
    confidence      DOUBLE PRECISION NOT NULL,
    route           TEXT NOT NULL CHECK (route IN ('auto', 'llm', 'review')),
    latency_ms      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_run_id_idx ON decisions (run_id);
CREATE INDEX IF NOT EXISTS decisions_created_at_idx ON decisions (created_at);

CREATE OR REPLACE FUNCTION decisions_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'decisions es append-only: % no está permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decisions_no_update ON decisions;
CREATE TRIGGER decisions_no_update
    BEFORE UPDATE OR DELETE ON decisions
    FOR EACH ROW EXECUTE FUNCTION decisions_append_only();
