const TRANSITIONS = {
  Pending: ["Processing", "Dispatched", "Cancelled"],
  Processing: ["Dispatched", "In Transit", "Cancelled"],
  Dispatched: ["In Transit", "Delivered"],
  "In Transit": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export function nextStatusOptions(status) {
  return [status, ...(TRANSITIONS[status] || [])].filter(
    (item, index, all) => item && all.indexOf(item) === index
  );
}

export function carrierResolutionAvailable(status) {
  return status === "Dispatched" || status === "In Transit";
}
