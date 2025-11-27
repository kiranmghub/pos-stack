import logging
from django.core.mail import EmailMultiAlternatives
from django.template import Template, Context
from django.utils import timezone

from .models import EmailTemplate, EmailLog

logger = logging.getLogger(__name__)


def render_template(template: EmailTemplate, context: dict) -> str:
    tpl = Template(template.html_body)
    return tpl.render(Context(context))


def send_templated_email(name: str, to: str, context: dict, locale: str = "en") -> EmailLog:
    """
    Render and send an email using a named template. Always logs the attempt.
    """
    try:
        template = (
            EmailTemplate.objects.filter(name=name, locale=locale, is_active=True)
            .order_by("-version")
            .first()
        )
        if not template:
            raise EmailTemplate.DoesNotExist()
    except EmailTemplate.DoesNotExist:
        logger.error("Email template %s (%s) not found", name, locale)
        log = EmailLog.objects.create(
            to_address=to,
            subject=f"[MISSING TEMPLATE] {name}",
            status="failed",
            payload={"context": context},
        )
        return log

    html_body = render_template(template, context)

    log = EmailLog.objects.create(
        to_address=to,
        subject=template.subject,
        template=template,
        status="queued",
        payload={"context": context},
    )

    try:
        msg = EmailMultiAlternatives(
            subject=template.subject,
            body=html_body,
            to=[to],
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)

        log.status = "sent"
        log.sent_at = timezone.now()
        log.save(update_fields=["status", "sent_at"])
    except Exception as exc:
        logger.exception("Failed to send email to %s", to)
        log.status = "failed"
        log.error_message = str(exc)
        log.save(update_fields=["status", "error_message"])

    return log
