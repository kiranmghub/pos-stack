from django.db import models

# Create your models here.
from django.db import models
from common.models import TimeStampedModel


# class Payment(TimeStampedModel):
#     sale = models.ForeignKey("orders.Sale", related_name="payments", on_delete=models.CASCADE)
#     method = models.CharField(max_length=24) # cash, card, etc.
#     amount = models.DecimalField(max_digits=12, decimal_places=2)
#     psp_token = models.CharField(max_length=128, blank=True) # tokenized reference
#     approval_code = models.CharField(max_length=32, blank=True)
#
#     def __str__(self):
#         return f"{self.method} ${self.amount} (sale #{self.sale_id})"


class Payment(models.Model):
    METHOD_CHOICES = [
        ("CASH", "Cash"),
        ("CARD", "Card"),
    ]

    sale = models.ForeignKey("orders.Sale", related_name="payments", on_delete=models.CASCADE)
    method = models.CharField(max_length=24, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    psp_token = models.CharField(max_length=128, blank=True)  # tokenized reference
    approval_code = models.CharField(max_length=32, blank=True)

    # --- New (all optional, for CARD) ---
    card_brand = models.CharField(max_length=20, blank=True, null=True)
    card_last4 = models.CharField(max_length=4, blank=True, null=True)
    card_auth_code = models.CharField(max_length=32, blank=True, null=True)
    card_reference = models.CharField(max_length=64, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.method} ${self.amount} (sale #{self.sale_id})"