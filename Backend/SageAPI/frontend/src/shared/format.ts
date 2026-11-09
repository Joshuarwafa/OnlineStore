const qtyFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export const formatQty = (value: number) => qtyFormat.format(value);
export const formatCount = (value: number) => countFormat.format(value);
export const formatTime = (date: Date) => timeFormat.format(date);
