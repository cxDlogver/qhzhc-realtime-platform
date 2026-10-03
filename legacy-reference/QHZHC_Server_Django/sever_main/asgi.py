"""
ASGI config for sever_main project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.2/howto/deployment/asgi/
"""

import os


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sever_main.settings')

import django
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter,URLRouter
#导入chat应用中的路由模块
from api_chart import routings
from channels.security.websocket import AllowedHostsOriginValidator
from api_auth.middleware import JWTAuthMiddleware

# application = get_asgi_application()
application = ProtocolTypeRouter({
    # http路由走这里
    "http": get_asgi_application(),
    # chat应用下rountings模块下的路由变量socket_urlpatterns
    # "websocket": URLRouter(routings.socket_urlpatterns)

    "websocket": AllowedHostsOriginValidator(
            JWTAuthMiddleware(
                URLRouter(routings.socket_urlpatterns)
            )
        ),
})

