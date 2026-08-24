import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptPreview, type ReceiptPreviewProps } from "./ReceiptPreview";

const props: ReceiptPreviewProps = {
  format: "retail",
  companyName: "Kima",
  companyAddress: "Cotonou",
  companyPhone: "+229 00 00 00 00",
  companyEmail: "contact@kima.bj",
  companyWebsite: "kima.bj",
  currency: "XOF",
  decimalSeparator: ",",
  thousandSeparator: " ",
  decimalPlaces: 0,
  symbolPosition: "after",
  taxRate: 0,
};

describe("ReceiptPreview", () => {
  it("renders only the thermal receipt for retail", () => {
    const html = renderToStaticMarkup(React.createElement(ReceiptPreview, props));
    expect(html).toContain('data-testid="retail-receipt-preview"');
    expect(html).not.toContain('data-testid="invoice-preview"');
  });

  it("renders only the A4 invoice for invoice", () => {
    const html = renderToStaticMarkup(React.createElement(ReceiptPreview, {
      ...props,
      format: "invoice",
    }));
    expect(html).toContain('data-testid="invoice-preview"');
    expect(html).not.toContain('data-testid="retail-receipt-preview"');
  });

  it("omits empty optional company details", () => {
    const html = renderToStaticMarkup(React.createElement(ReceiptPreview, {
      ...props,
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
    }));

    expect(html).not.toContain("undefined");
    expect(html).not.toContain("contact@kima.bj");
  });
});
