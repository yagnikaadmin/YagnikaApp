"""Request models for the panchangam / muhurtam / kundali endpoints.
Ported from the standalone Yagnika Panchangam service (models/schemas.py)."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class MuhurtamCheckRequest(BaseModel):
    # Both omitted (left as None) requests a General/Group muhurtam — Tara
    # Balam and Chandra Balam (which need a specific person's birth star/
    # rasi) are skipped; every other check still applies. Provide both for
    # a personal muhurtam. Partial (only one set) is rejected below.
    janma_nakshatra: int | None = Field(default=None, ge=1, le=27)
    janma_rasi: int | None = Field(default=None, ge=1, le=12)
    system: str = "chandramana"  # chandramana | souramana | best
    start_date: str
    end_date: str
    latitude: float | None = None
    longitude: float | None = None
    tz_offset_min: int | None = None

    @model_validator(mode="after")
    def _both_or_neither_janma_fields(self):
        if (self.janma_nakshatra is None) != (self.janma_rasi is None):
            raise ValueError(
                "janma_nakshatra and janma_rasi must both be provided (personal muhurtam) "
                "or both omitted (general/group muhurtam)."
            )
        return self


class KundaliniChartRequest(BaseModel):
    birth_date: str  # YYYY-MM-DD
    birth_time: str  # HH:MM (24h)
    latitude: float | None = None
    longitude: float | None = None
    tz_offset_min: int | None = None
