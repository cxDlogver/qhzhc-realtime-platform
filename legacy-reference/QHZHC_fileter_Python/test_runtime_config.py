import os
import re
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


FILTER_DIR = Path(__file__).resolve().parent
ROOT_DIR = FILTER_DIR.parent


class IngestionConfigurationContractTests(unittest.TestCase):
    def test_realtime_ingester_requires_database_password(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("pathlib.Path.exists", return_value=False),
            patch.object(sys, "path", [str(FILTER_DIR), *sys.path]),
            self.assertRaisesRegex(RuntimeError, "QHZHC_DB_PASSWORD is required"),
        ):
            runpy.run_path(str(FILTER_DIR / "TestMain.py"), run_name="__test__")

    def test_ingestion_scripts_do_not_embed_database_credentials(self):
        source_files = [
            "DataRes.py",
            "InsertToDataBaseRealtime.py",
            "InsertToDataBaseRealtime_PRI.py",
            "InsertToDataBaseRealtime_picaro.py",
            "InsertToDataBaseRealtime_Wind.py",
            "Segmented_extraction.py",
            "TestMain.py",
        ]
        embedded_url_credentials = re.compile(
            r"postgresql(?:\+\w+)?://[^:\s'\"/]+:[^@\s'\"/]+@",
        )
        hardcoded_password = re.compile(r"password\s*=\s*['\"][^'\"]+['\"]")

        for source_file in source_files:
            source = (FILTER_DIR / source_file).read_text(encoding="utf-8")
            self.assertNotRegex(source, embedded_url_credentials)
            self.assertNotRegex(source, hardcoded_password)
            self.assertNotIn('os.getenv("QHZHC_DB_PASSWORD",', source)


if __name__ == "__main__":
    unittest.main()
