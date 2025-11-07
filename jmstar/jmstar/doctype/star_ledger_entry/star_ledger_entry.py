from __future__ import annotations

from typing import Dict

import frappe  # type: ignore
from frappe import _  # type: ignore
from frappe.model.document import Document  # type: ignore
from frappe.utils import now_datetime  # type: ignore


STAR_TYPE_EARN = "Earn"
STAR_TYPE_REDEEM = "Redeem"
STAR_TYPE_ADJUST = "Adjust"


class StarLedgerEntry(Document):
    """Atomic transaction representing star earn, redeem, or adjustment."""

    _child_snapshot: Dict[str, int] | None = None

    def validate(self) -> None:
        self._ensure_required_links()
        self._cache_child_snapshot()
        self._normalize_star_value()
        self._ensure_sufficient_balance()
        self._populate_defaults()

    def before_save(self) -> None:
        if not self.is_new():
            frappe.throw(_("Star Ledger Entry cannot be modified once created."))

    def after_insert(self) -> None:
        self._apply_child_balance_update()

    # ---------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------

    def _ensure_required_links(self) -> None:
        if not self.child:
            frappe.throw(_("Child is required."))

        child_info = frappe.db.get_value(
            "Child", self.child, ["guardian", "available_stars", "total_stars"], as_dict=True
        )
        if not child_info:
            frappe.throw(_("Child {0} does not exist.").format(frappe.bold(self.child)))

        if not self.guardian:
            self.guardian = child_info.guardian

        if child_info.guardian != self.guardian:
            frappe.throw(_("Guardian mismatch for child {0}.").format(frappe.bold(self.child)))

    def _cache_child_snapshot(self) -> None:
        if self._child_snapshot is None:
            snapshot = frappe.db.get_value(
                "Child", self.child, ["available_stars", "total_stars"], as_dict=True
            )
            self._child_snapshot = {
                "available_stars": snapshot.available_stars or 0,
                "total_stars": snapshot.total_stars or 0,
            }

    def _normalize_star_value(self) -> None:
        if not self.transaction_type:
            frappe.throw(_("Transaction type is required."))

        if not self.stars:
            frappe.throw(_("Stars must be a non-zero value."))

        normalized_value = int(self.stars)
        if self.transaction_type == STAR_TYPE_EARN:
            normalized_value = abs(normalized_value)
        elif self.transaction_type == STAR_TYPE_REDEEM:
            normalized_value = -abs(normalized_value)
        elif self.transaction_type == STAR_TYPE_ADJUST:
            normalized_value = int(self.stars)
        else:
            frappe.throw(_("Unsupported transaction type: {0}").format(self.transaction_type))

        self.stars = normalized_value

    def _ensure_sufficient_balance(self) -> None:
        available_before = self._child_snapshot["available_stars"]
        new_balance = available_before + self.stars

        if self.transaction_type != STAR_TYPE_ADJUST and new_balance < 0:
            frappe.throw(_("Cannot redeem more stars than available."))

        self.balance_after = new_balance

    def _populate_defaults(self) -> None:
        if not self.posting_datetime:
            self.posting_datetime = now_datetime()

        if self.transaction_type == STAR_TYPE_REDEEM and not self.redemption_use:
            self.redemption_use = _("Redeemed via LIFF")

    def _apply_child_balance_update(self) -> None:
        child_updates: Dict[str, int] = {"available_stars": self.balance_after}

        if self.transaction_type == STAR_TYPE_EARN and self.stars > 0:
            child_updates["total_stars"] = self._child_snapshot["total_stars"] + self.stars

        frappe.db.set_value("Child", self.child, child_updates, update_modified=False)

    # ------------------------------------------------------------------
    # Utility methods for external consumers
    # ------------------------------------------------------------------

    @staticmethod
    def create_entry(**kwargs) -> "StarLedgerEntry":
        entry = frappe.get_doc({
            "doctype": "Star Ledger Entry",
            **kwargs,
        })
        entry.insert(ignore_permissions=True)
        frappe.db.commit()
        return entry

