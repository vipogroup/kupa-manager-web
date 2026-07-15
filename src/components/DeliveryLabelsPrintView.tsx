"use client";

import { formatMoney } from "@/lib/store";
import {
  LABEL_COLUMNS,
  LABEL_ROWS,
  LABELS_PER_PAGE,
  padPageSlots,
  type DeliveryLabelContent,
} from "@/lib/delivery-labels";
import { formatScheduledDateDisplay } from "@/lib/deliveries";

export function DeliveryLabelsPrintView({
  pages,
  visible,
}: {
  pages: DeliveryLabelContent[][];
  /** When true, show on-screen preview; always available for @media print. */
  visible: boolean;
}) {
  if (pages.length === 0) return null;

  return (
    <div
      id="delivery-labels-print-root"
      data-testid="lbl-print-root"
      className={visible ? "delivery-labels-preview" : "delivery-labels-print-hidden"}
      dir="rtl"
      aria-hidden={!visible}
    >
      {pages.map((page, pageIndex) => (
        <section
          key={`page-${pageIndex}`}
          data-testid="lbl-page"
          data-page={pageIndex + 1}
          className="delivery-labels-page"
        >
          {padPageSlots(page, LABELS_PER_PAGE).map((label, slotIndex) => (
            <article
              key={`slot-${pageIndex}-${slotIndex}`}
              data-testid={label ? "lbl-cell" : "lbl-cell-empty"}
              className={`delivery-label-cell ${label ? "" : "delivery-label-cell--empty"}`}
            >
              {label ? <LabelBody label={label} /> : null}
            </article>
          ))}
        </section>
      ))}
      <p className="delivery-labels-meta" data-testid="lbl-meta">
        {LABEL_COLUMNS}×{LABEL_ROWS} · {LABELS_PER_PAGE} מדבקות לעמוד · {pages.length} עמודים
      </p>
    </div>
  );
}

function LabelBody({ label }: { label: DeliveryLabelContent }) {
  const phones = [label.phone, label.secondaryPhone].filter(Boolean).join(" · ");
  return (
    <div className="delivery-label-body" data-testid="lbl-body">
      {label.isContinuation ? (
        <p className="delivery-label-cont" data-testid="lbl-continuation">
          המשך {label.partIndex}/{label.partTotal}
        </p>
      ) : null}
      <div className="delivery-label-row delivery-label-nums" dir="ltr">
        <span data-testid="lbl-delivery-number">{label.deliveryNumber}</span>
        <span data-testid="lbl-order-number">{label.orderNumber}</span>
      </div>
      <p className="delivery-label-name" data-testid="lbl-customer">
        {label.customerName}
      </p>
      {phones ? (
        <p className="delivery-label-phone" data-testid="lbl-phone" dir="ltr">
          {phones}
        </p>
      ) : null}
      {label.address ? (
        <p className="delivery-label-address" data-testid="lbl-address">
          {label.address}
        </p>
      ) : null}
      {label.areaLabel ? (
        <p className="delivery-label-area" data-testid="lbl-area">
          אזור: {label.areaLabel}
          {label.scheduledDate ? ` · ${formatScheduledDateDisplay(label.scheduledDate)}` : ""}
        </p>
      ) : null}
      <ul className="delivery-label-products" data-testid="lbl-products">
        {label.productLines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="delivery-label-total" data-testid="lbl-total">
        <span>{label.paymentLabel}</span>
        {!label.isContinuation ? <strong>{formatMoney(label.totalAmount)}</strong> : null}
      </p>
    </div>
  );
}
