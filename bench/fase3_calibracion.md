# Fase 3 · Calibración antes/después del fine-tuning LoRA

Adaptador: `/data/adapters/334a72fe-cef6-48f8-af3a-8402637081f5`
Set de prueba: `/datasets/documents_hard_test.jsonl` (300 documentos, categorías contrato/factura/reporte,
plantillas "hard": a propósito léxicamente ambiguas, sin las palabras que
delatan la categoría — con las plantillas normales el modelo base ya
acierta 100% y no hay margen para medir una mejora real, ver CLAUDE.md).

| Métrica | Antes | Después |
| --- | --- | --- |
| Concordancia | 0.8767 (263/300) | 1.0000 (300/300) |
| ECE (10 bins) | 0.2853 | 0.0000 |

## Cómo se entrenó

LoRA real (`peft`, r=8, `target_modules="all-linear"`) sobre `OmniJev/OneJev-0.8B`,
1000 documentos de entrenamiento (mismas plantillas "hard", seed distinto al
del set de prueba), 3 épocas, batch 4, lr 1e-4. El loss de entrenamiento cayó
de 1.53 a ~0.0000 en los primeros 12 pasos de 750 — convergencia casi
inmediata, ver nota abajo.

## Salvedad honesta

Un ECE de 0.0000 y concordancia perfecta tras solo 12 pasos de entrenamiento
no es evidencia de que el modelo generalizó bien: es evidencia de que
memorizó rápido las 3 plantillas por categoría del generador sintético (el
set de prueba usa las mismas plantillas, solo cambian nombres de empresa,
montos y fechas). Es una mejora real y medida, no inventada, y confirma que
el pipeline de fine-tuning funciona de punta a punta — pero no demuestra que
el adaptador generalice a frases fuera de estas plantillas. `lr=1e-4` fue
además más alto de lo necesario para esta tarea: casi todo el presupuesto de
738 pasos restantes no aportó nada medible. Para una medida más honesta de
generalización haría falta un set de prueba con frases genuinamente distintas
(no solo nombres distintos sobre la misma plantilla), fuera del alcance de
esta corrida.
