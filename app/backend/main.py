import pathlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import (ai, bess, capex, generators, grid, investments, loads,
                      official, pf, reform, sample, territories, topology,
                      validation)

app = FastAPI(title="Grid Data Explorer", version="0.1.0")

app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generators.router, prefix="/api/generators", tags=["generators"])
app.include_router(loads.router, prefix="/api/loads", tags=["loads"])
app.include_router(topology.router, prefix="/api/topology", tags=["topology"])
app.include_router(pf.router, prefix="/api/pf", tags=["pf"])
app.include_router(grid.router, prefix="/api/grid", tags=["grid"])
app.include_router(sample.router, prefix="/api/sample", tags=["sample"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(official.router, prefix="/api/official", tags=["official"])
app.include_router(validation.router, prefix="/api/validation", tags=["validation"])
app.include_router(bess.router, prefix="/api/bess", tags=["bess"])
app.include_router(investments.router, prefix="/api/investments", tags=["investments"])
app.include_router(territories.router, prefix="/api/territories", tags=["territories"])
app.include_router(reform.router, prefix="/api/reform", tags=["reform"])
app.include_router(capex.router, prefix="/api/capex", tags=["capex"])

FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend"
app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")


@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "studio.html")


@app.get("/studio")
def studio():
    return FileResponse(FRONTEND_DIR / "studio.html")


@app.get("/studio-dark")
def studio_dark():
    return FileResponse(FRONTEND_DIR / "studio-dark.html")


@app.get("/legacy")
def legacy():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/grid")
def grid_map():
    return FileResponse(FRONTEND_DIR / "grid.html")


@app.get("/explorer")
def explorer():
    return FileResponse(FRONTEND_DIR / "explorer.html")


@app.get("/health")
def health():
    return {"status": "ok"}
