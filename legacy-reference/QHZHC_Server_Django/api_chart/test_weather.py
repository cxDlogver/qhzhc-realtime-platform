import gzip
import json
import os
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient


class WeatherEndpointTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="weather_history_user",
            password="secret",
            email="weather-history@example.com",
            can_visit_history=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/chart/weather"

    def response_for(self, payload, status=200):
        response = MagicMock()
        response.status = status
        response.headers = {}
        response.read.return_value = json.dumps(payload).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def gzip_response_for(self, payload, status=200):
        response = MagicMock()
        response.status = status
        response.headers = {"Content-Encoding": "gzip"}
        response.read.return_value = gzip.compress(json.dumps(payload).encode("utf-8"))
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def assert_bad_request(self, params):
        response = self.client.get(self.url, params)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"code": 400, "message": "经纬度参数无效", "data": []},
        )

    def test_rejects_missing_or_invalid_coordinates_without_provider_call(self):
        with patch("api_chart.weather.urlopen") as urlopen:
            self.assert_bad_request({"longitude": "104.8"})
            self.assert_bad_request({"longitude": "nan", "latitude": "28.1"})
            self.assert_bad_request({"longitude": "181", "latitude": "28.1"})
            self.assert_bad_request({"longitude": "104.8", "latitude": "-91"})

        urlopen.assert_not_called()

    @patch.dict(os.environ, {}, clear=True)
    def test_returns_generic_service_unavailable_when_weather_key_is_missing(self):
        with self.assertLogs("api_chart.weather", level="WARNING") as logs:
            response = self.client.get(
                self.url,
                {"longitude": "104.817693", "latitude": "28.169435"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"code": 503, "message": "天气服务暂不可用", "data": []},
        )
        self.assertTrue(
            any("QWEATHER_API_KEY is not configured" in log for log in logs.output)
        )
        self.assertNotIn("QWEATHER_API_KEY", response.content.decode())

    @patch.dict(os.environ, {"QWEATHER_API_KEY": "test-weather-key"}, clear=True)
    @patch("api_chart.weather.urlopen")
    def test_returns_hourly_and_daily_forecasts_from_internal_envelope(self, urlopen):
        urlopen.side_effect = [
            self.response_for(
                {
                    "code": "200",
                    "hourly": [{"fxTime": "2026-07-19T10:00+08:00", "temp": "31"}],
                }
            ),
            self.response_for(
                {
                    "code": "200",
                    "daily": [{"fxDate": "2026-07-19", "tempMax": "34"}],
                }
            ),
        ]

        response = self.client.get(
            self.url,
            {"longitude": "104.817693", "latitude": "28.169435"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "code": 200,
                "message": "ok",
                "data": {
                    "hourly": [
                        {"fxTime": "2026-07-19T10:00+08:00", "temp": "31"}
                    ],
                    "daily": [{"fxDate": "2026-07-19", "tempMax": "34"}],
                },
            },
        )
        self.assertEqual(urlopen.call_count, 2)
        requested_urls = [call.args[0].full_url for call in urlopen.call_args_list]
        self.assertTrue(all("test-weather-key" in url for url in requested_urls))
        self.assertTrue(any("/grid-weather/24h?" in url for url in requested_urls))
        self.assertTrue(any("/grid-weather/7d?" in url for url in requested_urls))
        self.assertTrue(
            all(call.kwargs["timeout"] == 5 for call in urlopen.call_args_list)
        )

    @patch.dict(os.environ, {"QWEATHER_API_KEY": "test-weather-key"}, clear=True)
    @patch("api_chart.weather.urlopen")
    def test_decodes_gzip_encoded_provider_forecasts(self, urlopen):
        urlopen.side_effect = [
            self.gzip_response_for(
                {
                    "code": "200",
                    "hourly": [{"fxTime": "2026-07-19T10:00+08:00"}],
                }
            ),
            self.gzip_response_for(
                {"code": "200", "daily": [{"fxDate": "2026-07-19"}]}
            ),
        ]

        response = self.client.get(
            self.url,
            {"longitude": "104.817693", "latitude": "28.169435"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], 200)
        self.assertEqual(len(response.json()["data"]["hourly"]), 1)
        self.assertEqual(len(response.json()["data"]["daily"]), 1)

    @patch.dict(os.environ, {"QWEATHER_API_KEY": "test-weather-key"}, clear=True)
    @patch("api_chart.weather.urlopen")
    def test_reuses_independent_hourly_and_daily_cache_entries(self, urlopen):
        urlopen.side_effect = [
            self.response_for({"code": "200", "hourly": []}),
            self.response_for({"code": "200", "daily": []}),
        ]
        query = {"longitude": "104.8176932", "latitude": "28.1694354"}

        first_response = self.client.get(self.url, query)
        second_response = self.client.get(self.url, query)

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(urlopen.call_count, 2)

    @patch.dict(os.environ, {"QWEATHER_API_KEY": "test-weather-key"}, clear=True)
    @patch("api_chart.weather.urlopen")
    def test_provider_failure_is_generic_and_does_not_expose_details(self, urlopen):
        urlopen.side_effect = OSError("provider secret failure")

        response = self.client.get(
            self.url,
            {"longitude": "104.817693", "latitude": "28.169435"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {"code": 502, "message": "天气服务请求失败", "data": []},
        )
        self.assertNotIn("provider secret failure", response.content.decode())

    @patch.dict(os.environ, {"QWEATHER_API_KEY": "test-weather-key"}, clear=True)
    @patch("api_chart.weather.urlopen")
    def test_malformed_or_unsuccessful_provider_payload_is_generic(self, urlopen):
        invalid_json_response = MagicMock()
        invalid_json_response.status = 200
        invalid_json_response.read.return_value = b"not-json"
        invalid_json_response.__enter__.return_value = invalid_json_response
        invalid_json_response.__exit__.return_value = False
        urlopen.side_effect = [
            invalid_json_response,
            self.response_for({"code": "200", "hourly": []}, status=429),
            self.response_for([]),
        ]
        query = {"longitude": "104.817693", "latitude": "28.169435"}

        invalid_json = self.client.get(self.url, query)
        non_success = self.client.get(
            self.url,
            {"longitude": "104.917693", "latitude": "28.169435"},
        )
        malformed_payload = self.client.get(
            self.url,
            {"longitude": "105.017693", "latitude": "28.169435"},
        )

        for response in (invalid_json, non_success, malformed_payload):
            self.assertEqual(response.status_code, 502)
            self.assertEqual(
                response.json(),
                {"code": 502, "message": "天气服务请求失败", "data": []},
            )
