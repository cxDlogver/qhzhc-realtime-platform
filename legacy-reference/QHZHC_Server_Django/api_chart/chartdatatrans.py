import asyncio
import logging
import os
from datetime import datetime, timedelta

import asyncpg
import pytz
from django.http import JsonResponse
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from api_auth.decorators import any_permission_required, permission_required
from api_chart.consumers import (
    DB_DATABASE,
    DB_HOST,
    DB_PASSWORD,
    DB_PORT,
    DB_USER,
    TIME_DELAY,
    get_picarro_ch4,
    gps_table,
    picarro_table,
    pri_table,
    speed_to_vector,
    str_to_array,
    vector_add,
    windspeed_table,
)

logger = logging.getLogger(__name__)
HISTORY_MAX_SECONDS = int(os.getenv("QHZHC_HISTORY_MAX_SECONDS", "86400"))


def judgewind(angle_in_degrees):
    if angle_in_degrees < 0:
        angle_in_degrees += 360
    return str(angle_in_degrees)


async def connect_to_db():
    return await asyncpg.connect(
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_DATABASE,
        host=DB_HOST,
        port=DB_PORT,
    )


def build_response(code, message, data, begin_time=None, end_time=None):
    payload = {
        "code": code,
        "message": message,
        "data": data,
    }
    if begin_time is not None:
        payload["begin_time"] = begin_time.strftime("%Y-%m-%d %H:%M:%S")
    if end_time is not None:
        payload["end_time"] = end_time.strftime("%Y-%m-%d %H:%M:%S")
    return payload


def parse_history_range(request):
    start_time = parse_datetime(request.GET.get("start_time", ""))
    end_time = parse_datetime(request.GET.get("end_time", ""))
    if not start_time or not end_time:
        raise ValueError("时间格式错误")
    if start_time >= end_time:
        raise ValueError("开始时间必须早于结束时间")
    if (end_time - start_time).total_seconds() > HISTORY_MAX_SECONDS:
        raise ValueError("查询时间范围不能超过24小时")
    return start_time, end_time


def parse_five_minute_time(request):
    raw_time = request.GET.get("time", "")
    if raw_time:
        point_time = parse_datetime(raw_time)
        if not point_time:
            raise ValueError("时间格式错误")
        end_time = point_time + timedelta(minutes=2, seconds=30)
    else:
        tz = pytz.timezone("Asia/Shanghai")
        end_time = (datetime.now(tz) - TIME_DELAY).replace(microsecond=0)
    if not end_time:
        raise ValueError("时间格式错误")
    return (end_time - timedelta(minutes=5)).replace(microsecond=0), end_time


def to_visualization_point(row):
    point = dict(row)
    longitude = point.get("longitude")
    latitude = point.get("latitude")
    try:
        geo_location = (
            [float(longitude), float(latitude)]
            if longitude is not None and latitude is not None
            else None
        )
    except (TypeError, ValueError):
        geo_location = None

    point_time = point.get("time")
    if point_time is not None:
        point_time = point_time.astimezone().strftime("%Y-%m-%d %H:%M:%S")

    speed_and_direction = point.get("speed_and_direction") or "0,0"
    windspeed_xy = point.get("windspeed_xy") or "0,0"
    speed = str_to_array(speed_and_direction)
    point.update(
        {
            "geo_location": geo_location,
            "time": point_time,
            "wind": vector_add(str_to_array(windspeed_xy), speed_to_vector(speed)),
            "angle": judgewind(float(point.get("angle_in_degrees") or 0)),
            "speed": speed[0] if speed else 0,
            "picarro_ch4": get_picarro_ch4(point),
        }
    )
    point.pop("windspeed_xy", None)
    point.pop("speed_and_direction", None)
    return point


