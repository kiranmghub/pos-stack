from django.core.management.base import BaseCommand, CommandError
from emails.services import send_templated_email


class Command(BaseCommand):
    help = "Send a test email using a named template (default: signup_otp)."

    def add_arguments(self, parser):
        parser.add_argument("--to", dest="to_address", required=True, help="Recipient email address")
        parser.add_argument(
            "--template",
            dest="template",
            default="signup_otp",
            help="Template name to send (default: signup_otp)",
        )
        parser.add_argument(
            "--context",
            dest="context",
            nargs="*",
            default=[],
            help="Optional context key=value pairs (e.g., code=123456 expires_minutes=10)",
        )

    def handle(self, *args, **options):
        to_address = options["to_address"]
        template = options["template"]
        context_kv = options.get("context") or []
        context = {}
        for item in context_kv:
            if "=" not in item:
                raise CommandError(f"Invalid context entry '{item}'. Use key=value.")
            key, val = item.split("=", 1)
            context[key] = val

        log = send_templated_email(name=template, to=to_address, context=context)
        status = log.status
        self.stdout.write(self.style.SUCCESS(f"Sent status={status} to={to_address} (log id={log.id})"))
