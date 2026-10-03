import os
from pathlib import Path
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_local_env():
    env_path = PROJECT_ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_database_connection_kwargs():
    load_local_env()
    password = os.getenv("QHZHC_DB_PASSWORD")
    if not password:
        raise RuntimeError("QHZHC_DB_PASSWORD is required")
    return {
        "dbname": os.getenv("QHZHC_DB_NAME") or "postgres",
        "user": os.getenv("QHZHC_DB_USER") or "postgres",
        "password": password,
        "host": os.getenv("QHZHC_DB_HOST") or "127.0.0.1",
        "port": int(os.getenv("QHZHC_DB_PORT") or 5432),
    }


def get_sqlalchemy_database_url():
    database = get_database_connection_kwargs()
    return (
        "postgresql+psycopg2://"
        f"{quote(database['user'], safe='')}:{quote(database['password'], safe='')}"
        f"@{database['host']}:{database['port']}/{database['dbname']}"
    )
