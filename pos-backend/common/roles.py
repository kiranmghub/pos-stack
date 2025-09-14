from django.db import models

class TenantRole(models.TextChoices):
    OWNER      = "owner",      "Owner"
    ADMIN      = "admin",      "Admin"
    MANAGER    = "manager",    "Manager"
    CASHIER    = "cashier",    "Cashier"
    ACCOUNTANT = "accountant", "Accountant"
    AUDITOR    = "auditor",    "Auditor"
