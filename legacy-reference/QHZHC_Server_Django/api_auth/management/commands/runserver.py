from daphne.cli import CommandLineInterface
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run the project with Daphne so HTTP and WebSocket share the ASGI app."

    def add_arguments(self, parser):
        parser.add_argument("addrport", nargs="?", default=None)
        parser.add_argument("--noreload", action="store_true")
        parser.add_argument("--noasgi", action="store_true")

    def handle(self, *args, **options):
        if options["noasgi"]:
            raise SystemExit("`--noasgi` is not supported by this project.")

        host, port = self._parse_addrport(options.get("addrport"))
        cli_args = [
            "--bind",
            host,
            "--port",
            str(port),
            "--verbosity",
            str(options["verbosity"]),
            "sever_main.asgi:application",
        ]
        CommandLineInterface().run(cli_args)

    def _parse_addrport(self, addrport):
        default_host = "0.0.0.0"
        default_port = 18080

        if not addrport:
            return default_host, default_port

        if ":" in addrport:
            host, port = addrport.rsplit(":", 1)
            return host or default_host, int(port)

        return default_host, int(addrport)
