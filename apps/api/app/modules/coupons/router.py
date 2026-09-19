from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.coupons import service
from app.modules.coupons.schemas import CouponValidateIn, CouponValidateOut

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.post("/validate", response_model=CouponValidateOut, summary="Check a coupon code")
async def validate(body: CouponValidateIn, db: DbSession, user: CurrentUser) -> CouponValidateOut:
    coupon, discount = await service.evaluate(db, body.code, body.subtotal, user.id)
    return CouponValidateOut(
        code=coupon.code,
        description=coupon.description,
        discount_type=coupon.discount_type,
        discount_amount=discount,
        message=f"Coupon applied — you save {discount:.0f}",
    )
