// Shared bilingual [uz, en] label maps for gazoblok enums. Callers render
// via t(...LABELS[key]) and fall back to the raw key for unknown values.

export const PAYMENT_METHOD_LABELS: Record<string, [string, string]> = {
  CASH: ["Нақд", "Cash"],
  BANK_TRANSFER: ["Банк ўтказмаси", "Bank transfer"],
  CLICK: ["Click", "Click"],
  PAYME: ["Payme", "Payme"],
  OTHER: ["Бошқа", "Other"],
};

export const EVENT_TYPE_LABELS: Record<string, [string, string]> = {
  ORDER_PLACED: ["Буюртма қабул қилинди", "Order placed"],
  STATUS_CHANGED: ["Ҳолат ўзгартирилди", "Status changed"],
  PAYMENT_RECORDED: ["Тўлов киритилди", "Payment recorded"],
  PAYMENT_CONFIRMED: ["Тўлов тасдиқланди", "Payment confirmed"],
  PAYMENT_REJECTED: ["Тўлов рад этилди", "Payment rejected"],
  SHIPMENT_LOADED: ["Жўнатма юкланди", "Shipment loaded"],
  SHIPMENT_DELIVERED: ["Жўнатма етказилди", "Shipment delivered"],
  SHIPMENT_CORRECTED: ["Жўнатма тузатилди", "Shipment corrected"],
  ORDER_SHORT_CLOSED: ["Буюртма қисқа ёпилди", "Order closed short"],
  REFUND_RECORDED: ["Мижозга пул қайтарилди", "Refund recorded"],
  ORDER_EDITED: ["Буюртма таҳрирланди", "Order edited"],
  ORDER_RESCHEDULED: ["Сана ўзгартирилди", "Date changed"],
  DELIVERY_LOCATION_SET: ["Манзил белгиланди", "Location set"],
  DELIVERY_LOCATION_CLEARED: ["Манзил ўчирилди", "Location cleared"],
  DELIVERY_PROOF: ["Етказиш сурати", "Delivery photo"],
};
