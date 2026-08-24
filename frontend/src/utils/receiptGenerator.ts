import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { Sale, SaleItem, Product, Customer, User } from "@shared/schema";
import { formatCurrencyValue } from "../lib/formatNumber";
import { t } from "../lib/i18n";

interface ReceiptData {
  sale: Sale;
  companyInfo: {
    name: string;
    phone?: string;
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

function receiptFileName(data: ReceiptData): string {
  const saleNumber = data.sale.saleNumber || data.sale.id || "UNKNOWN";
  const safeSaleNumber = String(saleNumber).replace(/[^a-zA-Z0-9-]/g, "_");
  return `Receipt_${safeSaleNumber}_${new Date().toISOString().split("T")[0]}.pdf`;
}

// Renders the receipt into an isolated, hidden iframe and returns the built
// jsPDF instance - shared by both the print and download-PDF paths so the
// actual receipt layout/rendering only exists in one place.
async function buildReceiptPdf(data: ReceiptData): Promise<jsPDF> {
  const iframe = document.createElement("iframe");

  try {
    // Setup iframe to be hidden and isolated
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "80mm";
    iframe.style.height = "1000mm"; // Large initial height
    iframe.style.border = "none";

    // Add iframe to DOM
    document.body.appendChild(iframe);

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.src = "about:blank";
    });

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error("Failed to access iframe document");
    }

