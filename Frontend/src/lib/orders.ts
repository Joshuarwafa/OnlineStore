// Orders are looked up by number + the phone (or email) given at checkout. After checkout we
// remember it in this browser, so the order page (and a later visit) opens without asking.

const KEY = "orders.contact.v2";
const OLD_KEY = "orders.emails.v1";

function read(): Record<string, string> {
  try {
    return { ...JSON.parse(localStorage.getItem(OLD_KEY) ?? "{}"), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return {};
  }
}

export function rememberOrderContact(storeOrderNo: string, contact: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [storeOrderNo]: contact }));
  } catch {
    /* storage unavailable: the shopper will be asked for their phone number */
  }
}

export function recallOrderContact(storeOrderNo: string): string | undefined {
  return read()[storeOrderNo];
}

export function recentOrders(): string[] {
  return Object.keys(read()).reverse().slice(0, 5);
}
