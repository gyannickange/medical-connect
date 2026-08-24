import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { Sale, SaleItem, Product, Customer, User } from "@shared/schema";
import { formatCurrencyValue } from "../lib/formatNumber";
import { t } from "../lib/i18n";

interface InvoiceData {
  sale: Sale;
  companyInfo: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  customer?: Customer;
  staff?: User;
  items: Array<SaleItem & { product: Product }>;
  formatOptions?: {
    currency: string;
    decimalSeparator: "." | ",";
    thousandSeparator: "," | "." | " " | "none";
    decimalPlaces: number;
    symbolPosition: "before" | "after";
  };
}

export const printInvoice = async (data: InvoiceData): Promise<void> => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("Failed to open print window");
    return;
  }

  // Create a document in the new window
  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice</title>
        <style>
          @media print {
            @page {
              size: A4;
              margin: 20mm;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
        </style>
      </head>
      <body></body>
    </html>
  `);
  printWindow.document.close();

  // Build invoice content in the new window
  await buildInvoiceContent(printWindow.document.body, data);

  // Trigger print dialog
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    // Close the window after printing (optional)
    // printWindow.close();
  }, 250);
};

export const generateInvoicePDF = async (data: InvoiceData): Promise<void> => {
  const tempDiv = document.createElement("div");

  try {
    // Setup temporary div to render the invoice
    tempDiv.style.position = "absolute";
    tempDiv.style.left = "-9999px";
    tempDiv.style.top = "0";
    tempDiv.style.width = "210mm"; // A4 width
    tempDiv.style.backgroundColor = "white";
    tempDiv.style.fontFamily = "Arial, sans-serif";
    tempDiv.style.fontSize = "14px";
    tempDiv.style.lineHeight = "1.4";

    // Build invoice content safely using DOM methods (no innerHTML to prevent XSS)
    await buildInvoiceContent(tempDiv, data);

    // Add to DOM temporarily
    document.body.appendChild(tempDiv);

    // Convert to canvas with dynamic height
    const canvas = await html2canvas(tempDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: false, // Prevent canvas tainting
      backgroundColor: "#ffffff",
      width: 794, // A4 width at 96 DPI
      // Remove fixed height to capture full content
    });

    // PDF generation complete

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;

    // Add first page
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed (fix pagination to avoid extra blank page)
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Download the PDF with safe filename
    const safeSaleNumber = data.sale.saleNumber.replace(/[^a-zA-Z0-9-]/g, "_");
    const fileName = `Invoice_${safeSaleNumber}_${
      new Date().toISOString().split("T")[0]
    }.pdf`;
    pdf.save(fileName);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF invoice");
  } finally {
    // Ensure DOM cleanup even if generation fails
    if (tempDiv.parentNode) {
      document.body.removeChild(tempDiv);
    }
  }
};

// Safe DOM building function to prevent XSS
const buildInvoiceContent = async (
  container: HTMLElement,
  data: InvoiceData
): Promise<void> => {
  const { sale, companyInfo, customer, staff, items, formatOptions } = data;

  // Helper function to format currency
  const formatCurrency = (value: number | string): string => {
    if (!formatOptions) return `€${parseFloat(value.toString()).toFixed(2)}`;
    return formatCurrencyValue(value, formatOptions.currency, {
      decimalSeparator: formatOptions.decimalSeparator,
      thousandSeparator: formatOptions.thousandSeparator,
      decimalPlaces: formatOptions.decimalPlaces,
      symbolPosition: formatOptions.symbolPosition,
    });
  };

  // Helper function to translate attribute names
  const translateAttributeName = (name: string): string => {
    const translationMap: Record<string, string> = {
      Size: t("variantTypeSize"),
      Color: t("variantTypeColor"),
      Material: t("variantTypeMaterial"),
      Style: t("variantTypeStyle"),
      Weight: t("variantTypeWeight"),
      Other: t("variantTypeOther"),
    };
    return translationMap[name] || name;
  };

  // Helper function to safely create text content
  const safeText = (text: string): Text => document.createTextNode(text);
  const createElement = (
    tag: string,
    styles?: Record<string, string>,
    classes?: string
  ): HTMLElement => {
    const el = document.createElement(tag);
    if (styles) {
      Object.assign(el.style, styles);
    }
    if (classes) el.className = classes;
    return el;
  };

  // Helper function to create QR code image
  const createQRCode = async (
    value: string,
    size: number = 80
  ): Promise<HTMLImageElement> => {
    const qrDataUrl = await QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
    const qrImg = document.createElement("img");
    qrImg.src = qrDataUrl;
    qrImg.alt = "QR Code";
    qrImg.style.width = `${size}px`;
    qrImg.style.height = `${size}px`;
    return qrImg;
  };

  // Main container
  const mainDiv = createElement("div", {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "40px",
    background: "white",
    color: "black",
    fontFamily: "Arial, sans-serif",
  });

  // Header section
  const headerDiv = createElement("div", {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "40px",
  });

  // Company info
  const companyDiv = createElement("div");
  const companyTitle = createElement("h1", {
    margin: "0 0 10px 0",
    fontSize: "32px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  companyTitle.appendChild(safeText(companyInfo.name));
  companyDiv.appendChild(companyTitle);

  if (companyInfo.address) {
    const addressP = createElement("p", { margin: "5px 0", color: "#666" });
    addressP.appendChild(safeText(companyInfo.address));
    companyDiv.appendChild(addressP);
  }

  const contactDiv = createElement("div", {
    marginTop: "10px",
    fontSize: "14px",
    color: "#666",
  });
  if (companyInfo.phone) {
    const phoneDiv = createElement("div");
    phoneDiv.appendChild(safeText(`${t("phone")}: ${companyInfo.phone}`));
    contactDiv.appendChild(phoneDiv);
  }
  if (companyInfo.email) {
    const emailDiv = createElement("div");
    emailDiv.appendChild(safeText(`${t("email")}: ${companyInfo.email}`));
    contactDiv.appendChild(emailDiv);
  }
  companyDiv.appendChild(contactDiv);

  // Invoice info
  const invoiceDiv = createElement("div", { textAlign: "right" });
  const invoiceTitle = createElement("h2", {
    margin: "0 0 10px 0",
    fontSize: "28px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  invoiceTitle.appendChild(safeText(t("invoiceTitle")));
  invoiceDiv.appendChild(invoiceTitle);

  const invoiceDetails = createElement("div", {
    fontSize: "14px",
    color: "#666",
  });
  const saleNumDiv = createElement("div");
  saleNumDiv.appendChild(safeText(`${t("invoiceNumber")} ${sale.saleNumber}`));
  invoiceDetails.appendChild(saleNumDiv);

  const dateDiv = createElement("div");
  dateDiv.appendChild(
    safeText(`${t("date")}: ${new Date(sale.createdAt).toLocaleDateString()}`)
  );
  invoiceDetails.appendChild(dateDiv);

  const timeDiv = createElement("div");
  timeDiv.appendChild(
    safeText(`${t("time")}: ${new Date(sale.createdAt).toLocaleTimeString()}`)
  );
  invoiceDetails.appendChild(timeDiv);

  invoiceDiv.appendChild(invoiceDetails);
  headerDiv.appendChild(companyDiv);
  headerDiv.appendChild(invoiceDiv);

  // Customer section
  const customerSection = createElement("div", {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "40px",
    marginBottom: "40px",
  });

  const billToDiv = createElement("div");
  const billToTitle = createElement("h3", {
    margin: "0 0 15px 0",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  billToTitle.appendChild(safeText(t("billTo")));
  billToDiv.appendChild(billToTitle);

  if (customer) {
    const customerDetails = createElement("div", {
      fontSize: "14px",
      color: "#666",
      lineHeight: "1.5",
    });

    const nameDiv = createElement("div", {
      fontWeight: "bold",
      color: "#1a1a1a",
      marginBottom: "5px",
    });
    nameDiv.appendChild(safeText(`${customer.firstName} ${customer.lastName}`));
    customerDetails.appendChild(nameDiv);

    if (customer.phone) {
      const phoneDiv = createElement("div");
      phoneDiv.appendChild(safeText(`${t("phone")}: ${customer.phone}`));
      customerDetails.appendChild(phoneDiv);
    }
    if (customer.email) {
      const emailDiv = createElement("div");
      emailDiv.appendChild(safeText(`${t("email")}: ${customer.email}`));
      customerDetails.appendChild(emailDiv);
    }
    if (customer.address) {
      const addressDiv = createElement("div");
      addressDiv.appendChild(safeText(`${t("address")}: ${customer.address}`));
      customerDetails.appendChild(addressDiv);
    }
    billToDiv.appendChild(customerDetails);
  } else {
    const walkInDiv = createElement("div", {
      fontSize: "14px",
      color: "#999",
      fontStyle: "italic",
    });
    walkInDiv.appendChild(safeText(t("walkInCustomer")));
    billToDiv.appendChild(walkInDiv);
  }

  // Sale details
  const saleDetailsDiv = createElement("div");
  const saleDetailsTitle = createElement("h3", {
    margin: "0 0 15px 0",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  saleDetailsTitle.appendChild(safeText(t("saleDetails")));
  saleDetailsDiv.appendChild(saleDetailsTitle);

  const detailsContent = createElement("div", {
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.5",
  });

  const paymentDiv = createElement("div");
  paymentDiv.appendChild(
    safeText(`${t("paymentMethod")}: ${sale.paymentMethod.toUpperCase()}`)
  );
  detailsContent.appendChild(paymentDiv);

  const statusDiv = createElement("div");
  statusDiv.appendChild(
    safeText(`${t("status")}: ${sale.status.toUpperCase()}`)
  );
  detailsContent.appendChild(statusDiv);

  if (staff) {
    const staffDiv = createElement("div");
    staffDiv.appendChild(
      safeText(`${t("servedBy")} ${staff.firstName} ${staff.lastName}`)
    );
    detailsContent.appendChild(staffDiv);
  }

  saleDetailsDiv.appendChild(detailsContent);
  customerSection.appendChild(billToDiv);
  customerSection.appendChild(saleDetailsDiv);

  // Items table
  const table = createElement("table", {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "40px",
  });

  // Table header
  const thead = createElement("thead");
  const headerRow = createElement("tr", { borderBottom: "2px solid #333" });

  const headers = [t("item"), t("qty"), t("unitPrice"), t("total")];
  const alignments = ["left", "center", "right", "right"];

  headers.forEach((headerText, index) => {
    const th = createElement("th", {
      textAlign: alignments[index],
      padding: "15px 8px",
      fontWeight: "bold",
      color: "#1a1a1a",
    });
    th.appendChild(safeText(headerText));
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = createElement("tbody");
  items.forEach((item) => {
    const row = createElement("tr", { borderBottom: "1px solid #ddd" });

    // Item name/description cell
    const itemCell = createElement("td", { padding: "15px 8px" });
    const itemDiv = createElement("div");
    const nameDiv = createElement("div", {
      fontWeight: "bold",
      color: "#1a1a1a",
      marginBottom: "2px",
    });
    nameDiv.appendChild(safeText(item.product.name));
    itemDiv.appendChild(nameDiv);

    // Add variant attributes if available
    if ((item as any).variant && (item as any).variant.attributes) {
      const variantDiv = createElement("div", {
        fontSize: "11px",
        color: "#555",
        fontStyle: "italic",
        marginTop: "2px",
        marginBottom: "2px",
      });
      const variantText = (item as any).variant.attributes
        .map(
          (attr: any) => `${translateAttributeName(attr.name)}: ${attr.value}`
        )
        .join(", ");
      variantDiv.appendChild(safeText(`(${variantText})`));
      itemDiv.appendChild(variantDiv);
    }

    // Add price type badge if available
    // Show pricing rule info if available (from pricing relation)
    const pricingInfo = (item as any).pricing;
    if (pricingInfo) {
      const priceTypeDiv = createElement("div", {
        fontSize: "10px",
        color: "#555",
        fontWeight: "500",
        marginTop: "2px",
        marginBottom: "2px",
      });
      const priceTypeLabels: Record<string, string> = {
        retail: t("retail"),
        wholesale: t("wholesale"),
        bulk: t("bulk"),
        promotional: t("promotion"),
      };
      const priceTypeLabel =
        priceTypeLabels[pricingInfo.priceType] || pricingInfo.priceType;
      let badgeText = `[${priceTypeLabel}]`;
      // Add quantity range if applicable
      if (
        pricingInfo.minQuantity &&
        (pricingInfo.minQuantity > 1 || pricingInfo.maxQuantity)
      ) {
        const range = pricingInfo.maxQuantity
          ? `${pricingInfo.minQuantity}-${pricingInfo.maxQuantity}`
          : `${pricingInfo.minQuantity}+`;
        badgeText += ` (${range})`;
      }
      priceTypeDiv.appendChild(safeText(badgeText));
      itemDiv.appendChild(priceTypeDiv);
    } else if (
      (item as any).priceType &&
      (item as any).priceType !== "auto" &&
      (item as any).priceType !== "none"
    ) {
      // Fallback to priceType if pricing relation not available
      const priceTypeDiv = createElement("div", {
        fontSize: "10px",
        color: "#555",
        fontWeight: "500",
        marginTop: "2px",
        marginBottom: "2px",
      });
      const priceTypeLabels: Record<string, string> = {
        retail: t("retail"),
        wholesale: t("wholesale"),
        bulk: t("bulk"),
        promotional: t("promotion"),
      };
      const priceTypeLabel =
        priceTypeLabels[(item as any).priceType] || (item as any).priceType;
      priceTypeDiv.appendChild(safeText(`[${priceTypeLabel}]`));
      itemDiv.appendChild(priceTypeDiv);
    }

    if (item.product.description) {
      const descDiv = createElement("div", {
        fontSize: "12px",
        color: "#666",
      });
      descDiv.appendChild(safeText(item.product.description));
      itemDiv.appendChild(descDiv);
    }
    itemCell.appendChild(itemDiv);

    // Quantity cell
    const qtyCell = createElement("td", {
      padding: "15px 8px",
      textAlign: "center",
      color: "#333",
    });
    qtyCell.appendChild(safeText(item.quantity.toString()));

    // Unit price cell
    const priceCell = createElement("td", {
      padding: "15px 8px",
      textAlign: "right",
      color: "#333",
    });
    priceCell.appendChild(safeText(formatCurrency(item.unitPrice)));

    // Total cell
    const totalCell = createElement("td", {
      padding: "15px 8px",
      textAlign: "right",
      fontWeight: "bold",
      color: "#1a1a1a",
    });
    totalCell.appendChild(safeText(formatCurrency(item.totalPrice)));

    row.appendChild(itemCell);
    row.appendChild(qtyCell);
    row.appendChild(priceCell);
    row.appendChild(totalCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  // Totals section
  const totalsDiv = createElement("div", {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: "40px",
  });

  const totalsTable = createElement("div", { width: "320px" });

  // Subtotal
  const subtotalDiv = createElement("div", {
    borderBottom: "1px solid #ddd",
    padding: "10px 0",
    display: "flex",
    justifyContent: "space-between",
  });
  const subtotalLabel = createElement("span", { color: "#666" });
  subtotalLabel.appendChild(safeText(t("subtotal")));
  const subtotalValue = createElement("span", {
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  subtotalValue.appendChild(safeText(formatCurrency(sale.subtotal)));
  subtotalDiv.appendChild(subtotalLabel);
  subtotalDiv.appendChild(subtotalValue);
  totalsTable.appendChild(subtotalDiv);

  // Tax (if applicable)
  if (parseFloat(sale.tax) > 0) {
    const taxDiv = createElement("div", {
      borderBottom: "1px solid #ddd",
      padding: "10px 0",
      display: "flex",
      justifyContent: "space-between",
    });
    const taxLabel = createElement("span", { color: "#666" });
    taxLabel.appendChild(safeText(t("tax")));
    const taxValue = createElement("span", {
      fontWeight: "bold",
      color: "#1a1a1a",
    });
    taxValue.appendChild(safeText(formatCurrency(sale.tax)));
    taxDiv.appendChild(taxLabel);
    taxDiv.appendChild(taxValue);
    totalsTable.appendChild(taxDiv);
  }

  // Total
  const totalDiv = createElement("div", {
    borderTop: "2px solid #333",
    padding: "15px 0",
    display: "flex",
    justifyContent: "space-between",
  });
  const totalLabel = createElement("span", {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  totalLabel.appendChild(safeText(t("total")));
  const totalValue = createElement("span", {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1a1a1a",
  });
  totalValue.appendChild(safeText(formatCurrency(sale.total)));
  totalDiv.appendChild(totalLabel);
  totalDiv.appendChild(totalValue);
  totalsTable.appendChild(totalDiv);

  totalsDiv.appendChild(totalsTable);

  // Footer
  const footerDiv = createElement("div", {
    borderTop: "1px solid #ddd",
    paddingTop: "30px",
    textAlign: "center",
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.6",
  });

  const thankYouDiv = createElement("div", {
    marginBottom: "5px",
    fontWeight: "bold",
  });
  thankYouDiv.appendChild(safeText(t("thankYouBusiness")));
  footerDiv.appendChild(thankYouDiv);

  const keepDiv = createElement("div", { marginBottom: "5px" });
  keepDiv.appendChild(safeText(t("keepInvoice")));
  footerDiv.appendChild(keepDiv);

  if (companyInfo.email) {
    const contactDiv = createElement("div");
    contactDiv.appendChild(
      safeText(`${t("questionsInvoice")} ${companyInfo.email}`)
    );
    footerDiv.appendChild(contactDiv);
  }

  // Add QR Code to footer
  if (sale.qrCode) {
    const qrContainer = createElement("div", {
      display: "flex",
      justifyContent: "center",
      marginTop: "20px",
      marginBottom: "10px",
    });

    const qrCode = await createQRCode(sale.qrCode, 100);
    qrContainer.appendChild(qrCode);
    footerDiv.appendChild(qrContainer);
  }

  // Assemble the invoice
  mainDiv.appendChild(headerDiv);
  mainDiv.appendChild(customerSection);
  mainDiv.appendChild(table);
  mainDiv.appendChild(totalsDiv);
  mainDiv.appendChild(footerDiv);

  container.appendChild(mainDiv);
};
