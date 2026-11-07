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


def random_fecha(rng: random.Random) -> str:
    year = rng.randint(2024, 2026)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{day:02d}/{month:02d}/{year}"


def generate_one(rng: random.Random, doc_id: int) -> dict:
    category = rng.choice(CATEGORIES)
    template = rng.choice(TEMPLATES[category])
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
    args = parser.parse_args()

    rng = random.Random(args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    with args.out.open("w", encoding="utf-8") as f:
        for doc_id in range(1, args.n + 1):
            doc = generate_one(rng, doc_id)
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")
            if doc_id % 100_000 == 0:
                print(f"{doc_id}/{args.n}", flush=True)

    print(f"listo: {args.n} documentos en {args.out}")


if __name__ == "__main__":
    main()
