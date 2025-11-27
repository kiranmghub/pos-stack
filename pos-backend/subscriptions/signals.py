from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from .models import Subscription, SubscriptionAudit


@receiver(pre_save, sender=Subscription)
def _subscription_snapshot(sender, instance: Subscription, **kwargs):
    if not instance.pk:
        return
    try:
        prev = Subscription.objects.get(pk=instance.pk)
        instance._prev_snapshot = {
            "status": prev.status,
            "amount": prev.amount,
            "is_auto_renew": prev.is_auto_renew,
        }
    except Subscription.DoesNotExist:
        instance._prev_snapshot = None


@receiver(post_save, sender=Subscription)
def _subscription_audit(sender, instance: Subscription, created: bool, **kwargs):
    # creation
    if created:
        SubscriptionAudit.objects.create(
            tenant=instance.tenant,
            subscription=instance,
            action="created",
            metadata={
                "plan": instance.plan.code,
                "amount": str(instance.amount),
                "currency": instance.currency,
                "status": instance.status,
                "price_version": instance.price_version,
                "coupon_id": instance.coupon_id,
            },
        )
        return

    snap = getattr(instance, "_prev_snapshot", None)
    if not snap:
        return

    # status change
    if snap.get("status") != instance.status:
        SubscriptionAudit.objects.create(
            tenant=instance.tenant,
            subscription=instance,
            action="status_changed",
            metadata={"from": snap.get("status"), "to": instance.status},
        )

    # amount change
    if snap.get("amount") != instance.amount:
        SubscriptionAudit.objects.create(
            tenant=instance.tenant,
            subscription=instance,
            action="amount_changed",
            metadata={"from": str(snap.get("amount")), "to": str(instance.amount)},
        )

    # auto renew change
    if snap.get("is_auto_renew") != instance.is_auto_renew:
        SubscriptionAudit.objects.create(
            tenant=instance.tenant,
            subscription=instance,
            action="auto_renew_changed",
            metadata={"from": snap.get("is_auto_renew"), "to": instance.is_auto_renew},
        )
