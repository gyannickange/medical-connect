import React from "react";
import { formatCurrencyValue } from "@/lib/formatNumber";

export interface ReceiptPreviewProps {
  format: "retail" | "invoice";
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  currency: string;
  decimalSeparator: "." | ",";
  thousandSeparator: "," | "." | " " | "none";
  decimalPlaces: number;
  symbolPosition: "before" | "after";
  taxRate: number;
}

interface SampleSaleLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

const sampleSaleLines: SampleSaleLine[] = [
  { description: "Handwoven market basket", quantity: 2, unitPrice: 3500 },
  { description: "Linen table runner", quantity: 1, unitPrice: 6500 },
  { description: "Ceramic serving bowl", quantity: 1, unitPrice: 4500 },
];

const sampleSubtotal = sampleSaleLines.reduce(
  (total, line) => total + line.quantity * line.unitPrice,
  0,
);

function optionalCompanyLine(value: string | undefined, label?: string) {
  if (!value?.trim()) return null;
  return label ? (
    <p>
      {label}: {value}
    </p>
  ) : (
    <p>{value}</p>
  );
}

function CompanyDetails({
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyWebsite,
}: Pick<
  ReceiptPreviewProps,
  | "companyName"
  | "companyAddress"
  | "companyPhone"
  | "companyEmail"
  | "companyWebsite"
>) {
  return (
    <address className="not-italic text-sm leading-relaxed text-slate-600">
      {optionalCompanyLine(companyName)}
      {optionalCompanyLine(companyAddress)}
      {optionalCompanyLine(companyPhone, "Phone")}
      {optionalCompanyLine(companyEmail, "Email")}
      {optionalCompanyLine(companyWebsite, "Web")}
    </address>
  );
}

function ReceiptTotals({
  subtotal,
  tax,
  total,
  taxRate,
  money,
  compact = false,
}: {
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  money: (value: number) => string;
  compact?: boolean;
}) {
  return (
    <dl className={compact ? "space-y-2 text-sm" : "space-y-3 text-sm"}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-slate-500">Subtotal</dt>
        <dd className="font-mono tabular-nums text-slate-800">{money(subtotal)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-slate-500">Tax ({taxRate}%)</dt>
        <dd className="font-mono tabular-nums text-slate-800">{money(tax)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
        <dt className="font-semibold uppercase tracking-[0.12em] text-slate-900">Total</dt>
        <dd className="font-mono text-base font-semibold tabular-nums text-slate-950">
          {money(total)}
        </dd>
      </div>
    </dl>
  );
}

export function ReceiptPreview({
  format,
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyWebsite,
  currency,
  decimalSeparator,
  thousandSeparator,
  decimalPlaces,
  symbolPosition,
  taxRate,
}: ReceiptPreviewProps) {
  const money = (value: number) =>
    formatCurrencyValue(value, currency, {
      decimalSeparator,
      thousandSeparator,
      decimalPlaces,
      symbolPosition,
    });
  const tax = sampleSubtotal * (taxRate / 100);
  const total = sampleSubtotal + tax;

  if (format === "retail") {
    return (
      <div className="overflow-x-auto rounded-xl bg-background-secondary p-4 sm:p-6">
        <article
          aria-label="Retail receipt preview"
          className="mx-auto w-[20rem] min-w-[20rem] bg-white px-5 py-6 text-slate-900 shadow-xl"
          data-testid="retail-receipt-preview"
        >
          <header className="border-b border-dashed border-slate-300 pb-5 text-center">
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Sample receipt
            </p>
            <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-slate-950">
              {companyName}
            </h1>
            <CompanyDetails
              companyName=""
              companyAddress={companyAddress}
              companyPhone={companyPhone}
              companyEmail={companyEmail}
              companyWebsite={companyWebsite}
            />
          </header>

          <section className="py-5" aria-labelledby="retail-sale-lines">
            <h2 id="retail-sale-lines" className="sr-only">
              Sample sale lines
            </h2>
            <ul className="space-y-4">
              {sampleSaleLines.map((line) => (
                <li key={line.description} className="flex items-start justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{line.description}</p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
                      {line.quantity} x {money(line.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums text-slate-800">
                    {money(line.quantity * line.unitPrice)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-t border-dashed border-slate-300 pt-5" aria-label="Receipt totals">
            <ReceiptTotals
              subtotal={sampleSubtotal}
              tax={tax}
              total={total}
              taxRate={taxRate}
              money={money}
              compact
            />
          </section>

          <footer className="mt-6 border-t border-dashed border-slate-300 pt-4 text-center text-xs text-slate-500">
            Thank you for shopping with us.
          </footer>
        </article>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-background-secondary p-4 sm:p-6">
      <article
        aria-label="Invoice preview"
        className="mx-auto w-full max-w-[210mm] bg-white p-4 text-slate-900 shadow-xl sm:min-w-[42rem] sm:p-10"
        data-testid="invoice-preview"
      >
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10 sm:pb-8">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green-700">
              Invoice
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-950">
              {companyName}
            </h1>
            <CompanyDetails
              companyName=""
              companyAddress={companyAddress}
              companyPhone={companyPhone}
              companyEmail={companyEmail}
              companyWebsite={companyWebsite}
            />
          </div>
          <div className="text-left text-sm text-slate-600 sm:text-right">
            <p className="font-mono font-semibold text-slate-950">SF-2026-001</p>
            <p className="mt-1">Sample sale</p>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="invoice-sale-lines">
          <h2 id="invoice-sale-lines" className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Items
          </h2>
          <table className="w-full table-fixed border-collapse text-left text-[0.7rem] sm:table-auto sm:text-sm">
            <caption className="sr-only">Sample sale invoice line items</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500">
                <th className="w-[46%] pb-3 pr-2 font-semibold sm:w-auto sm:pr-4" scope="col">Item</th>
                <th className="w-[14%] px-1 pb-3 text-right font-semibold sm:w-auto sm:px-4" scope="col">Qty</th>
                <th className="hidden px-4 pb-3 text-right font-semibold sm:table-cell" scope="col">Unit price</th>
                <th className="w-[40%] pb-3 pl-1 text-right font-semibold sm:w-auto sm:pl-4" scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sampleSaleLines.map((line) => (
                <tr key={line.description} className="border-b border-slate-100">
                  <th className="py-4 pr-2 font-medium text-slate-900 sm:pr-4" scope="row">
                    {line.description}
                    <span className="mt-1 block font-mono text-[0.65rem] font-normal tabular-nums text-slate-500 sm:hidden">
                      {line.quantity} x {money(line.unitPrice)}
                    </span>
                  </th>
                  <td className="px-1 py-4 text-right font-mono tabular-nums text-slate-600 sm:px-4">
                    {line.quantity}
                  </td>
                  <td className="hidden px-4 py-4 text-right font-mono tabular-nums text-slate-600 sm:table-cell">
                    {money(line.unitPrice)}
                  </td>
                  <td className="py-4 pl-1 text-right font-mono tabular-nums text-slate-900 sm:pl-4">
                    {money(line.quantity * line.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-auto mt-8 max-w-sm border-t border-slate-200 pt-5" aria-label="Invoice totals">
          <ReceiptTotals
            subtotal={sampleSubtotal}
            tax={tax}
            total={total}
            taxRate={taxRate}
            money={money}
          />
        </section>

        <footer className="mt-12 border-t border-slate-200 pt-5 text-sm text-slate-500">
          Thank you for your business.
        </footer>
      </article>
    </div>
  );
}
