from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api import ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError, router
from app.breach import BreachProblem
from app.evidence import EvidenceProblem
from app.ingestion import IngestionProblem
from app.policy import PolicyProblem
from app.rights import RightsProblem
from app.schemas import ErrorResponse

app = FastAPI(
    title="DVault Control Plane",
    version="1.0.0",
    description="Synthetic, local backend foundation for the DVault demo workspace.",
)
app.include_router(router)


def error_response(status_code: int, code: str, message: str, details: dict[str, Any] | None = None) -> JSONResponse:
    body = ErrorResponse(error={"code": code, "message": message, "details": details or {}})
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


@app.exception_handler(NotFoundError)
async def not_found_handler(_: Request, exc: NotFoundError) -> JSONResponse:
    return error_response(404, f"{exc.resource.upper()}_NOT_FOUND", f"The requested {exc.resource} was not found.")


@app.exception_handler(ServiceUnavailableError)
async def unavailable_handler(_: Request, exc: ServiceUnavailableError) -> JSONResponse:
    return error_response(503, "SERVICE_UNAVAILABLE", exc.message)


@app.exception_handler(IngestionProblem)
async def ingestion_handler(_: Request, exc: IngestionProblem) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(PolicyProblem)
async def policy_handler(_: Request, exc: PolicyProblem) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(RightsProblem)
async def rights_handler(_: Request, exc: RightsProblem) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(EvidenceProblem)
async def evidence_handler(_: Request, exc: EvidenceProblem) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(BreachProblem)
async def breach_handler(_: Request, exc: BreachProblem) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(ConflictError)
async def conflict_handler(_: Request, exc: ConflictError) -> JSONResponse:
    return error_response(409, exc.code, exc.message)


@app.exception_handler(ForbiddenError)
async def forbidden_handler(_: Request, exc: ForbiddenError) -> JSONResponse:
    return error_response(403, exc.code, exc.message)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(422, "VALIDATION_ERROR", "One or more request parameters are invalid.", {"issues": jsonable_encoder(exc.errors())})
