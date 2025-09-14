# Copilot Instructions for pos-backend

## Project Overview
This is a multi-app Django backend for a POS (Point of Sale) system. The codebase is organized by domain-driven Django apps (e.g., `catalog`, `orders`, `inventory`, `payments`, `stores`, `taxes`, `tenants`, etc.), each with its own models, views, serializers, migrations, and admin configuration. The main configuration and routing are in the `core` app.

## Architecture & Data Flow
- **Apps are loosely coupled:** Each app manages its own data and logic. Cross-app communication is typically via Django signals, shared models, or API endpoints.
- **Centralized settings:** `core/settings.py` configures global settings, middleware, and installed apps.
- **API Layer:** Most business logic is exposed via DRF (Django REST Framework) views and serializers, found in each app's `api.py`, `views.py`, and `serializers.py`.
- **Migrations:** Each app maintains its own migrations in the `migrations/` folder.

## Developer Workflows
- **Run server:** `python manage.py runserver`
- **Run tests:** `python manage.py test <appname>` or all apps with `python manage.py test`
- **Apply migrations:** `python manage.py makemigrations <appname>` then `python manage.py migrate`
- **Create superuser:** `python manage.py createsuperuser`
- **Custom management commands:** Found in `devtools/management/commands/`

## Project-Specific Conventions
- **API endpoints:** Prefer DRF views/serializers. Some apps use `api.py` for custom endpoints.
- **Admin customizations:** See `admin.py` in each app; mixins in `common/admin_mixins.py`.
- **Authentication:** Custom logic in `common/auth_views.py` and `common/auth_tokens.py`.
- **Roles & permissions:** Managed in `common/roles.py`.
- **Shared utilities:** Use the `common/` app for mixins, middleware, and shared logic.
- **Signals:** Some apps (e.g., `orders/signals.py`) use Django signals for cross-app events.

## Integration Points
- **External dependencies:** See `requirements.txt` for Django, DRF, and other packages.
- **Database:** Default is SQLite (`db.sqlite3`), but settings allow for other backends.
- **Tenancy:** Multi-tenant logic in `tenants/`.

## Examples
- To add a new model, create it in the relevant app's `models.py`, register in `admin.py`, and add migrations.
- To expose a new API, add a serializer and view in the app, then update `urls.py`.
- For shared logic, add to `common/` and import as needed.

## Key Files & Directories
- `core/settings.py`, `core/urls.py`: Global config and routing
- `requirements.txt`: Dependency management
- `common/`: Shared logic, authentication, roles
- `<app>/models.py`, `<app>/views.py`, `<app>/serializers.py`, `<app>/admin.py`: App-specific logic
- `devtools/management/commands/`: Custom CLI commands

---
For questions or unclear patterns, ask for clarification or examples from maintainers.