    // Write minimal HTML with isolated styles (no CSS variables that could resolve to oklch)
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              width: 80mm;
              padding: 7mm 4mm;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: Courier, monospace !important;
              font-size: 12px !important;
              line-height: 1.4 !important;
            }
          </style>
        </head>
        <body></body>
      </html>
    `);
    iframeDoc.close();

    // Build receipt content in isolated iframe
    await buildRetailReceiptContent(iframeDoc.body, data);

    // Wait a bit for rendering to ensure all elements are ready
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Convert to canvas with optimized settings for smaller file size
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 1.5, // Reduced from 2 to 1.5 for smaller file size while maintaining quality
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      width: 302, // 80mm at 96 DPI
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, (canvas.height * 80) / canvas.width], // Dynamic height
      compress: true, // Enable compression
    });

    // Convert to JPEG with quality 0.85 for smaller file size
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    const imgWidth = 80;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

    return pdf;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF receipt");
  } finally {
    // Ensure DOM cleanup even if generation fails
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

// Window.__TAURI__ is already declared globally in lanAgent.ts - reused via
// a local cast here instead of a second, conflicting `declare global`.
function tauriInvoke(): TauriInvoke | null {
  const tauri = (window as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

/**
 * window.print() has no working implementation in WKWebView (macOS) - see
 * tauri-apps/tauri#3066/#4917 and tauri-apps/wry#713 - so there is no pure
 * web-API way to trigger a native print dialog from inside the app's
 * window. Instead, the receipt is rendered to a PDF (same renderer as
 * generateRetailReceiptPDF) and handed to the Rust side, which saves it to
 * the app's cache directory and opens it with the OS's default PDF viewer -
 * a real native app, where Cmd+P actually works. Outside Tauri (e.g. a
 * plain browser during development), falls back to downloading the PDF.
 */
export const printRetailReceipt = async (data: ReceiptData): Promise<void> => {
  const pdf = await buildReceiptPdf(data);
  const fileName = receiptFileName(data);

  const invoke = tauriInvoke();
  if (invoke) {
    const bytes = Array.from(new Uint8Array(pdf.output("arraybuffer")));
    await invoke("save_and_open_receipt", { filename: fileName, data: bytes });
    return;
  }

  pdf.save(fileName);
};

export const generateRetailReceiptPDF = async (
  data: ReceiptData
): Promise<void> => {
  const pdf = await buildReceiptPdf(data);
  pdf.save(receiptFileName(data));
};

// Safe DOM building function to prevent XSS
const buildRetailReceiptContent = async (
  container: HTMLElement,
  data: ReceiptData
): Promise<void> => {
  const { sale, companyInfo, customer, staff, items, formatOptions } = data;

  // Helper function to format currency
  const formatCurrency = (value: number | string): string => {
    // Ensure value is a number
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(numValue)) {
      console.warn("Invalid currency value:", value);
      return formatOptions ? `${formatOptions.currency} 0.00` : "€0.00";
    }

    if (!formatOptions) return `€${numValue.toFixed(2)}`;
    return formatCurrencyValue(numValue, formatOptions.currency, {
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
    size: number = 60
  ): Promise<HTMLImageElement> => {
    // Use smaller QR code for PDF to reduce file size (60px instead of 80px)
    const qrDataUrl = await QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M", // Medium error correction for smaller size
    });
    const qrImg = document.createElement("img");
    qrImg.src = qrDataUrl;
    qrImg.alt = "QR Code";
    qrImg.style.width = `${size}px`;
    qrImg.style.height = `${size}px`;
    qrImg.style.display = "block";
    qrImg.style.margin = "0 auto";
    return qrImg;
  };

  // Main container
  const mainDiv = createElement("div", {
    width: "100%",
    maxWidth: "80mm",
    padding: "7mm 4mm",
    background: "white",
    color: "black",
    fontFamily: "Courier, monospace",
    fontSize: "12px",
    lineHeight: "1.4",
    boxSizing: "border-box",
  });

  // Separator line helper - using actual line for better rendering
  const createSeparator = (character = "-") => {
    const separator = createElement("div", {
      textAlign: "center",
      margin: "8px 0",
      fontSize: "10px",
      letterSpacing: "1px",
      whiteSpace: "nowrap",
      overflow: "hidden",
    });
    // Calculate proper width based on container (approximately 32 chars for 80mm)
    separator.appendChild(safeText(character.repeat(32)));
    return separator;
  };

  // Header
  const headerDiv = createElement("div", {
    textAlign: "center",
    marginBottom: "12px",
  });

  const separator1 = createSeparator("=");
  mainDiv.appendChild(separator1);

  const storeName = createElement("div", {
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "2px",
  });
  storeName.appendChild(safeText(companyInfo.name));
  headerDiv.appendChild(storeName);

  const storeSubtitle = createElement("div", {
    fontSize: "10px",
    color: "#666",
    marginBottom: "8px",
  });
  storeSubtitle.appendChild(safeText("retail store"));
  headerDiv.appendChild(storeSubtitle);

  const separator2 = createSeparator("=");
  mainDiv.appendChild(separator2);

  mainDiv.appendChild(headerDiv);

  // Transaction info
  const transactionDiv = createElement("div", {
    marginBottom: "10px",
    fontSize: "11px",
  });

  // Use table-like structure for better alignment
  const timeDiv = createElement("div", {
    display: "block",
    marginBottom: "4px",
  });
  const timeRow = createElement("div", {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
  });
  const timeLabel = createElement("span");
  timeLabel.appendChild(safeText(`${t("time")}:`));
  const timeValue = createElement("span", {
    fontWeight: "bold",
    textAlign: "right",
  });
  timeValue.appendChild(
    safeText(
      new Date(sale.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    )
  );
  timeRow.appendChild(timeLabel);
  timeRow.appendChild(timeValue);
  timeDiv.appendChild(timeRow);
  transactionDiv.appendChild(timeDiv);

  const dateDiv = createElement("div", {
    display: "block",
    marginBottom: "4px",
  });
  const dateRow = createElement("div", {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
  });
  const dateLabel = createElement("span");
  dateLabel.appendChild(safeText(`${t("date")}:`));
  const dateValue = createElement("span", {
    fontWeight: "bold",
    textAlign: "right",
  });
  dateValue.appendChild(
    safeText(
      new Date(sale.createdAt).toLocaleDateString([], {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    )
  );
  dateRow.appendChild(dateLabel);
  dateRow.appendChild(dateValue);
  dateDiv.appendChild(dateRow);
  transactionDiv.appendChild(dateDiv);

  if (staff) {
    const cashierDiv = createElement("div", {
      display: "block",
      marginBottom: "4px",
    });
    const cashierRow = createElement("div", {
      display: "flex",
      justifyContent: "space-between",
      width: "100%",
    });
    const cashierLabel = createElement("span");
    cashierLabel.appendChild(safeText(`${t("cashier")}:`));
    const cashierValue = createElement("span", {
      fontWeight: "bold",
      textAlign: "right",
    });
    cashierValue.appendChild(safeText(`${staff.firstName} ${staff.lastName}`));
    cashierRow.appendChild(cashierLabel);
    cashierRow.appendChild(cashierValue);
    cashierDiv.appendChild(cashierRow);
    transactionDiv.appendChild(cashierDiv);
  }

  mainDiv.appendChild(transactionDiv);

  const separator3 = createSeparator("-");
  mainDiv.appendChild(separator3);

  // Items
  items.forEach((item) => {
    // Ensure numeric values are properly parsed
    const quantity =
      typeof item.quantity === "string"
        ? parseInt(item.quantity, 10)
        : item.quantity;
    const unitPrice =
      typeof item.unitPrice === "string"
        ? parseFloat(item.unitPrice)
        : item.unitPrice;
    const totalPrice =
      typeof item.totalPrice === "string"
        ? parseFloat(item.totalPrice)
        : item.totalPrice;

    // Validate numeric values
    if (isNaN(quantity) || isNaN(unitPrice) || isNaN(totalPrice)) {
      console.warn("Invalid item values:", item);
      return; // Skip invalid items
    }

    const itemDiv = createElement("div", {
      marginBottom: "10px",
      display: "block",
      width: "100%",
    });

    // Item name and variant
    const itemName = createElement("div", {
      fontWeight: "bold",
      marginBottom: "3px",
      fontSize: "12px",
    });
    itemName.appendChild(safeText(item.product?.name || "Unknown Product"));
    itemDiv.appendChild(itemName);

    // Add variant attributes if available
    if ((item as any).variant && (item as any).variant.attributes) {
      const variantDiv = createElement("div", {
        fontSize: "9px",
        color: "#555",
        fontStyle: "italic",
        marginBottom: "3px",
      });
      const variantText = (item as any).variant.attributes
        .map(
          (attr: any) => `${translateAttributeName(attr.name)}: ${attr.value}`
        )
        .join(", ");
      variantDiv.appendChild(safeText(`(${variantText})`));
      itemDiv.appendChild(variantDiv);
    }

    // Item details row (quantity × price and total)
    const itemDetailsRow = createElement("div", {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      width: "100%",
      marginTop: "2px",
    });

    const itemDetails = createElement("div", {
      fontSize: "10px",
      color: "#666",
      flex: "1",
    });
    let detailsText = `${quantity} × ${formatCurrency(unitPrice)}`;

    // Add price type if available - display prominently
    // Show pricing rule info if available (from pricing relation)
    const pricingInfo = (item as any).pricing;
    if (pricingInfo) {
      const priceTypeLabels: Record<string, string> = {
        retail: t("retail"),
        wholesale: t("wholesale"),
        bulk: t("bulk"),
        promotional: t("promotion"),
      };
      const priceTypeLabel =
        priceTypeLabels[pricingInfo.priceType] || pricingInfo.priceType;
      detailsText += ` • ${priceTypeLabel}`;
      // Add quantity range if applicable
      if (
        pricingInfo.minQuantity &&
        (pricingInfo.minQuantity > 1 || pricingInfo.maxQuantity)
      ) {
        const range = pricingInfo.maxQuantity
          ? `${pricingInfo.minQuantity}-${pricingInfo.maxQuantity}`
          : `${pricingInfo.minQuantity}+`;
        detailsText += ` (${range})`;
      }
    } else if (
      (item as any).priceType &&
      (item as any).priceType !== "auto" &&
      (item as any).priceType !== "none"
    ) {
      const priceTypeLabels: Record<string, string> = {
        retail: t("retail"),
        wholesale: t("wholesale"),
        bulk: t("bulk"),
        promotional: t("promotion"),
      };
      const priceTypeLabel =
        priceTypeLabels[(item as any).priceType] || (item as any).priceType;
      detailsText += ` • ${priceTypeLabel}`;
    }

    itemDetails.appendChild(safeText(detailsText));
    itemDetailsRow.appendChild(itemDetails);

    const itemTotal = createElement("div", {
      fontWeight: "bold",
      whiteSpace: "nowrap",
      textAlign: "right",
      fontSize: "12px",
      marginLeft: "8px",
    });
    itemTotal.appendChild(safeText(formatCurrency(totalPrice)));
    itemDetailsRow.appendChild(itemTotal);
    itemDiv.appendChild(itemDetailsRow);

    mainDiv.appendChild(itemDiv);
  });

  const separator4 = createSeparator("-");
  mainDiv.appendChild(separator4);

  // Totals
  const totalsDiv = createElement("div", {
    marginTop: "8px",
    fontSize: "11px",
  });

  // Ensure sale totals are properly parsed as numbers
  const subtotal =
    typeof sale.subtotal === "string"
      ? parseFloat(sale.subtotal)
      : sale.subtotal;
  const tax = typeof sale.tax === "string" ? parseFloat(sale.tax) : sale.tax;
  const total =
    typeof sale.total === "string" ? parseFloat(sale.total) : sale.total;

  // Subtotal
  const subtotalDiv = createElement("div", {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "4px",
    width: "100%",
  });
  const subtotalLabel = createElement("span");
  subtotalLabel.appendChild(safeText(`${t("subtotal")}:`));
  const subtotalValue = createElement("span", {
    fontWeight: "bold",
    textAlign: "right",
  });
  subtotalValue.appendChild(safeText(formatCurrency(subtotal)));
  subtotalDiv.appendChild(subtotalLabel);
  subtotalDiv.appendChild(subtotalValue);
  totalsDiv.appendChild(subtotalDiv);

  // Tax
  if (!isNaN(tax) && tax > 0) {
    const taxDiv = createElement("div", {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "4px",
      width: "100%",
    });
    const taxLabel = createElement("span");
    taxLabel.appendChild(safeText(`${t("tax")}:`));
    const taxValue = createElement("span", {
      fontWeight: "bold",
      textAlign: "right",
    });
    taxValue.appendChild(safeText(formatCurrency(tax)));
    taxDiv.appendChild(taxLabel);
    taxDiv.appendChild(taxValue);
    totalsDiv.appendChild(taxDiv);
  }

  const totalSeparator = createSeparator("=");
  mainDiv.appendChild(totalSeparator);

  // Total
  const totalDiv = createElement("div", {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "14px",
    fontWeight: "bold",
    marginTop: "6px",
    padding: "4px 0",
    width: "100%",
  });
  const totalLabel = createElement("span", {
    fontSize: "14px",
    fontWeight: "bold",
  });
  totalLabel.appendChild(safeText(`${t("total")}:`));
  const totalValue = createElement("span", {
    fontSize: "14px",
    fontWeight: "bold",
    textAlign: "right",
  });
  totalValue.appendChild(safeText(formatCurrency(total)));
  totalDiv.appendChild(totalLabel);
  totalDiv.appendChild(totalValue);
  totalsDiv.appendChild(totalDiv);

  const totalSeparator2 = createSeparator("=");
  mainDiv.appendChild(totalSeparator2);

  mainDiv.appendChild(totalsDiv);

  // Footer
  const footerDiv = createElement("div", {
    marginTop: "16px",
    textAlign: "center",
  });

  const thankYouDiv = createElement("div", {
    marginBottom: "8px",
    fontSize: "12px",
    fontWeight: "bold",
  });
  thankYouDiv.appendChild(safeText(t("thankYou") || "THANK YOU!!!"));
  footerDiv.appendChild(thankYouDiv);

  // Add QR Code to footer - reduced size for smaller PDF
  if (sale.qrCode) {
    const qrContainer = createElement("div", {
      display: "block",
      textAlign: "center",
      marginTop: "12px",
      marginBottom: "8px",
    });

    const qrCode = await createQRCode(sale.qrCode, 60); // Reduced from 80 to 60 for smaller file size
    qrContainer.appendChild(qrCode);
    footerDiv.appendChild(qrContainer);
  }

  if (companyInfo.phone) {
    const phoneDiv = createElement("div", {
      fontSize: "10px",
      color: "#666",
      marginTop: "4px",
    });
    phoneDiv.appendChild(safeText(`${t("phone")}: ${companyInfo.phone}`));
    footerDiv.appendChild(phoneDiv);
  }

  mainDiv.appendChild(footerDiv);

  // Assemble the receipt
  container.appendChild(mainDiv);
};
