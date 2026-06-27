export type SmsDeliveryStatus = string | null | undefined;

interface StatusInfo {
  label: string;
  className: string;
  tooltip: string;
  isError: boolean;
}

export function getSmsStatusInfo(status: SmsDeliveryStatus, errorCode?: string | null): StatusInfo {
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
        tooltip: `Message failed to send${errorCode ? ` — Twilio error ${errorCode}` : ""}`,
        isError: true,
      };
    case "undelivered":
      return {
        label: errorCode ? `Undelivered (${errorCode})` : "Undelivered",
        className: "text-red-600 bg-red-50 border-red-200",
        tooltip: `Message was not delivered${errorCode ? ` — Twilio error ${errorCode}` : ""}`,
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
