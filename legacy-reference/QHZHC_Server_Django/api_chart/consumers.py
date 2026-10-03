import asyncio
import math
import os

import asyncpg
import pytz
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from datetime import datetime, timedelta
from channels.db import database_sync_to_async
from django.conf import settings

###导入用户管理数据表
import logging
# 配置日志

logging.basicConfig(level=logging.INFO)

# 数据库中对应的表名
gps_table = "gps_parse_copy1"
pri_table = "pri_parse"
picarro_table = "picarro_parse"
windspeed_table = "windspeed_parse"
meteorological_table = "meteorological_station"
IMAGE_TABLE = "api_homepage_image"

# 数据库连接配置
DEFAULT_DB = settings.DATABASES["default"]
DB_USER = DEFAULT_DB.get("USER") or ""
DB_PASSWORD = DEFAULT_DB.get("PASSWORD") or ""
DB_DATABASE = DEFAULT_DB.get("NAME") or ""
DB_HOST = DEFAULT_DB.get("HOST") or "127.0.0.1"
DB_PORT = int(DEFAULT_DB.get("PORT") or 5432)

# 与现实时间的延迟
TIME_DELAY = timedelta(seconds=int(os.getenv("QHZHC_QUERY_DELAY_SECONDS") or 40))


# 地球半径：6371000M
# 地球周长：2 * 6371000M * π = 40030173
# 纬度38°地球周长：40030173 * cos38 = 31544206m
# 任意地球经度周长：40030173m
# °E 经度（东西方向）1米实际度：360°/31544206m = 1.141255544679108e-5 = 0.00001141°
oneduE = 0.00001141
# °N 纬度（南北方向）1米实际度：360°/40030173m = 8.993216192195822e-6 = 0.00000899°
oneduN = 0.00000899


def math_distance(latitude, longitude, coord_tuple):
    # 計算差值
    ABSE = abs(coord_tuple[0] - latitude) / oneduE
    ABSN = abs(coord_tuple[1] - longitude) / oneduN
    # 取算术平方根
    absmeter = float(math.sqrt(ABSE * ABSE + ABSN * ABSN))
    return absmeter


# 辅助函数：将逗号分隔的字符串转换为列表
def str_to_array(s):
    try:
        return [float(x) for x in (s or "").split(',') if x.strip() != '']
    except (AttributeError, TypeError, ValueError):
        return [0.0, 0.0]  # 默认值或处理方式


# 辅助函数：将包含速度和角度的列表转换为速度向量
def speed_to_vector(speed_and_angle):
    try:
        #### 针对其中一个速度值出现nan值特殊处理
        speed = speed_and_angle[0]/3.6
        angle_degrees = speed_and_angle[1]
        angle_radians = math.radians(angle_degrees)
        v_x = float(speed * math.cos(angle_radians))
        v_y = float(speed * math.sin(angle_radians))
        relist = [v_x,v_y]
        ### 针对速度值出现nan值的特殊处理过程20240911############
        if str(v_x).find("nan")>=0:
            relist[0] = 0.0
        if str(v_y).find("nan")>=0:
            relist[1] = 0.0
        return relist
    except (IndexError, ValueError):
        return [0.0, 0.0]  # 默认值或处理方式

####风向角判断函数#####
def judgewind(angle_in_degrees):
    if angle_in_degrees < 0:
        angle_in_degrees = angle_in_degrees+360
    return str(angle_in_degrees)

# 辅助函数：参数顺序很重要！涉及坐标系转换与计算。如果不清楚的话不要改！
def vector_add(wind_xy, carspeed_xy):
    try:
        return [carspeed_xy[1] - wind_xy[1], wind_xy[0] + carspeed_xy[0]]
    except (IndexError, ValueError):
        return [0.0, 0.0]

def get_picarro_ch4(row):
    try:
        high_precision = row.get("picarro_hp_12ch4_dry")
        high_range = row.get("picarro_hr_12ch4_dry")
        if high_precision is not None and float(high_precision) < 12:
            return high_precision
        return high_range
    except (AttributeError, ValueError, TypeError):
        return None


