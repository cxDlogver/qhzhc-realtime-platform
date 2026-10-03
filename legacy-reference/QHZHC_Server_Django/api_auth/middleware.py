from http.cookies import CookieError, SimpleCookie

from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from channels.middleware import BaseMiddleware

from rest_framework.authentication import BaseAuthentication, CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import AccessToken


User = get_user_model()


@database_sync_to_async
def get_user(token):
    try:
        access_token = AccessToken(token)
        user = User.objects.get(id=access_token['user_id'])
        return user if user.is_active else AnonymousUser()
    except (User.DoesNotExist, KeyError, TokenError, InvalidToken, TypeError, ValueError):
        return AnonymousUser()


def get_access_cookie(scope):
    raw_cookie = dict(scope.get("headers", [])).get(b"cookie", b"")
    try:
        cookies = SimpleCookie()
        cookies.load(raw_cookie.decode("latin-1"))
    except (CookieError, UnicodeDecodeError, ValueError):
        return None

    cookie = cookies.get(settings.QHZHC_ACCESS_COOKIE_NAME)
    return cookie.value if cookie else None


def enforce_csrf(request):
    csrf_check = CSRFCheck(lambda request: None)
    csrf_check.process_request(request)
    reason = csrf_check.process_view(request, None, (), {})
    if reason:
        raise PermissionDenied(f"CSRF Failed: {reason}")


# websocket鉴权中间件，负责处理websocket连接的认证
class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        close_old_connections()
        token = get_access_cookie(scope)

        if token:
            scope["user"] = await get_user(token)
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)


# 自定义认证类，去掉自带认证所要求的token前缀
class CustomTokenAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        token = request.COOKIES.get(settings.QHZHC_ACCESS_COOKIE_NAME)
        if not token:
            return None
        try:
            access_token = AccessToken(token)
            user = User.objects.get(id=access_token['user_id'])
            if not user.is_active:
                return None
            enforce_csrf(request)
            return (user, None)
        except (User.DoesNotExist, KeyError, TokenError, InvalidToken, TypeError, ValueError):
            return None
