export type SmsDeliveryStatus = string | null | undefined;

interface StatusInfo {
  label: string;
  className: string;
  tooltip: string;
  isError: boolean;
}

const TWILIO_ERROR_CODES: Record<string, string> = {
  "30001": "Queue overflow — too many messages queued",
  "30002": "Account suspended — check Twilio account status",
  "30003": "Unreachable destination handset — device may be off or out of service area",
  "30004": "Message blocked — the destination number has opted out or is blocked by the carrier",
  "30005": "Unknown destination handset — number may no longer be in use",
  "30006": "Landline or unreachable carrier — this number cannot receive SMS",
  "30007": "Message filtered — carrier rejected the content or sender",
  "30008": "Message blocked by carrier — sender ID or content may be flagged",
  "30009": "Missing inbound segment — message delivery incomplete",
  "30010": "Message price exceeds configured maximum",
  "21610": "Recipient has opted out (STOP received) — cannot send until re-opted in",
  "21614": "Not a valid mobile number — unable to deliver SMS",
  "21211": "Invalid destination phone number",
};

function errorDescription(errorCode?: string | null): string {
  if (!errorCode) return "";
  return TWILIO_ERROR_CODES[errorCode] ?? `Twilio error ${errorCode}`;
}

export function getSmsStatusInfo(status: SmsDeliveryStatus, errorCode?: string | null): StatusInfo {
  const errDesc = errorDescription(errorCode);
  switch (status) {
    case "delivered":
      return {
        label: "Delivered",
        className: "text-green-700 bg-green-50 border-green-200",
        tooltip: "Message confirmed delivered to recipient's device",
        isError: false,
      };
    case "sent":
      return {
        label: "Sent",
        className: "text-blue-600 bg-blue-50 border-blue-200",
        tooltip: "Message sent to carrier — awaiting delivery confirmation",
        isError: false,
      };
    case "queued":
      return {
        label: "Queued",
        className: "text-gray-500 bg-gray-100 border-gray-200",
        tooltip: "Message queued for sending",
        isError: false,
      };
    case "sending":
      return {
        label: "Sending…",
        className: "text-blue-500 bg-blue-50 border-blue-200",
        tooltip: "Message is being transmitted",
        isError: false,
      };
    case "failed":
      return {
        label: errorCode ? `Failed (${errorCode})` : "Failed",
        className: "text-red-700 bg-red-50 border-red-200",
        tooltip: errDesc || "Message failed to send",
        isError: true,
      };
    case "undelivered":
      return {
        label: errorCode ? `Undelivered (${errorCode})` : "Undelivered",
        className: "text-red-600 bg-red-50 border-red-200",
        tooltip: errDesc || "Message was not delivered to recipient",
        isError: true,
      };
    case "received":
      return {
        label: "Received",
        className: "text-gray-500 bg-gray-100 border-gray-200",
        tooltip: "Inbound message received",
        isError: false,
      };
    default:
      if (!status) return { label: "", className: "", tooltip: "", isError: false };
      return {
        label: status,
        className: "text-gray-400 bg-gray-100 border-gray-200",
        tooltip: "Delivery status unknown",
        isError: false,
      };
  }
}
