"""Panchangam API routes — mounted under /api by server.py.

Public, read-only calculators (no auth, no DB). Serves both the customer
and priest mobile apps' native Panchangam feature.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from panchangam import service
from panchangam.schemas import MuhurtamCheckRequest, KundaliniChartRequest

router = APIRouter(tags=["panchangam"])


@router.get("/panchangam")
async def panchangam(
    date: str | None = Query(None, description="YYYY-MM-DD; defaults to today (IST)"),
    calendar_type: str = Query("amanta", description="amanta | purnimanta | suryamana"),
    latitude: float | None = Query(None),
    longitude: float | None = Query(None),
    tz_offset_min: int | None = Query(None),
):
    return service.get_panchangam(
        date_str=date,
        calendar_type=calendar_type,
        latitude=latitude,
        longitude=longitude,
        tz_offset_min=tz_offset_min,
    )


@router.get("/panchangam/festivals")
async def festivals(
    year: int | None = Query(None),
    latitude: float | None = Query(None),
    longitude: float | None = Query(None),
    tz_offset_min: int | None = Query(None),
):
    return service.get_festival_calendar(
        year=year,
        latitude=latitude,
        longitude=longitude,
        tz_offset_min=tz_offset_min,
    )


@router.post("/panchangam/muhurtam")
async def muhurtam(req: MuhurtamCheckRequest):
    return service.check_muhurtam(req)


@router.post("/panchangam/kundali")
async def kundali(req: KundaliniChartRequest):
    return service.compute_chart(req)


@router.post("/panchangam/sky-view")
async def sky_view(req: KundaliniChartRequest):
    return service.compute_sky(req)
