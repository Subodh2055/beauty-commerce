from fastapi import APIRouter, status

from app.modules.auth import service
from app.modules.auth.dependencies import CurrentUser, DbSession, RequestMeta
from app.modules.auth.schemas import (
    AuthResult,
    ChangePasswordIn,
    LoginIn,
    MessageOut,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RefreshIn,
    RegisterIn,
    TokenPair,
    UserOut,
    VerifyEmailIn,
)
from app.modules.auth.service import _to_user_out

router = APIRouter()


@router.post("/register", response_model=AuthResult, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: DbSession, meta: RequestMeta) -> AuthResult:
    return await service.register(db, body.email, body.password, body.full_name, meta)


@router.post("/login", response_model=AuthResult)
async def login(body: LoginIn, db: DbSession, meta: RequestMeta) -> AuthResult:
    return await service.login(db, body.email, body.password, meta)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: DbSession, meta: RequestMeta) -> TokenPair:
    return await service.refresh(db, body.refresh_token, meta)


@router.post("/logout", response_model=MessageOut)
async def logout(body: RefreshIn, db: DbSession) -> MessageOut:
    await service.logout(db, body.refresh_token)
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return _to_user_out(user)


@router.post("/verify-email", response_model=MessageOut)
async def verify_email(body: VerifyEmailIn, db: DbSession) -> MessageOut:
    await service.verify_email(db, body.token)
    return MessageOut(message="Email verified")


@router.post("/resend-verification", response_model=MessageOut)
async def resend_verification(db: DbSession, user: CurrentUser) -> MessageOut:
    await service.resend_verification(db, user)
    return MessageOut(message="Verification email sent — check your inbox.")


@router.post("/password/reset-request", response_model=MessageOut)
async def password_reset_request(body: PasswordResetRequestIn, db: DbSession) -> MessageOut:
    await service.request_password_reset(db, body.email)
    return MessageOut(message="If that email is registered, a reset link has been sent")


@router.post("/password/reset-confirm", response_model=MessageOut)
async def password_reset_confirm(body: PasswordResetConfirmIn, db: DbSession) -> MessageOut:
    await service.confirm_password_reset(db, body.token, body.new_password)
    return MessageOut(message="Password updated. Please sign in again.")


@router.post("/password/change", response_model=MessageOut)
async def change_password(body: ChangePasswordIn, db: DbSession, user: CurrentUser) -> MessageOut:
    await service.change_password(db, user, body.current_password, body.new_password)
    return MessageOut(message="Password changed. Please sign in again.")
