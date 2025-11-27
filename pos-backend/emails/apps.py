from django.apps import AppConfig
from django.db.models.signals import post_migrate


class EmailsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "emails"
    verbose_name = "Emails"

    def ready(self):
        def seed_templates(sender, **kwargs):
            from emails.models import EmailTemplate

            EmailTemplate.objects.update_or_create(
                name="signup_otp",
                defaults={
                    "subject": "Your POS signup code",
                    "html_body": """
                        <p>Hello,</p>
                        <p>Your signup code is <strong>{{ code }}</strong>.</p>
                        <p>It expires in {{ expires_minutes }} minutes.</p>
                        <p>If you did not request this, you can ignore this email.</p>
                    """,
                    "locale": "en",
                    "version": 1,
                    "is_active": True,
                },
            )

            EmailTemplate.objects.update_or_create(
                name="welcome_tenant",
                defaults={
                    "subject": "Welcome to your POS workspace",
                    "html_body": """
                        <div style="font-family: Arial, sans-serif; color: #111; padding: 16px;">
                          <h2 style="color: #111;">Welcome to your POS workspace</h2>
                          <p>Your tenant <strong>{{ tenant_name }}</strong> has been created and a trial is active.</p>
                          <p>Next steps:</p>
                          <ol>
                            <li>Sign in with your email and password.</li>
                            <li>Complete onboarding: stores, taxes, catalog, and registers.</li>
                          </ol>
                          <p>
                            <a href="/login" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Go to Login</a>
                          </p>
                          <p style="color:#555;">Need help? Reply to this email and we’ll assist.</p>
                        </div>
                    """,
                    "locale": "en",
                    "version": 2,
                    "is_active": True,
                },
            )

        post_migrate.connect(seed_templates, sender=self)
