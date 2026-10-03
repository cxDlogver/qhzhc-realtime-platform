import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import asyncpg
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api_chart import chartdatatrans


class HistoricalQueryContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.raise_request_exception = False
        self.user = get_user_model().objects.create_user(
            username="history_contract_user",
            password="secret",
            can_visit_history=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/chart/dataTrans/between"
        self.five_minute_url = "/api/chart/dataTrans/5min"

    def assert_bad_request_contract(self, response):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = response.json()
        self.assertIn("code", payload)
        self.assertEqual(payload["code"], 400)
        self.assertEqual(payload["data"], [])

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_between_rejects_missing_time_range(self, query_history):
        response = self.client.get(self.url, {"start_time": "2026-07-19 10:00:00"})

        self.assert_bad_request_contract(response)
        query_history.assert_not_awaited()

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_between_rejects_malformed_time_range(self, query_history):
        query_history.return_value = []
        response = self.client.get(
            self.url,
            {
                "start_time": "not-a-time",
                "end_time": "2026-07-19 10:05:00",
            },
        )

        self.assert_bad_request_contract(response)
        query_history.assert_not_awaited()

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_between_rejects_reverse_time_range(self, query_history):
        query_history.return_value = []
        response = self.client.get(
            self.url,
            {
                "start_time": "2026-07-19 11:00:00",
                "end_time": "2026-07-19 10:00:00",
            },
        )

        self.assert_bad_request_contract(response)
        query_history.assert_not_awaited()

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_between_rejects_time_range_larger_than_24_hours(self, query_history):
        query_history.return_value = []
        response = self.client.get(
            self.url,
            {
                "start_time": "2026-07-18 10:00:00",
                "end_time": "2026-07-19 10:00:01",
            },
        )

        self.assert_bad_request_contract(response)
        query_history.assert_not_awaited()

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_between_hides_postgres_error_from_client(self, query_history):
        query_history.side_effect = asyncpg.PostgresError("sensitive database failure")

        response = self.client.get(
            self.url,
            {
                "start_time": "2026-07-19 10:00:00",
                "end_time": "2026-07-19 10:05:00",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertTrue(response["Content-Type"].startswith("application/json"))
        payload = response.json()
        self.assertEqual(payload["code"], 500)
        self.assertEqual(payload["message"], "历史数据查询失败")
        self.assertEqual(payload["data"], [])
        self.assertNotIn("sensitive database failure", response.content.decode())

    @patch(
        "api_chart.chartdatatrans.dataTrans_time_between_async",
        new_callable=AsyncMock,
    )
    def test_five_minute_without_point_time_queries_latest_window(self, query_history):
        query_history.return_value = []

        response = self.client.get(self.five_minute_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        query_history.assert_awaited_once()
        end_time, start_time = query_history.await_args.args
        self.assertEqual(end_time - start_time, timedelta(minutes=5))

    def test_history_query_treats_wind_columns_as_numeric(self):
        for column in ("xspeed", "yspeed"):
            self.assertIn(
                f"COALESCE(wind.{column}, 0)",
                chartdatatrans.QUERY_TIME_BETWEEN,
            )
            self.assertNotIn(
                f"NULLIF(wind.{column}, '')",
                chartdatatrans.QUERY_TIME_BETWEEN,
            )

    @patch(
        "api_chart.chartdatatrans.connect_to_db",
        new_callable=AsyncMock,
    )
    def test_history_query_uses_co2_schema_and_preserves_picarro_fields(
        self,
        connect_to_db,
    ):
        connection = SimpleNamespace(
            fetch=AsyncMock(
                return_value=[
                    {
                        "time": datetime(2026, 7, 19, 10, 0, tzinfo=timezone.utc),
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
                        "picarro_hr_12ch4_dry": 2.2,
                        "picarro_hp_12ch4_dry": 2.1,
                        "picarro_12co2_dry": 421,
                        "picarro_delta_ich4_raw": -45,
                        "picarro_h2o": 800,
                        "windspeed_xy": "1,2",
                        "wind_zspeed": 0,
                        "angle_in_degrees": 0,
                        "r": 2.24,
                    }
                ]
            ),
            close=AsyncMock(),
        )
        connect_to_db.return_value = connection

        points = asyncio.run(
            chartdatatrans.dataTrans_time_between_async(
                datetime(2026, 7, 19, 10, 5, tzinfo=timezone.utc),
                datetime(2026, 7, 19, 10, 0, tzinfo=timezone.utc),
            )
        )

        executed_query = connection.fetch.await_args.args[0]
        self.assertIn(
            "picarro.co2_12_dry AS picarro_12co2_dry",
            executed_query,
        )
        self.assertEqual(points[0]["picarro_hr_12ch4_dry"], 2.2)
        self.assertEqual(points[0]["picarro_hp_12ch4_dry"], 2.1)
        self.assertEqual(points[0]["picarro_12co2_dry"], 421)
