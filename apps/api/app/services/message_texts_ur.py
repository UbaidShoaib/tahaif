"""Urdu versions of the hand-sent WhatsApp messages (ADR 0009).

Kept apart from the English so a native speaker can review the wording in one
place. Product names, the order number, amounts and links stay as they are.
Dates are numeric (17-10-2026) so no English month names appear in Urdu text.
"""

from app.models.order import Order, PaymentMethod

ORDER_SUMMARY_UR = "السلام علیکم! {brand} سے آرڈر کرنے کا شکریہ۔"


def buyer_text_ur(
    order: Order, kind: str, *, brand: str, link: str, ref: str, recipient: str, total: str, paid: bool
) -> str:
    if kind == "order_summary":
        lines = [ORDER_SUMMARY_UR.format(brand=brand), "", f"آرڈر نمبر #{ref}"]
        lines += [
            f"• {i.qty} × {i.product.name}" + (f" ({i.variant.name})" if i.variant else "") for i in order.items
        ]
        if order.fulfillments:
            f = order.fulfillments[0]
            lines.append(f"{f.recipient_name} کے لیے، {f.delivery_date:%d-%m-%Y}")
        lines += [f"کل رقم: {total}", "", f"براہِ کرم تفصیلات چیک کر کے یہاں تصدیق کریں: {link}"]
        if order.payments and order.payments[0].method == PaymentMethod.bank_transfer:
            lines.append("ہماری بینک کی تفصیلات اسی صفحے پر ہیں، رقم کی رسید بھی وہیں اپ لوڈ کریں۔")
        return "\n".join(lines)
    if kind == "payment_reminder":
        waiting = "تصدیق" if paid else "تصدیق اور ادائیگی"
        return f"یاد دہانی: {recipient} کے لیے آپ کا {brand} آرڈر #{ref} آپ کی {waiting} کا منتظر ہے: {link}"
    if kind == "payment_received":
        return f"آرڈر #{ref} کی ادائیگی موصول ہو گئی، شکریہ! ہم {recipient} کا تحفہ تیار کر رہے ہیں۔ ٹریک کریں: {link}"
    if kind == "dispatched":
        return f"{recipient} کے لیے آپ کا تحفہ (آرڈر #{ref}) دکان سے روانہ ہو گیا ہے۔ ٹریک کریں: {link}"
    if kind == "out_for_delivery":
        return f"{recipient} کے لیے آپ کا تحفہ ڈیلیوری کے لیے نکل چکا ہے 🚚 لائیو ٹریک کریں: {link}"
    return f"ڈیلیور ہو گیا! 🎁 {recipient} کو آپ کا تحفہ مل گیا ہے (آرڈر #{ref})۔ ڈیلیوری کی تصویر دیکھیں: {link}"


def recipient_text_ur(
    kind: str,
    *,
    surprise: bool,
    recipient_name: str,
    gift_from: str | None,
    has_note: bool,
    thanks_url: str | None,
    brand: str,
) -> str:
    """Warm, like the English: who it's from; never prices, order number or tracking."""
    name = recipient_name.strip()
    greeting = f"السلام علیکم {name}! " if name else "السلام علیکم! "
    sender = (gift_from or "").strip() or "آپ کے کسی چاہنے والے"
    note = " کارڈ پر موجود QR کوڈ اسکین کر کے ان کا پیغام سنیں۔" if has_note else ""
    thanks = f" انہیں شکریہ کا پیغام بھیجیں: {thanks_url}" if thanks_url else ""
    if kind == "recipient_on_the_way":
        return (
            f"{greeting}{sender} کی طرف سے ایک تحفہ آج {brand} کے ذریعے آپ کے پاس آ رہا ہے۔ "
            "براہِ کرم اپنا فون قریب رکھیں تاکہ رائیڈر کو راستہ بتا سکیں۔"
        )
    if surprise:
        return (
            f"{greeting}سرپرائز! ابھی جو تحفہ آپ کو ملا ہے وہ {sender} کی طرف سے ہے، "
            f"جو {brand} کے ذریعے محبت کے ساتھ بھیجا گیا ہے۔{note}{thanks}"
        )
    return f"{greeting}امید ہے آپ کو {sender} کی طرف سے بھیجا گیا تحفہ پسند آیا ہوگا!{note}{thanks}"
