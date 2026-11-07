"""Fase 2: inferencia real con OneJev-0.8B (Apache 2.0) vía el DecisionEngine
de qev. El modelo se carga una sola vez al arrancar (ver server.py) y se pasa
al servicer — Singleton: no aplica como global, ver Patrones en el brief.

Las formas Question/Answer de aquí siguen el API real de System One,
verificado contra qev/schema.py (ver CLAUDE.md), no la que se asumió en la
Fase 0.
"""

from __future__ import annotations

import os

from qev.engine import DecisionEngine
from qev.schema import (
    ChoiceAnswer,
    ChoiceQuestion,
    NoulAnswer,
    NoulCriteria,
    NoulQuestion,
    ScoreAnswer,
    ScoreQuestion,
    SystemOneRequest,
)

from neo.v1 import model_pb2


def load_engine() -> DecisionEngine:
    device = os.environ.get("NEO_MODEL_DEVICE", "cpu")
    model_path = os.environ.get("NEO_MODEL_PATH", "OmniJev/OneJev-0.8B")
    if device == "cpu":
        return DecisionEngine(model_path=model_path, device="cpu", dtype="float32")
    return DecisionEngine(model_path=model_path, device="cuda:0", dtype="bfloat16")


def _to_qev_question(q: model_pb2.Question):
    instructions = q.instructions or None
    if q.type == "choice":
        return ChoiceQuestion(type="choice", instructions=instructions, criteria=dict(q.choice_criteria))
    if q.type == "score":
        return ScoreQuestion(type="score", instructions=instructions, criteria=list(q.score_levels))
    if q.type == "noul":
        criteria = None
        if q.noul_true or q.noul_false:
            criteria = NoulCriteria(true=q.noul_true or None, false=q.noul_false or None)
        return NoulQuestion(type="noul", instructions=instructions, criteria=criteria)
    raise ValueError(f"tipo de pregunta desconocido: {q.type!r}")


def _from_qev_answer(answer: NoulAnswer | ChoiceAnswer | ScoreAnswer) -> model_pb2.Answer:
    if isinstance(answer, NoulAnswer):
        return model_pb2.Answer(noul=model_pb2.NoulAnswer(noul=answer.noul))
    if isinstance(answer, ChoiceAnswer):
        return model_pb2.Answer(choice=model_pb2.ChoiceAnswer(
            choice=answer.choice,
            probabilities=answer.probabilities,
            confidence=answer.confidence,
        ))
    if isinstance(answer, ScoreAnswer):
        return model_pb2.Answer(score=model_pb2.ScoreAnswer(
            score=answer.score,
            legend={k: str(v) for k, v in answer.legend.items()},
            probabilities=answer.probabilities,
            confidence=answer.confidence,
        ))
    raise ValueError(f"tipo de respuesta desconocido: {type(answer)!r}")


def decide(engine: DecisionEngine, request: model_pb2.DecideRequest) -> model_pb2.DecideResponse:
    questions = {name: _to_qev_question(q) for name, q in request.questions.items()}
    qev_request = SystemOneRequest(state=request.state, model=request.model, questions=questions)

    response, _debug = engine.decide(qev_request)

    answers = {name: _from_qev_answer(a) for name, a in response.answers.items()}
    usage = model_pb2.Usage(input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens)
    # DecisionEngine.decide() siempre deja model="" en la respuesta (no es un
    # bug nuestro: engine.py literalmente construye SystemOneResponse(model="",
    # ...) — el nombre del modelo es cosa de la capa de servidor de qev, que
    # aquí no usamos). Hacemos eco de la versión fija que pidió el workflow.
    return model_pb2.DecideResponse(model=request.model, answers=answers, usage=usage)
