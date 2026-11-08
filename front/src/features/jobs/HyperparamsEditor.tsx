import { Plus, X } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";

export interface ParamRow {
  id: number;
  key: string;
  value: string;
}

interface HyperparamsEditorProps {
  rows: ParamRow[];
  onChange: (rows: ParamRow[]) => void;
  disabled?: boolean;
}

let nextId = 1000;

/** Editor llave/valor controlado: el contrato es map<string,string>, así que todo viaja como texto. */
export function HyperparamsEditor({ rows, onChange, disabled }: HyperparamsEditorProps) {
  const update = (id: number, patch: Partial<ParamRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-xs font-medium text-fg-muted">Hiperparámetros</legend>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={row.key}
            onChange={(e) => update(row.id, { key: e.target.value })}
            placeholder="llave"
            aria-label="Nombre del hiperparámetro"
            className="h-9 font-mono text-xs"
          />
          <Input
            value={row.value}
            onChange={(e) => update(row.id, { value: e.target.value })}
            placeholder="valor"
            aria-label={`Valor de ${row.key || "hiperparámetro"}`}
            className="h-9 font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            aria-label={`Quitar ${row.key || "fila"}`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...rows, { id: nextId++, key: "", value: "" }])}
        leading={<Plus className="size-3.5" aria-hidden />}
      >
        Agregar
      </Button>
    </fieldset>
  );
}
