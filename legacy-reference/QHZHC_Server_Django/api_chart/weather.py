import gzip
import json
import logging
import math
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.core.cache import cache
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

QWEATHER_BASE_URL = "https://devapi.qweather.com/v7/grid-weather"
QWEATHER_API_KEY_ENV = "QWEATHER_API_KEY"
WEATHER_TIMEOUT_SECONDS = 5
FORECAST_CONFIG = {
    "24h": {"field": "hourly", "cache_timeout": 60 * 60},
    "7d": {"field": "daily", "cache_timeout": 12 * 60 * 60},
}
logger = logging.getLogger(__name__)


class WeatherProviderError(Exception):
    pass


def weather_response(code, message, data, status):
    return JsonResponse(
        {"code": code, "message": message, "data": data},
        status=status,
    )


def read_provider_json(response):
    body = response.read()
    if response.headers.get("Content-Encoding", "").lower() == "gzip":
        body = gzip.decompress(body)
    return json.loads(body.decode("utf-8"))


def parse_coordinates(request):
    try:
        longitude = float(request.GET["longitude"])
        latitude = float(request.GET["latitude"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("经纬度参数无效")

    if (
        not math.isfinite(longitude)
        or not math.isfinite(latitude)
        or not -180 <= longitude <= 180
        or not -90 <= latitude <= 90
    ):
        raise ValueError("经纬度参数无效")
    return longitude, latitude


def cache_key(forecast, longitude, latitude):
    return f"qhzhc:weather:{forecast}:{longitude:.4f}:{latitude:.4f}"


def get_qweather_api_key():
    return os.getenv(QWEATHER_API_KEY_ENV, "").strip()


def log_missing_qweather_api_key():
    logger.warning(
        "%s is not configured; set it in .env.local or the deployment secret store "
        "before starting the backend",
        QWEATHER_API_KEY_ENV,
    )


def fetch_qweather_forecast(forecast, longitude, latitude):
    api_key = get_qweather_api_key()
    if not api_key:
        raise RuntimeError("QWEATHER_API_KEY is required")

    config = FORECAST_CONFIG[forecast]
    query = urlencode(
        {
            "location": f"{longitude:.4f},{latitude:.4f}",
            "key": api_key,
        }
    )
    request = Request(
        f"{QWEATHER_BASE_URL}/{forecast}?{query}",
        headers={"Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=WEATHER_TIMEOUT_SECONDS) as response:
            response_status = getattr(response, "status", None)
            if response_status is None:
                response_status = response.getcode()
            if response_status != 200:
                raise WeatherProviderError("provider returned a non-success status")
            payload = read_provider_json(response)
    except WeatherProviderError:
        raise
    except Exception as error:
        raise WeatherProviderError("weather provider request failed") from error

    if not isinstance(payload, dict):
        raise WeatherProviderError("weather provider returned invalid data")
    data = payload.get(config["field"])
    if payload.get("code") != "200" or not isinstance(data, list):
        raise WeatherProviderError("weather provider returned invalid data")
    return data


def get_cached_forecast(forecast, longitude, latitude):
    config = FORECAST_CONFIG[forecast]
    key = cache_key(forecast, longitude, latitude)
    cached_data = cache.get(key)
    if cached_data is not None:
        return cached_data

    data = fetch_qweather_forecast(forecast, longitude, latitude)
    cache.set(key, data, timeout=config["cache_timeout"])
    return data


def has_visualization_access(user):
    return bool(
        user.is_superuser
        or user.can_visit_realtime
        or user.can_visit_history
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def weather_forecast(request):
    if not has_visualization_access(request.user):
        return weather_response(403, "没有天气数据访问权限", [], 403)

    try:
        longitude, latitude = parse_coordinates(request)
    except ValueError as error:
        return weather_response(400, str(error), [], 400)

    if not get_qweather_api_key():
        log_missing_qweather_api_key()
        return weather_response(503, "天气服务暂不可用", [], 503)

    try:
        hourly = get_cached_forecast("24h", longitude, latitude)
        daily = get_cached_forecast("7d", longitude, latitude)
    except WeatherProviderError:
        return weather_response(502, "天气服务请求失败", [], 502)

    return weather_response(
        200,
        "ok",
        {"hourly": hourly, "daily": daily},
        200,
    )
