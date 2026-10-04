from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError
from app.modules.auth.dependencies import require_permission
from app.modules.users.models import User
from app.modules.vendors import repository as repo
from app.modules.vendors.models import Vendor
from app.shared.enums import Permission, VendorStatus

DbSession = Annotated[AsyncSession, Depends(get_db)]
PortalUser = Annotated[User, Depends(require_permission(Permission.VENDOR_PORTAL))]


async def current_vendor(db: DbSession, user: PortalUser) -> Vendor:
    """The caller's own vendor. Every vendor-portal query is scoped by this
    object's id — never by an id taken from the request."""
    vendor = await repo.get_by_owner(db, user.id)
    if vendor is None or vendor.status not in (VendorStatus.APPROVED, VendorStatus.SUSPENDED):
        raise ForbiddenError("No active vendor account")
    return vendor


async def active_vendor(vendor: Annotated[Vendor, Depends(current_vendor)]) -> Vendor:
    """Like current_vendor, but suspended vendors are read-only."""
    if vendor.status != VendorStatus.APPROVED:
        raise ForbiddenError("Your vendor account is suspended")
    return vendor


CurrentVendor = Annotated[Vendor, Depends(current_vendor)]
ActiveVendor = Annotated[Vendor, Depends(active_vendor)]
