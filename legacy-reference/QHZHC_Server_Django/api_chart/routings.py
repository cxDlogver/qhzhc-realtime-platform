from django.urls import path
from .consumers import ChatView

socket_urlpatterns = [
    path("chat/socket/", ChatView.as_asgi()),
]
