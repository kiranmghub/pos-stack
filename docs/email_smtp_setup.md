# Email SMTP Setup

The backend defaults to logging emails to the console. To send real emails, configure SMTP via environment variables and optionally send a test message.

## 1) Set SMTP environment variables

Add to your `.env` (values from your provider):

```
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.yourprovider.com
EMAIL_PORT=587
EMAIL_HOST_USER=you@domain.com
EMAIL_HOST_PASSWORD=your_smtp_password
EMAIL_USE_TLS=True
#EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=you@domain.com
```

Restart the backend after updating env vars.

## 2) Seed or edit email templates

Visit `/admin/emails/emailtemplate/` to add or edit templates (e.g., `signup_otp`, `welcome_tenant`).

## 3) Send a test email

Use the management command (from `pos-backend/`):

```bash
python manage.py send_test_email --to you@domain.com --template signup_otp --context code=123456 expires_minutes=10
```

Logs are stored in `/admin/emails/emaillog/`.

## 4) Common pitfalls

- Ensure your SMTP provider allows the from-address (`DEFAULT_FROM_EMAIL`).
- Use TLS (port 587) or SSL (port 465) to match provider requirements.
- For local testing, if SMTP is unreachable, the console backend remains a fallback when `EMAIL_BACKEND` is not set to SMTP.