def to_visualization_point(row, timezone=None):
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
        point_time = point_time.astimezone(
            timezone or pytz.timezone("Asia/Shanghai")
        ).strftime("%Y-%m-%d %H:%M:%S")

    speed_and_direction = point.get("speed_and_direction") or "0,0"
    speed = str_to_array(speed_and_direction)
    point.update(
        {
            "geo_location": geo_location,
            "time": point_time,
            "wind": vector_add(
                str_to_array(point.get("windspeed_xy") or "0,0"),
                speed_to_vector(speed),
            ),
            "angle": judgewind(float(point.get("angle_in_degrees") or 0)),
            "speed": speed[0] if speed else 0,
            "picarro_ch4": get_picarro_ch4(point),
        }
    )
    point.pop("windspeed_xy", None)
    point.pop("speed_and_direction", None)
    return point


def has_visualization_permission(user, field):
    return bool(
        user
        and not user.is_anonymous
        and (getattr(user, "is_superuser", False) or getattr(user, field, False))
    )


class ChatView(AsyncWebsocketConsumer):
    coord_tuple = None

    # ========= DB =========
    async def attempt_db_connection(self):
        try:
            return await asyncio.wait_for(
                asyncpg.connect(
                    user=DB_USER,
                    password=DB_PASSWORD,
                    database=DB_DATABASE,
                    host=DB_HOST,
                    port=DB_PORT
                ),
                timeout=2
            )
        except (asyncio.TimeoutError, asyncpg.PostgresConnectionError) as e:
            logging.error(f"Failed to connect to database: {e}")
            return None

    async def connect_to_db(self):
        self.db_conn = await self.attempt_db_connection()
        if self.db_conn is None:
            logging.info("Retrying database connection...")
            self.db_conn = await self.attempt_db_connection()

    async def disconnect_db(self):
        if hasattr(self, "db_conn") and self.db_conn is not None:
            try:
                await asyncio.wait_for(self.db_conn.close(), timeout=5)
            except asyncio.TimeoutError:
                logging.warning("Closing the database connection timed out.")
            self.db_conn = None

    async def check_db_connection(self):
        if (not hasattr(self, "db_conn")) or self.db_conn is None or self.db_conn.is_closed():
            await self.connect_to_db()

    # ========= utils =========
    def judge_coord_tuple(self, longitude, latitude):
        if self.coord_tuple is None:
            self.coord_tuple = (latitude, longitude)
            return [False, None]
        absmeter = math_distance(latitude, longitude, self.coord_tuple)
        if 2.7 < absmeter:
            self.coord_tuple = (latitude, longitude)
            return [True, absmeter]
        else:
            self.coord_tuple = (latitude, longitude)
            return [False, None]

    async def handle_close(self, data):
        await self.close()

    async def send_packet(
        self,
        code,
        message,
        data,
        begin_time=None,
        end_time=None,
        **extra,
    ):
        packet = {
            "code": code,
            "message": message,
            "data": data,
        }
        if begin_time is not None:
            packet["begin_time"] = begin_time.strftime("%Y-%m-%d %H:%M:%S")
        if end_time is not None:
            packet["end_time"] = end_time.strftime("%Y-%m-%d %H:%M:%S")
        packet.update(extra)
        await self.send(text_data=json.dumps(packet, ensure_ascii=False))

    # ======================================================
    # new_data_gps：取 1 秒窗口内最新一条
    # ======================================================
    async def handle_new_data_gps(self, data):
        await self.check_db_connection()
        if self.db_conn is None:
            await self.send_packet(500, "数据库连接失败", [])
            return

        tz = pytz.timezone("Asia/Shanghai")
        current_time = datetime.now(tz).replace(microsecond=0)
        start_time = current_time - TIME_DELAY
        end_time = start_time + timedelta(seconds=1)

        # 核心：所有可能出现 '' 的字段都 NULLIF 后再 cast，避免 double precision 输入 ""
        query = f"""
        SELECT
            gps.time AS time,
            gps.latitude,
            gps.longitude,
            gps.altitude,

            CONCAT(
                COALESCE(gps.speed::text, '0'),
                ',',
                COALESCE(gps.speed_direction::text, '0')
            ) AS speed_and_direction,

            pri.co2 AS pri_co2,
            pri.ch4 AS pri_ch4,
            CAST(ROUND((COALESCE(pri.c2h6, 0) / 1000.0)::numeric, 3) AS TEXT) AS pri_c2h6,
            pri.co  AS pri_co,
            pri.n2o AS pri_n2o,
            CAST(
                ROUND((COALESCE(pri.h2o, 0) / 10000.0)::numeric, 3)
            AS TEXT) AS pri_h2o,
            picarro.hr_12ch4_dry AS picarro_hr_12ch4_dry,
            picarro.hp_12ch4_dry AS picarro_hp_12ch4_dry,
            picarro.co2_12_dry    AS picarro_12co2_dry,
            picarro.delta_ich4_raw AS picarro_delta_ich4_raw,
            picarro.h2o AS picarro_h2o,

            CONCAT(
                COALESCE(wind.xspeed::text, '0'),
                ',',
                COALESCE(wind.yspeed::text, '0')
            ) AS windspeed_xy,

            wind.zspeed AS wind_zspeed,

            degrees(
                atan2(
                    COALESCE(wind.yspeed, 0),
                    COALESCE(wind.xspeed, 0)
                )
            ) AS angle_in_degrees,

            sqrt(
                pow(COALESCE(wind.xspeed,0),2) +
                pow(COALESCE(wind.yspeed,0),2)
            ) AS r,

            meteorological.temperature AS temperature,
            meteorological.pressure AS pressure,
            meteorological.speed_of_true_wind AS speed_of_true_wind,
            meteorological.direction_of_true_wind AS direction_of_true_wind,
            meteorological.relative_humidity AS relative_humidity

        FROM {gps_table} gps
        LEFT JOIN {pri_table} pri
            ON pri.time BETWEEN gps.time - interval '1 second' AND gps.time
        LEFT JOIN {picarro_table} picarro
            ON picarro.time BETWEEN gps.time - interval '1 second' AND gps.time
        LEFT JOIN {windspeed_table} wind
            ON wind.time BETWEEN gps.time - interval '1 second' AND gps.time
        LEFT JOIN {meteorological_table} meteorological
            ON meteorological.time BETWEEN gps.time - interval '1 second' AND gps.time

        WHERE gps.time >= $1 AND gps.time < $2
        ORDER BY gps.time DESC
        LIMIT 1;
        """

        try:
            rows = await asyncio.wait_for(self.db_conn.fetch(query, start_time, end_time), timeout=2)
        except Exception:
            logging.exception("new_data_gps SQL error")
            rows = []

        # 距离（仅实时模式）
        try:
            if rows:
                distance_list = self.judge_coord_tuple(float(rows[0]["longitude"]), float(rows[0]["latitude"]))
            else:
                distance_list = [False, None]
        except Exception:
            distance_list = [False, None]

        if not rows:
            await self.send_packet(
                204,
                "当前窗口无实时数据",
                [],
                begin_time=start_time,
                end_time=end_time,
                **{"3m_dis": distance_list[0], "distance": distance_list[1]},
            )
            return

        await self.send_packet(
            200,
            "ok",
            [to_visualization_point(rows[0], tz)],
            begin_time=start_time,
            end_time=end_time,
            **{"3m_dis": distance_list[0], "distance": distance_list[1]},
        )

    # ======================================================
    # history_data_5min：历史 5 分钟窗口
    # ======================================================
    async def handle_history_data_5min(self, data):
        await self.check_db_connection()
        if self.db_conn is None:
            await self.send_packet(500, "数据库连接失败", [])
            return

        tz = pytz.timezone("Asia/Shanghai")
        end_time = datetime.now(tz) - TIME_DELAY
        start_time = (end_time - timedelta(minutes=5)).replace(microsecond=0)

        query = f"""
        SELECT DISTINCT ON (gps.time)
            gps.time AS time,
            gps.latitude,
            gps.longitude,
            gps.altitude,

            CONCAT(
                COALESCE(gps.speed::text, '0'),
                ',',
                COALESCE(gps.speed_direction::text, '0')
            ) AS speed_and_direction,

            pri.co2 AS pri_co2,
            pri.ch4 AS pri_ch4,
            pri.c2h6 AS pri_c2h6,
            pri.co AS pri_co,
            pri.n2o AS pri_n2o,
            CAST(ROUND((COALESCE(pri.h2o, 0) / 10000.0)::numeric, 3) AS TEXT) AS pri_h2o,

            picarro.hr_12ch4_dry AS picarro_hr_12ch4_dry,
            picarro.hp_12ch4_dry AS picarro_hp_12ch4_dry,
            picarro.co2_12_dry AS picarro_12co2_dry,
            picarro.delta_ich4_raw,
            picarro.h2o AS picarro_h2o,

            CONCAT(
                COALESCE(wind.xspeed::text, '0'),
                ',',
                COALESCE(wind.yspeed::text, '0')
            ) AS windspeed_xy,

            wind.zspeed AS wind_zspeed,

            degrees(
                atan2(
                    COALESCE(wind.yspeed, 0),
                    COALESCE(wind.xspeed, 0)
                )
            ) AS angle_in_degrees,

            sqrt(
                pow(COALESCE(wind.xspeed,0),2) +
                pow(COALESCE(wind.yspeed,0),2)
            ) AS r

        FROM {gps_table} gps
        LEFT JOIN {pri_table} pri
            ON pri.time BETWEEN gps.time - interval '1 second' AND gps.time
        LEFT JOIN {picarro_table} picarro
            ON picarro.time BETWEEN gps.time - interval '1 second' AND gps.time
        LEFT JOIN {windspeed_table} wind
            ON wind.time BETWEEN gps.time - interval '1 second' AND gps.time

        WHERE gps.time >= $1 AND gps.time < $2
        ORDER BY gps.time ASC, pri.time ASC, picarro.time ASC, wind.time ASC;
        """

        try:
            rows = await asyncio.wait_for(self.db_conn.fetch(query, start_time, end_time), timeout=5)
        except Exception:
            logging.exception("history_data_5min SQL error")
            rows = []

        await self.send_packet(
            200,
            "ok",
            [to_visualization_point(row, tz) for row in rows],
            begin_time=start_time,
            end_time=end_time,
            **{"3m_dis": False, "distance": None},
        )

    # ========= command dispatch =========
    COMMANDS = {
        "close": {"handler": "handle_close", "permission": None},
        "new_data_gps": {
            "handler": "handle_new_data_gps",
            "permission": "can_visit_realtime",
        },
        "history_data_5min": {
            "handler": "handle_history_data_5min",
            "permission": "can_visit_history",
        },
    }

    # ========= websocket lifecycle =========
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close()
            return

        if not has_visualization_permission(user, "can_visit_realtime"):
            await self.close()
            return

        await self.connect_to_db()
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
        except (TypeError, json.JSONDecodeError):
            await self.send_packet(400, "请求格式错误", [])
            return

        if not isinstance(data, dict):
            await self.send_packet(400, "请求格式错误", [])
            return

        command_metadata = self.COMMANDS.get(data.get("command"))
        if command_metadata is None:
            await self.send_packet(400, "未知指令", [])
            return

        permission = command_metadata["permission"]
        if permission and not has_visualization_permission(
            self.scope.get("user"),
            permission,
        ):
            message = (
                "没有历史数据查询权限"
                if permission == "can_visit_history"
                else "没有实时数据查询权限"
            )
            await self.send_packet(403, message, [])
            return

        try:
            handler = getattr(self, command_metadata["handler"])
            await handler(data)
        except Exception:
            logging.exception("websocket command failed")
            await self.send_packet(500, "服务处理失败", [])

    async def disconnect(self, close_code):
        await self.disconnect_db()
