"""CRM / Kampanya endpoint'leri — yazılabilir müşteri takip katmanı."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import crm_service

router = APIRouter(prefix="/api/crm", tags=["crm"])


class CRMUpdate(BaseModel):
    """PATCH gövdesi — yalnızca gönderilen alanlar güncellenir."""
    status: str | None = None
    campaign_type: str | None = None
    to_call: bool | None = None
    called: bool | None = None
    last_call_date: str | None = None
    coupon_sent: bool | None = None
    coupon_code: str | None = None
    coupon_sent_date: str | None = None
    coupon_expiry_date: str | None = None
    note: str | None = None


@router.get("/customers")
def customers(
    status: str | None = None,
    campaign: str | None = None,
    search: str | None = None,
    only_to_call: bool = False,
    coupon: str | None = Query(None, pattern="^(expired|expiring|active)$"),
    db: Session = Depends(get_db),
):
    return crm_service.list_customers(
        db, status=status, campaign=campaign, search=search,
        only_to_call=only_to_call, coupon=coupon,
    )


@router.patch("/customers/{customer_id:path}")
def update(customer_id: str, body: CRMUpdate, db: Session = Depends(get_db)):
    return crm_service.update_customer(
        db, customer_id, body.model_dump(exclude_unset=True)
    )


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    return crm_service.summary(db)


@router.get("/campaign-roi")
def campaign_roi(
    period: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
):
    return crm_service.campaign_roi(db, period=period)
