"""Per-substation BESS dispatch + Flexible Connection Agreement (FCA) endpoints."""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from ..services import app_sample, bess_runner, bess_scan, bess_siting

router = APIRouter()


class FcaCfg(BaseModel):
    on: bool = False
    variant: Literal[1, 2, 3] = 1          # SH Netz feed-in/withdrawal band variant
    radius_km: float = 25.0                 # RE catchment radius around the bus
    night_window: bool = True               # 23:00–05:00 charging release


class FinCfg(BaseModel):
    """Project financial model (defaults in sync with bess_runner.FIN_DEFAULTS)."""
    capex_eur_per_kwh: float = 235.0
    opex_pct: float = 1.5                   # fixed O&M, % of CAPEX per year
    years: int = 15
    wacc_pct: float = 7.0
    fade_pct: float = 1.5                   # annual capacity fade
    scenario: Literal["base", "bear", "bull"] = "base"


class SimRequest(BaseModel):
    bus_id: str
    # battery (2027-case defaults, in sync with bess_runner.DEFAULTS)
    power_charge: float = 100.0
    power_discharge: float = 100.0
    energy_capacity: float = 400.0
    rt_efficiency: float = 86.0
    soc_min: float = 5.0
    soc_max: float = 100.0
    # market & ramp
    ramp_rate: float = 10.0
    apply_ramp_loss: bool = True
    use_intraday: bool = True
    max_cycles_day: float = 2.0
    # costs
    degradation_cost: float = 3.0
    grid_cost_charge: float = 0.0
    grid_cost_discharge: float = 0.0
    # reserves
    enable_fcr: bool = True
    fcr_mw: float = 5.0
    enable_afrr: bool = True
    afrr_pos_mw: float = 15.0
    afrr_neg_mw: float = 15.0
    fcr_buffer_h: float = 0.25
    afrr_reserve_h: float = 1.0
    afrr_act_pos: float = 10.0
    afrr_act_neg: float = 10.0
    afrr_energy_margin: float = 30.0
    # FCA (level 2)
    fca: FcaCfg = Field(default_factory=FcaCfg)
    # project financials (IRR / NPV on the declining German revenue outlook)
    fin: FinCfg = Field(default_factory=FinCfg)


@router.get("/context/{bus_id}")
def context(bus_id: str, radius_km: float = 25.0):
    """Bus metadata + nearby wind/PV exposure within the radius, for the popup header."""
    try:
        info = app_sample.bus_info(bus_id)
    except Exception:
        info = {"bus": bus_id}
    info.update(bess_runner.context(bus_id, radius_km))
    return info


@router.get("/weather_zones")
def weather_zones():
    """Wind & PV regional weather zones (per-generator location + capacity factor)."""
    return bess_runner.weather_zones()


@router.get("/weather_muni")
def weather_muni():
    """Mean wind & PV capacity factor per municipality (AGS) for the choropleth."""
    return bess_runner.weather_muni()


@router.post("/simulate")
def simulate(req: SimRequest):
    params = req.model_dump(exclude={"bus_id", "fca", "fin"})
    try:
        return bess_runner.simulate(req.bus_id, params, req.fca.model_dump(),
                                    req.fin.model_dump())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"BESS simulation failed: {e}")


@router.post("/export")
def export(req: SimRequest):
    """Full 8,760-hour dispatch time series (prices, power, SoC, arbitrage + FCR/aFRR
    cash flows) as a downloadable .xlsx."""
    params = req.model_dump(exclude={"bus_id", "fca", "fin"})
    try:
        data = bess_runner.export_xlsx(req.bus_id, params, req.fca.model_dump())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"BESS export failed: {e}")
    tag = "fca" if req.fca.on else "firm"
    fname = f"bess_dispatch_{req.bus_id}_{tag}_2025.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/fca_matrix/{bus_id}")
def fca_matrix(bus_id: str):
    """Per-bus FCA matrix for the Analysis popup: band variants V1–V3 × night-cap
    on/off, once with the band only (full ancillary, no ramp limit) and once with
    the ancillary cap & ramp rate (FCR banned, aFRR ≤30 %, 6 %/min gradient)."""
    try:
        return bess_scan.node_matrix(bus_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"FCA matrix failed: {e}")


# ── System-wide FCA scan (all 110 kV buses, firm vs FCA, variants V1/V2/V3) ──
@router.get("/scan")
def scan():
    """Return the cached scan if present; otherwise a 'needs-run' status."""
    d = bess_scan.load_cached()
    if d is None:
        return {"ready": False, **bess_scan.status()}
    return {"ready": True, "stale": not bess_scan.cached_is_fresh(), **d}


@router.post("/scan/run")
def scan_run():
    """Kick off the scan in a background thread (idempotent while running)."""
    return bess_scan.start_background()


@router.get("/scan/status")
def scan_status():
    return bess_scan.status()


# ── Grid-booster siting (netzdienlich / netzneutral / marktdienlich) ──
@router.get("/siting")
def siting(year: int = 2025, force: bool = False):
    """Per-bus classification of the year scenario's pre-redispatch overloads:
    can a standard BESS (50 MW/200 MWh @110 kV, 250 MW/1 GWh @380 kV) counter-
    dispatch them away? Lazy-computed, cached to results/.bess_siting_{year}.json."""
    try:
        return bess_siting.siting(year=year, force=force)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"no year dataset for {year}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"BESS siting failed: {e}")
