from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone

from asgiref.sync import async_to_sync, sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import RefreshToken

from api_auth.middleware import JWTAuthMiddleware
from api_chart.routings import socket_urlpatterns


class ChatSocketRoutingTests(TransactionTestCase):
    @staticmethod
    def _create_realtime_user():
        return get_user_model().objects.create_user(
            username="ws_user",
            password="secret",
            can_visit_realtime=True,
        )

    def test_chat_socket_accepts_authorized_user(self):
        async_to_sync(self._test_chat_socket_accepts_authorized_user)()

    async def _test_chat_socket_accepts_authorized_user(self):
        user = await sync_to_async(self._create_realtime_user)()
        communicator = WebsocketCommunicator(
            URLRouter(socket_urlpatterns),
            "/chat/socket/",
        )
        communicator.scope["user"] = user

        with patch("api_chart.consumers.ChatView.connect_to_db", new=AsyncMock()), patch(
            "api_chart.consumers.ChatView.disconnect_db", new=AsyncMock()
        ):
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

    def test_chat_socket_rejects_anonymous_user(self):
        async_to_sync(self._test_chat_socket_rejects_anonymous_user)()

    async def _test_chat_socket_rejects_anonymous_user(self):
        communicator = WebsocketCommunicator(
            URLRouter(socket_urlpatterns),
            "/chat/socket/",
        )

        with patch("api_chart.consumers.ChatView.connect_to_db", new=AsyncMock()), patch(
            "api_chart.consumers.ChatView.disconnect_db", new=AsyncMock()
        ):
            connected, _ = await communicator.connect()
            self.assertFalse(connected)


class WebSocketCookieAuthenticationTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="ws_cookie_user",
            password="secret",
            can_visit_realtime=True,
        )
        self.access_token = str(RefreshToken.for_user(self.user).access_token)

    async def _run_middleware(self, scope):
        captured = {}

        async def capture_application(application_scope, receive, send):
            captured["user"] = application_scope["user"]

        await JWTAuthMiddleware(capture_application)(scope, AsyncMock(), AsyncMock())
        return captured["user"]

    def test_websocket_middleware_authenticates_from_access_cookie(self):
        user = async_to_sync(self._run_middleware)(
            {
                "type": "websocket",
                "headers": [
                    (b"cookie", f"qhzhc_access={self.access_token}".encode()),
                ],
                "query_string": b"",
            }
        )

        self.assertEqual(user.pk, self.user.pk)

    def test_websocket_middleware_rejects_token_in_query_string(self):
        user = async_to_sync(self._run_middleware)(
            {
                "type": "websocket",
                "headers": [],
                "query_string": f"token={self.access_token}".encode(),
            }
        )

        self.assertTrue(user.is_anonymous)


class ChatSocketCommandAuthorizationTests(TransactionTestCase):
    def setUp(self):
        user_model = get_user_model()
        self.realtime_user = user_model.objects.create_user(
            username="realtime_only_user",
            password="secret",
            phone_number="13800000002",
            email="realtime-only@example.com",
            can_visit_realtime=True,
        )
        self.visualization_user = user_model.objects.create_user(
            username="visualization_user",
            password="secret",
            phone_number="13800000003",
            email="visualization@example.com",
            can_visit_realtime=True,
            can_visit_history=True,
        )

    def test_realtime_user_cannot_run_history_command(self):
        async_to_sync(self._test_realtime_user_cannot_run_history_command)()

    async def _test_realtime_user_cannot_run_history_command(self):
        connection = AsyncMock()
        connection.is_closed = Mock(return_value=False)

        async def connect_to_db(consumer):
            consumer.db_conn = connection

        communicator = WebsocketCommunicator(
            URLRouter(socket_urlpatterns),
            "/chat/socket/",
        )
        communicator.scope["user"] = self.realtime_user

        with patch(
            "api_chart.consumers.ChatView.connect_to_db",
            new=connect_to_db,
        ):
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to({"command": "history_data_5min"})
            response = await communicator.receive_json_from()
            self.assertEqual(response["code"], 403)
            self.assertEqual(response["message"], "没有历史数据查询权限")
            connection.fetch.assert_not_awaited()
            await communicator.disconnect()

    def test_history_command_returns_normalized_packet(self):
        async_to_sync(self._test_history_command_returns_normalized_packet)()

    async def _test_history_command_returns_normalized_packet(self):
        connection = AsyncMock()
        connection.is_closed = Mock(return_value=False)
        connection.fetch.return_value = [
            {
                "time": datetime(
                    2026,
                    7,
                    19,
                    10,
                    0,
                    tzinfo=timezone.utc,
                ),
                "latitude": 28.169435,
                "longitude": 104.817693,
                "altitude": 120,
                "speed_and_direction": "36,0",
                "pri_co2": 420,
                "pri_ch4": 2.1,
                "pri_c2h6": 0.2,
                "pri_co": 0.5,
                "pri_n2o": 0.3,
                "pri_h2o": 0.1,
                "picarro_hr_12ch4_dry": 12.4,
                "picarro_hp_12ch4_dry": 12.1,
                "picarro_12co2_dry": 421,
                "picarro_delta_ich4_raw": -45,
                "picarro_h2o": 800,
                "windspeed_xy": "1,2",
                "wind_zspeed": 0,
                "angle_in_degrees": 0,
                "r": 2.24,
            }
        ]

        async def connect_to_db(consumer):
            consumer.db_conn = connection

        communicator = WebsocketCommunicator(
            URLRouter(socket_urlpatterns),
            "/chat/socket/",
        )
        communicator.scope["user"] = self.visualization_user

        with patch(
            "api_chart.consumers.ChatView.connect_to_db",
            new=connect_to_db,
        ):
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to({"command": "history_data_5min"})
            response = await communicator.receive_json_from()
            self.assertEqual(response["code"], 200)
            self.assertEqual(response["message"], "ok")
            self.assertEqual(response["data"][0]["picarro_hr_12ch4_dry"], 12.4)
            self.assertEqual(response["data"][0]["picarro_hp_12ch4_dry"], 12.1)
            self.assertEqual(response["data"][0]["picarro_12co2_dry"], 421)
            await communicator.disconnect()
