import "server-only";
import QRCode from "qrcode";
import { qrPayload } from "@/shared/schemas/attendance";

/** Member check-in QR as SVG markup (dark modules on white, as scanners expect). */
export async function memberQrSvg(qrToken: string): Promise<string> {
  return QRCode.toString(qrPayload(qrToken), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#111418", light: "#ffffff" },
  });
}

/** Any text (for example a URL) as a QR code SVG. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#111418", light: "#ffffff" } });
}
