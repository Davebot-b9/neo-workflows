"""Fase 0: respuestas System One simuladas, sin modelo real todavía.

TODO (bloqueante antes de Fase 2): confirmar contra docs.typesafe.ai los
campos exactos de "choice" y "score" antes de reemplazar esta simulación
por inferencia real (ver Contratos en el brief).
"""

from __future__ import annotations

import time

from neo.v1 import model_pb2


def decide(request: model_pb2.DecideRequest) -> model_pb2.DecideResponse:
    start = time.perf_counter()

    answers: dict[str, model_pb2.Answer] = {}
    for name, question in request.questions.items():
        answers[name] = _simulate_answer(question)

    elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
    usage = model_pb2.Usage(
        prompt_tokens=len(request.state) // 4,
        completion_tokens=8 * len(request.questions),
        latency_ms=elapsed_ms,
    )
    return model_pb2.DecideResponse(model=request.model, answers=answers, usage=usage)


def _simulate_answer(question: model_pb2.Question) -> model_pb2.Answer:
    if question.type == "noul":
        return model_pb2.Answer(probabilities={"true": 0.82}, confidence=0.82)

    if question.type == "choice" and question.criteria:
        options = list(question.criteria.keys())
        probabilities = {opt: round(0.05, 4) for opt in options}
        probabilities[options[0]] = round(1.0 - 0.05 * (len(options) - 1), 4)
        return model_pb2.Answer(probabilities=probabilities, confidence=probabilities[options[0]])

    # "score" u otro tipo sin criteria: una sola probabilidad simulada.
    return model_pb2.Answer(probabilities={"value": 0.75}, confidence=0.75)
