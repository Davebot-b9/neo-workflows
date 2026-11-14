-- Adaptadores LoRA: qué adaptador usó cada decisión, y el registro de los
-- adaptadores que dejó cada fine-tuning (antes el adapter_uri que devuelve
-- WatchJob se perdía al terminar el job).
--
-- ADD COLUMN con un default constante no reescribe filas ni dispara los
-- triggers de 0001 (son de UPDATE/DELETE por fila): decisions sigue siendo
-- append-only. Las decisiones anteriores quedan con adapter = '' (modelo base),
-- que es lo que de verdad usaron.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS adapter TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS adapters (
    id              TEXT PRIMARY KEY,         -- job_id del fine-tuning; es lo que un workflow pone en `adapter:`
    base_model      TEXT NOT NULL,
    dataset_uri     TEXT NOT NULL,
    hyperparameters JSONB NOT NULL DEFAULT '{}',
    adapter_uri     TEXT NOT NULL,            -- ruta dentro del volumen de neo-model (/data/adapters/<id>)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
