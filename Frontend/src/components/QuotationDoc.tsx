import type { Company, OrderStatus } from "../types";
import { docWords } from "../lib/documents";

// The printable quotation or sales order, laid out like the Sage Evolution quotation:
// company (from admin → Maintenance → Company) top-left, tax and phone top-right, "To:" the
// customer account, a row of boxes, the lines, totals, a signature block and the message lines.

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

export function QuotationDoc({ order, company }: { order: OrderStatus; company: Company | null }) {
  const lines = order.lines.map((l) => {
    const excl = l.unitPriceExcl ?? l.unitPriceIncl;
    return { ...l, tax: round2((l.unitPriceIncl - excl) * l.qty), total: round2(l.unitPriceIncl * l.qty) };
  });
  const totalIncl = order.totalIncl;
  const totalExcl = order.totalExcl ?? round2(lines.reduce((s, l) => s + l.total - l.tax, 0));
  const tax = round2(totalIncl - totalExcl);
  const date = new Date(order.placedAt).toLocaleDateString("en-GB", { day: "numeric", month: "numeric", year: "numeric" });
  const address = company?.address.filter((l) => l.trim()) ?? [];
  const messages = (order.messages ?? []).filter((m) => m.trim());
  const title = docWords(order.documentType).title;

  return (
    <article className="qdoc" aria-label={`${title} ${order.sageDocumentNo ?? order.storeOrderNo}`}>
      <header className="qdoc__top">
        <h2 className="qdoc__title">{title}</h2>
        <span className="qdoc__page">Page 1 of 1</span>
      </header>

      <div className="qdoc__parties">
        <div className="qdoc__from">
          {company?.name ? <strong>{company.name}</strong> : null}
          {address.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
          <div className="qdoc__to">
            <strong>To:</strong>
            {order.account && <strong>{order.account}</strong>}
            {order.accountName && <strong>{order.accountName}</strong>}
          </div>
        </div>
        <dl className="qdoc__contact">
          <dt>Tax Registration</dt>
          <dd>{company?.taxNumber}</dd>
          <dt>Telephone</dt>
          <dd>{company?.telephone}</dd>
          <dt>Fax</dt>
          <dd>{company?.fax}</dd>
          {company?.email ? (
            <>
              <dt>Email</dt>
              <dd>{company.email}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="qdoc__boxes">
        {[
          ["Account", order.account ?? ""],
          ["Date", date],
          ["Order No", order.storeOrderNo],
          ["Delivery Note", ""],
          ["Our Reference", order.sageDocumentNo ?? ""],
        ].map(([label, value]) => (
          <div key={label}>
            <span className="qdoc__boxlabel">{label}</span>
            <span className="qdoc__box">{value}</span>
          </div>
        ))}
      </div>

      <table className="qdoc__lines">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Item Description</th>
            <th className="num">
              Quantity <span>Unit</span>
            </th>
            <th className="num">
              Price (In) <span>Disc %</span>
            </th>
            <th className="num">Tax</th>
            <th className="num">Total (Incl)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.code}>
              <td>{l.code}</td>
              <td>{l.description}</td>
              <td className="num">{money(l.qty)}</td>
              <td className="num">{money(l.unitPriceIncl)}</td>
              <td className="num">{money(l.tax)}</td>
              <td className="num">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="qdoc__bottom">
        <dl className="qdoc__sign">
          <dt>Received by</dt>
          <dd />
          <dt>Date</dt>
          <dd />
          <dt>Signed</dt>
          <dd />
        </dl>
        <dl className="qdoc__totals">
          <dt>Total (Excl)</dt>
          <dd>{money(totalExcl)}</dd>
          <dt>Tax</dt>
          <dd>{money(tax)}</dd>
          <dt className="strong">Total (Incl)</dt>
          <dd className="strong">{money(totalIncl)}</dd>
          <dt>Discount</dt>
          <dd>0.00</dd>
          <dt className="qdoc__grand">Total (Incl)</dt>
          <dd className="qdoc__grand">{money(totalIncl)}</dd>
        </dl>
      </div>

      <footer className="qdoc__foot">
        {messages.map((m, i) => (
          <p key={i}>{m}</p>
        ))}
        {company?.footer ? <p className="qdoc__terms">{company.footer}</p> : null}
      </footer>
    </article>
  );
}