QUERY_TIME_BETWEEN = f"""
    SELECT DISTINCT ON (gps.time)
        DATE_TRUNC('second', gps.time) AS time,
        gps.latitude,
        gps.longitude,
        gps.altitude,
        CONCAT(COALESCE(gps.speed::TEXT, NULL), ',', COALESCE(gps.speed_direction::TEXT, NULL)) AS speed_and_direction,
        pri.co2 AS pri_co2,
        pri.ch4 AS pri_ch4,
        pri.c2h6 AS pri_c2h6,
        pri.co AS pri_co,
        pri.n2o AS pri_n2o,
        CAST(ROUND(CAST(pri.h2o AS NUMERIC) / 10000, 3) AS TEXT) AS pri_h2o,
        picarro.hr_12ch4_dry AS picarro_hr_12ch4_dry,
        picarro.hp_12ch4_dry AS picarro_hp_12ch4_dry,
        picarro.co2_12_dry AS picarro_12co2_dry,
        picarro.delta_ich4_raw AS picarro_delta_ich4_raw,
        picarro.h2o AS picarro_h2o,
        CONCAT(COALESCE(wind.xspeed::TEXT, NULL), ',', COALESCE(wind.yspeed::TEXT, NULL)) AS windspeed_xy,
        wind.zspeed AS wind_zspeed,
        degrees(
            COALESCE(
                atan(
                    COALESCE(wind.yspeed, 0)
                    / NULLIF(COALESCE(wind.xspeed, 0), 0)
                ),
                0
            )
        ) AS angle_in_degrees,
        SQRT(
            COALESCE(wind.xspeed, 0) * COALESCE(wind.xspeed, 0)
            + COALESCE(wind.yspeed, 0) * COALESCE(wind.yspeed, 0)
        ) AS r
    FROM {gps_table} gps
    LEFT JOIN {pri_table} pri
        ON DATE_TRUNC('second', pri.time) = DATE_TRUNC('second', gps.time)
    LEFT JOIN {picarro_table} picarro
        ON DATE_TRUNC('second', picarro.time) = DATE_TRUNC('second', gps.time)
    LEFT JOIN {windspeed_table} wind
        ON DATE_TRUNC('second', wind.time) = DATE_TRUNC('second', gps.time)
    WHERE gps.time >= $1 AND gps.time < $2
    ORDER BY gps.time ASC, pri.time ASC, picarro.time ASC, wind.time ASC;
"""

# Retain the old exported name for integration callers and tests.
query_time_between = QUERY_TIME_BETWEEN


async def query_history_points(start_time, end_time):
    connection = None
    try:
        connection = await connect_to_db()
        rows = await connection.fetch(QUERY_TIME_BETWEEN, start_time, end_time)
        return [to_visualization_point(row) for row in rows]
    finally:
        if connection is not None:
            await connection.close()


async def dataTrans_time_between_async(end_time, start_time):
    return await query_history_points(start_time, end_time)


def query_error_response(error):
    if isinstance(error, ValueError):
        return JsonResponse(
            build_response(400, str(error), []),
            status=400,
        )
    logger.exception("history query failed")
    return JsonResponse(
        build_response(500, "历史数据查询失败", []),
        status=500,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required("is_superuser"),
    permission_required("can_visit_history"),
)
def dataTrans_between(request):
    try:
        start_time, end_time = parse_history_range(request)
        data = asyncio.run(dataTrans_time_between_async(end_time, start_time))
    except ValueError as error:
        return query_error_response(error)
    except (asyncpg.PostgresError, asyncio.TimeoutError):
        return query_error_response(Exception())
    except Exception:
        return query_error_response(Exception())

    return JsonResponse(
        build_response(200, "ok", data, start_time, end_time),
        status=200,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required("is_superuser"),
    permission_required("can_visit_history"),
)
def dataTrans_5min(request):
    try:
        start_time, end_time = parse_five_minute_time(request)
        data = asyncio.run(dataTrans_time_between_async(end_time, start_time))
    except ValueError as error:
        return query_error_response(error)
    except (asyncpg.PostgresError, asyncio.TimeoutError):
        return query_error_response(Exception())
    except Exception:
        return query_error_response(Exception())

    return JsonResponse(
        build_response(200, "ok", data, start_time, end_time),
        status=200,
    )
