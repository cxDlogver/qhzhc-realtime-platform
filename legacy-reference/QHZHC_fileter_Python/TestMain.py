import time
import math
import random
import os
from datetime import datetime, timezone

import psycopg2

from db_config import get_database_connection_kwargs


# ======================================================
# 1) 数据库配置
# ======================================================


DB = {
    **get_database_connection_kwargs(),
    "connect_timeout": 5,
}

TABLES = {
    "gps": "gps_parse_copy1",
    "pri": "pri_parse",
    "picarro": "picarro_parse",
    "wind": "windspeed_parse",
    "meteo": "meteorological_station",  # ✅ 新增
}

INTERVAL = float(os.getenv("QHZHC_INGEST_INTERVAL") or 1.0)  # 每秒写一次


# ======================================================
# 2) DB 工具
# ======================================================
def get_conn():
    return psycopg2.connect(**DB)


def fetch_columns(cur, table_name: str):
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
        ORDER BY ordinal_position;
        """,
        (table_name,),
    )
    return [r[0] for r in cur.fetchall()]


# ======================================================
# 3) 建表（不存在则创建）——time 用 timestamptz，数值用 double
# ======================================================
def ensure_tables():
    gps = TABLES["gps"]
    pri = TABLES["pri"]
    pic = TABLES["picarro"]
    wind = TABLES["wind"]
    meteo = TABLES["meteo"]

    create_gps = f"""
    CREATE TABLE IF NOT EXISTS public.{gps} (
        time TIMESTAMPTZ PRIMARY KEY,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        altitude DOUBLE PRECISION,
        speed DOUBLE PRECISION,           -- km/h
        speed_direction DOUBLE PRECISION  -- deg
    );
    """

    create_pri = f"""
    CREATE TABLE IF NOT EXISTS public.{pri} (
        time TIMESTAMPTZ PRIMARY KEY,
        co2 DOUBLE PRECISION,
        h2o DOUBLE PRECISION,
        n2o DOUBLE PRECISION,
        ch4 DOUBLE PRECISION,
        c2h6 DOUBLE PRECISION,
        co  DOUBLE PRECISION,
        t1  DOUBLE PRECISION,
        t2  DOUBLE PRECISION,
        t3  DOUBLE PRECISION,
        p1  DOUBLE PRECISION,
        p2  DOUBLE PRECISION,
        p3  DOUBLE PRECISION
    );
    """

    create_wind = f"""
    CREATE TABLE IF NOT EXISTS public.{wind} (
        time TIMESTAMPTZ PRIMARY KEY,
        xspeed DOUBLE PRECISION,
        yspeed DOUBLE PRECISION,
        zspeed DOUBLE PRECISION,
        speed_of_sound DOUBLE PRECISION,
        temperature_coefficient_of_sound_velocity DOUBLE PRECISION
    );
    """

    create_picarro = f"""
    CREATE TABLE IF NOT EXISTS public.{pic} (
        time TIMESTAMPTZ PRIMARY KEY,
        cavitypressure DOUBLE PRECISION,
        cavitytemp DOUBLE PRECISION,
        hp_12ch4 DOUBLE PRECISION,
        hp_12ch4_dry DOUBLE PRECISION,
        hp_13ch4 DOUBLE PRECISION,
        hr_13ch4 DOUBLE PRECISION,
        delta_ich4_raw DOUBLE PRECISION,
        hp_delta_ich4_raw DOUBLE PRECISION,
        hp_delta_ich4_30s DOUBLE PRECISION,
        hp_delta_ich4_2min DOUBLE PRECISION,
        hp_delta_ich4_5min DOUBLE PRECISION,
        hr_12ch4 DOUBLE PRECISION,
        hr_12ch4_dry DOUBLE PRECISION,
        hr_delta_ich4_raw DOUBLE PRECISION,
        hr_delta_ich4_30s DOUBLE PRECISION,
        hr_delta_ich4_2min DOUBLE PRECISION,
        hr_delta_ich4_5min DOUBLE PRECISION,
        chemdetect DOUBLE PRECISION,
        h2o DOUBLE PRECISION,
        co2_12 DOUBLE PRECISION,
        co2_12_dry DOUBLE PRECISION,
        co2_13 DOUBLE PRECISION,
        delta_raw_ico2 DOUBLE PRECISION,
        delta_30s_ico2 DOUBLE PRECISION,
        delta_2min_ico2 DOUBLE PRECISION,
        delta_5min_ico2 DOUBLE PRECISION,
        ch4 DOUBLE PRECISION,
        co2 DOUBLE PRECISION
    );
    """

    # ✅ 你 SQL 里 JOIN 的气象表字段
    create_meteo = f"""
    CREATE TABLE IF NOT EXISTS public.{meteo} (
        time TIMESTAMPTZ PRIMARY KEY,
        temperature DOUBLE PRECISION,             -- °C
        pressure DOUBLE PRECISION,                -- hPa (建议)
        speed_of_true_wind DOUBLE PRECISION,      -- m/s
        direction_of_true_wind DOUBLE PRECISION,  -- deg 0-360
        relative_humidity DOUBLE PRECISION        -- %
    );
    """

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(create_gps)
            cur.execute(create_pri)
            cur.execute(create_wind)
            cur.execute(create_picarro)
            cur.execute(create_meteo)
        conn.commit()

    print("✅ 已确保五张表存在（不存在则自动创建）")


# ======================================================
# 4) 随机游走生成器（连续、无空字符串）
# ======================================================
class RandomWalk:
    def __init__(self, base, step, lo=None, hi=None):
        self.x = float(base)
        self.step = float(step)
        self.lo = lo
        self.hi = hi

    def next(self):
        self.x += random.uniform(-self.step, self.step)
        if self.lo is not None:
            self.x = max(self.lo, self.x)
        if self.hi is not None:
            self.x = min(self.hi, self.x)
        return self.x


# ======================================================
# 5) GPS 运动模型：经纬度/高度逐步变化且与 speed 匹配
# ======================================================
class GPSMotion:
    def __init__(self, lat=28.1690, lon=104.8100, alt=620.0):
        self.lat = lat
        self.lon = lon
        self.alt = alt
        self.speed = 6.0
        self.heading = 45.0

    def step(self, dt=1.0):
        self.speed = max(0.0, self.speed + random.uniform(-0.3, 0.3))
        self.heading = (self.heading + random.uniform(-3.0, 3.0)) % 360.0

        dist_m = (self.speed * 1000.0 / 3600.0) * dt
        rad = math.radians(self.heading)

        dlat = (dist_m * math.cos(rad)) / 111_320.0
        dlon = (dist_m * math.sin(rad)) / (111_320.0 * math.cos(math.radians(self.lat)))

        self.lat += dlat
        self.lon += dlon
        self.alt += random.uniform(-0.05, 0.05)

        return {
            "latitude": self.lat,
            "longitude": self.lon,
            "altitude": self.alt,
            "speed": self.speed,
            "speed_direction": self.heading,
        }


# ======================================================
# 6) 插入：只插入真实存在列
# ======================================================
def insert_row(cur, table_name: str, row: dict):
    cols = list(row.keys())
    placeholders = ",".join(["%s"] * len(cols))
    col_str = ",".join(cols)
    sql = f"""
        INSERT INTO {table_name} ({col_str})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING;
    """
    cur.execute(sql, [row[c] for c in cols])


# ======================================================
# 7) 主循环：每秒五表各写一条
# ======================================================
def main():
    ensure_tables()

    gps_model = GPSMotion()

    pri_gen = {
        "co2": RandomWalk(420.0, 0.8, 380, 460),
        "h2o": RandomWalk(32200.0, 60, 28000, 38000),
        "n2o": RandomWalk(0.35, 0.002, 0.2, 0.5),
        "ch4": RandomWalk(2.03, 0.03, 1.5, 5.0),
        "c2h6": RandomWalk(18.7, 0.08, 0, 50),
        "co":  RandomWalk(0.23, 0.01, 0, 5),
        "t1":  RandomWalk(42.8, 0.05, 0, 80),
        "t2":  RandomWalk(41.6, 0.05, 0, 80),
        "t3":  RandomWalk(44.0, 0.05, 0, 80),
        "p1":  RandomWalk(140.0, 0.2, 50, 400),
        "p2":  RandomWalk(240.0, 0.2, 50, 600),
        "p3":  RandomWalk(140.0, 0.2, 50, 400),
    }

    wind_gen = {
        "xspeed": RandomWalk(-0.8, 0.12, -5, 5),
        "yspeed": RandomWalk(-1.0, 0.12, -5, 5),
        "zspeed": RandomWalk(0.05, 0.03, -2, 2),
        "speed_of_sound": RandomWalk(351.2, 0.2, 300, 400),
        "temperature_coefficient_of_sound_velocity": RandomWalk(33.1, 0.05, -20, 80),
    }

    pic_gen = {
        "cavitypressure": RandomWalk(148.0, 0.2, 50, 300),
        "cavitytemp": RandomWalk(45.0, 0.05, 0, 80),
        "hp_12ch4": RandomWalk(2.07, 0.03, 0, 10),
        "hp_12ch4_dry": RandomWalk(2.12, 0.03, 0, 10),
        "hp_13ch4": RandomWalk(0.02, 0.01, -10, 10),
        "hr_13ch4": RandomWalk(0.02, 0.01, -10, 10),
        "delta_ich4_raw": RandomWalk(-50.0, 3.0, -200, 200),
        "hp_delta_ich4_raw": RandomWalk(-55.0, 3.0, -200, 200),
        "hp_delta_ich4_30s": RandomWalk(-51.0, 2.0, -200, 200),
        "hp_delta_ich4_2min": RandomWalk(-49.0, 2.0, -200, 200),
        "hp_delta_ich4_5min": RandomWalk(-48.0, 2.0, -200, 200),
        "hr_12ch4": RandomWalk(1.96, 0.03, 0, 10),
        "hr_12ch4_dry": RandomWalk(2.02, 0.03, 0, 10),
        "hr_delta_ich4_raw": RandomWalk(-60.0, 3.0, -200, 200),
        "hr_delta_ich4_30s": RandomWalk(-55.0, 3.0, -200, 200),
        "hr_delta_ich4_2min": RandomWalk(-58.0, 3.0, -200, 200),
        "hr_delta_ich4_5min": RandomWalk(-54.0, 3.0, -200, 200),
        "chemdetect": RandomWalk(1.0, 0.0, 1, 1),
        "h2o": RandomWalk(2.78, 0.02, 0, 10),
        "co2_12": RandomWalk(397.6, 1.5, 200, 800),
        "co2_12_dry": RandomWalk(421.2, 1.5, 200, 900),
        "co2_13": RandomWalk(4.66, 0.1, -50, 50),
        "delta_raw_ico2": RandomWalk(-10.6, 0.2, -50, 50),
        "delta_30s_ico2": RandomWalk(-11.0, 0.2, -50, 50),
        "delta_2min_ico2": RandomWalk(-10.4, 0.2, -50, 50),
        "delta_5min_ico2": RandomWalk(-10.5, 0.2, -50, 50),
        "delta_5min_ico2": RandomWalk(-10.5, 0.2, -50, 50),
        "ch4": RandomWalk(2.05, 0.03, 0, 10),
        "co2": RandomWalk(399.2, 1.5, 200, 900),
    }

    # ✅ meteorological 数据生成器（单位建议：°C / hPa / m/s / deg / %）
    meteo_gen = {
        "temperature": RandomWalk(33.0, 0.08, -10, 60),
        "pressure": RandomWalk(1013.0, 0.5, 900, 1100),
        "speed_of_true_wind": RandomWalk(1.5, 0.2, 0, 25),
        "direction_of_true_wind": RandomWalk(45.0, 5.0, 0, 360),
        "relative_humidity": RandomWalk(55.0, 0.8, 0, 100),
    }

    print("🚀 开始五表实时写入（Ctrl+C 结束）")

    with get_conn() as conn:
        with conn.cursor() as cur:
            gps_cols = fetch_columns(cur, TABLES["gps"])
            pri_cols = fetch_columns(cur, TABLES["pri"])
            wind_cols = fetch_columns(cur, TABLES["wind"])
            pic_cols = fetch_columns(cur, TABLES["picarro"])
            meteo_cols = fetch_columns(cur, TABLES["meteo"])

            while True:
                t = datetime.now(timezone.utc)  # TIMESTAMPTZ

                # GPS
                gps_state = gps_model.step(dt=INTERVAL)
                gps_row = {"time": t}
                for c in gps_cols:
                    if c in gps_state:
                        gps_row[c] = gps_state[c]
                insert_row(cur, TABLES["gps"], gps_row)

                # PRI
                pri_row = {"time": t}
                for c in pri_cols:
                    if c in pri_gen:
                        pri_row[c] = pri_gen[c].next()
                insert_row(cur, TABLES["pri"], pri_row)

                # Wind
                wind_row = {"time": t}
                for c in wind_cols:
                    if c in wind_gen:
                        wind_row[c] = wind_gen[c].next()
                insert_row(cur, TABLES["wind"], wind_row)

                # Picaro
                pic_row = {"time": t}
                for c in pic_cols:
                    if c != "time" and c in pic_gen:
                        pic_row[c] = pic_gen[c].next()
                insert_row(cur, TABLES["picarro"], pic_row)

                # ✅ Meteorological
                meteo_row = {"time": t}
                for c in meteo_cols:
                    if c in meteo_gen:
                        meteo_row[c] = meteo_gen[c].next()

                # 防止 direction 跑出范围（0~360）
                if "direction_of_true_wind" in meteo_row:
                    meteo_row["direction_of_true_wind"] = meteo_row["direction_of_true_wind"] % 360.0

                insert_row(cur, TABLES["meteo"], meteo_row)

                conn.commit()
                print(f"✓ {t.isoformat()} 五表写入完成")
                time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
