"""Adaptadores LoRA servidos sin fusionar, sobre el mismo modelo base.

peft inyecta las capas LoRA dentro de los módulos del modelo original, así
que `engine.model` sigue siendo el mismo objeto de transformers que espera
qev (`DecisionEngine._run_one` llama `self.model.model(...)` para sacar
hidden states). El bug de la Fase 3 salía de asignarle a `engine.model` el
envoltorio `PeftModel`; aquí el envoltorio vive aparte, en `self._peft`.

Cambiar de adaptador es `set_adapter` (sin copiar pesos, sin VRAM extra por
adaptador); "ninguno" apaga las capas LoRA y queda el modelo base tal cual.
Todo método se llama con `engine_lock` tomado (ver server.py).
"""

from __future__ import annotations

import re
from pathlib import Path

from peft import LoraConfig, PeftModel, get_peft_model

# Mismo patrón que valida neo-api (internal/workflow): un adapter es el
# job_id de su fine-tuning, nunca una ruta.
ADAPTER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


class AdapterNotFound(Exception):
    pass


class Adapters:
    def __init__(self, engine, adapters_dir: Path):
        self.engine = engine
        self.dir = adapters_dir
        self._peft: PeftModel | None = None
        self.active = ""

    def use(self, adapter_id: str) -> None:
        """Deja activo `adapter_id` para el siguiente decide(); "" = modelo base."""
        if adapter_id == self.active:
            return
        if not adapter_id:
            self._peft.base_model.disable_adapter_layers()
            self.active = ""
            return

        if not ADAPTER_ID.match(adapter_id):
            raise AdapterNotFound(f"id de adaptador inválido: {adapter_id!r}")
        if self._peft is None or adapter_id not in self._peft.peft_config:
            self._load(adapter_id)

        self._peft.set_adapter(adapter_id, inference_mode=True)
        self._peft.base_model.enable_adapter_layers()
        self.engine.model.eval()
        self.active = adapter_id

    def _load(self, adapter_id: str) -> None:
        path = self.dir / adapter_id
        if not (path / "adapter_config.json").is_file():
            raise AdapterNotFound(f"no existe el adaptador {adapter_id!r} en {self.dir}")
        if self._peft is None:
            self._peft = PeftModel.from_pretrained(self.engine.model, str(path), adapter_name=adapter_id)
        else:
            self._peft.load_adapter(str(path), adapter_name=adapter_id)

    def start_training(self, adapter_id: str, config: LoraConfig) -> PeftModel:
        """Agrega un adaptador nuevo, entrenable y activo. Devuelve el
        PeftModel para el loop de entrenamiento (forward estándar)."""
        if self._peft is None:
            self._peft = get_peft_model(self.engine.model, config, adapter_name=adapter_id)
        else:
            self._peft.add_adapter(adapter_id, config)
        self._peft.set_adapter(adapter_id)
        self._peft.base_model.enable_adapter_layers()
        self._peft.train()
        self.active = adapter_id
        return self._peft

    def finish_training(self, adapter_id: str, *, keep: bool) -> None:
        """Congela el adaptador recién entrenado y vuelve al modelo base. Si el
        entrenamiento falló, lo borra para que nadie pueda servirlo a medias."""
        self._peft.eval()
        if keep:
            self._peft.set_adapter(adapter_id, inference_mode=True)
        self._peft.base_model.disable_adapter_layers()
        if not keep:
            self._peft.delete_adapter(adapter_id)
        self.active = ""

    def loaded(self) -> list[str]:
        return [] if self._peft is None else sorted(self._peft.peft_config)
