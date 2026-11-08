"""Genera documentos sintéticos en español para indexar en neo-vector y medir
recall@10 / p95 de búsqueda (Fase 1). Solo datos sintéticos (regla 1 del
brief): nombres, montos y empresas son plantillas con relleno aleatorio,
nunca información real de Ferrer & Asociados.

Uso:
    python data/generate_documents.py --n 1000000 --out data/generated/documents.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

CATEGORIES = ["contrato", "factura", "reporte"]

EMPRESAS = [
    "Comercial Aurora", "Distribuidora Pino Azul", "Grupo Mercurio",
    "Talleres del Norte", "Soluciones Ébano", "Constructora Altiplano",
    "Logística Meridiano", "Textiles Cardenal", "Agroindustrias Ceiba",
    "Servicios Montealto",
]

CONTRATO_TEMPLATES = [
    "Contrato de prestación de servicios entre {a} y {b}, vigencia de {meses} meses, "
    "monto mensual de ${monto:,.2f} MXN.",
    "Acuerdo de confidencialidad firmado entre {a} y {b} con fecha {fecha}, "
    "clausula de penalización por incumplimiento.",
    "Convenio de arrendamiento comercial entre {a} y {b}, renta de ${monto:,.2f} MXN "
    "mensuales, duración {meses} meses.",
]

FACTURA_TEMPLATES = [
    "Factura #{folio} emitida por {a} a {b} por ${monto:,.2f} MXN, vence el {fecha}.",
    "Nota de cobro {folio}: {a} factura a {b} un total de ${monto:,.2f} MXN, "
    "pago a {meses} meses.",
    "Factura {folio} vencida desde {fecha}, {a} reclama pago de ${monto:,.2f} MXN a {b}.",
]

REPORTE_TEMPLATES = [
    "Reporte trimestral de {a}: ingresos de ${monto:,.2f} MXN, crecimiento respecto "
    "al trimestre anterior.",
    "Informe de resultados de {a} al cierre de {fecha}, variación de ${monto:,.2f} MXN "
    "en el rubro operativo.",
    "Reporte de auditoría interna de {a}, hallazgos menores, sin observaciones de {b}.",
]

TEMPLATES = {
    "contrato": CONTRATO_TEMPLATES,
    "factura": FACTURA_TEMPLATES,
    "reporte": REPORTE_TEMPLATES,
}

# Variante "hard" (Fase 3): evita las palabras que delatan la categoría
# ("contrato", "factura", "reporte") y usa frases que se podrían leer como
# más de una categoría. Con las plantillas normales el modelo base ya
# acierta 100% (ver CLAUDE.md) — esto deja margen real para medir si el
# fine-tuning mejora algo, en vez de comparar un techo contra sí mismo.
CONTRATO_HARD_TEMPLATES = [
    "Las partes acuerdan un periodo de {meses} meses bajo las condiciones aquí "
    "descritas, con pagos de ${monto:,.2f} MXN entre {a} y {b}.",
    "{a} y {b} dejan por escrito los términos de su relación comercial, vigente "
    "desde {fecha}, con penalización por incumplimiento.",
    "Queda establecido entre {a} y {b} el uso del espacio mencionado por "
    "{meses} meses, a razón de ${monto:,.2f} MXN cada periodo.",
]

FACTURA_HARD_TEMPLATES = [
    "Se adeuda un total de ${monto:,.2f} MXN por lo prestado a {b}, con fecha "
    "límite el {fecha}. Referencia {folio}.",
    "{a} notifica a {b} el saldo pendiente de ${monto:,.2f} MXN, sin abono "
    "registrado desde {fecha}.",
    "Monto a cubrir: ${monto:,.2f} MXN. {b} debe liquidar a {a} antes del {fecha}.",
]

REPORTE_HARD_TEMPLATES = [
    "Los números del periodo muestran ${monto:,.2f} MXN en {a}, reflejando la "
    "actividad reciente de la operación.",
    "Al cierre de {fecha}, {a} registra una variación de ${monto:,.2f} MXN "
    "respecto al periodo anterior.",
    "Resumen de {a}: ${monto:,.2f} MXN en el rubro revisado, sin hallazgos "
    "relevantes de {b}.",
]

HARD_TEMPLATES = {
    "contrato": CONTRATO_HARD_TEMPLATES,
    "factura": FACTURA_HARD_TEMPLATES,
    "reporte": REPORTE_HARD_TEMPLATES,
}


def random_fecha(rng: random.Random) -> str:
    year = rng.randint(2024, 2026)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{day:02d}/{month:02d}/{year}"


def generate_one(rng: random.Random, doc_id: int, templates: dict[str, list[str]] = TEMPLATES) -> dict:
    category = rng.choice(CATEGORIES)
    template = rng.choice(templates[category])
    a, b = rng.sample(EMPRESAS, 2)
    text = template.format(
        a=a,
        b=b,
        meses=rng.randint(1, 36),
        monto=rng.uniform(500, 500_000),
        fecha=random_fecha(rng),
        folio=rng.randint(1000, 999999),
    )
    return {"id": doc_id, "category": category, "text": text}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=1_000_000)
    parser.add_argument("--out", type=Path, default=Path("data/generated/documents.jsonl"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--difficulty", choices=["normal", "hard"], default="normal")
    args = parser.parse_args()

    templates = HARD_TEMPLATES if args.difficulty == "hard" else TEMPLATES
    rng = random.Random(args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    with args.out.open("w", encoding="utf-8") as f:
        for doc_id in range(1, args.n + 1):
            doc = generate_one(rng, doc_id, templates)
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")
            if doc_id % 100_000 == 0:
                print(f"{doc_id}/{args.n}", flush=True)

    print(f"listo: {args.n} documentos en {args.out}")


if __name__ == "__main__":
    main()
