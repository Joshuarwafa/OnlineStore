import { Link } from "react-router-dom";
import { config } from "../config";
import { useDocumentTitle } from "../lib/useAsync";
import { Icon } from "../components/Icon";

const tel = () => `tel:${config.contactPhone.replace(/[^\d+]/g, "")}`;

export function Contact() {
  useDocumentTitle("Contact", config.storeName);
  const cards = [
    config.contactPhone && { icon: "headset" as const, title: "Call us", body: config.contactPhone, href: tel() },
    config.contactEmail && { icon: "mail" as const, title: "Email", body: config.contactEmail, href: `mailto:${config.contactEmail}` },
    config.address && { icon: "pin" as const, title: "Visit", body: config.address },
    config.hours && { icon: "clock" as const, title: "Opening hours", body: config.hours },
  ].filter(Boolean) as { icon: "headset" | "mail" | "pin" | "clock"; title: string; body: string; href?: string }[];

  return (
    <div className="page info">
      <header className="info__hero">
        <p className="eyebrow">Contact</p>
        <h1 className="page__title">Contact us</h1>
        <p className="lede">Questions about stock, an order, or a large quantity? Reach the team directly.</p>
      </header>

      <div className="info__grid info__grid--4">
        {cards.map((c) => {
          const inner = (
            <>
              <span className="info-card__icon">
                <Icon name={c.icon} />
              </span>
              <h2>{c.title}</h2>
              <p className="info-card__strong">{c.body}</p>
            </>
          );
          return c.href ? (
            <a key={c.title} href={c.href} className="info-card info-card--link">
              {inner}
            </a>
          ) : (
            <article key={c.title} className="info-card">
              {inner}
            </article>
          );
        })}
      </div>

      <section className="info__band">
        <div>
          <h2 className="section__title">Asking about an order?</h2>
          <p className="lede">Have your order number ready. It starts with WEB- and is on your confirmation page.</p>
        </div>
        <div className="info__band-actions">
          <Link to="/track" className="btn btn--signal btn--xl">
            Track an order
          </Link>
          {config.contactEmail && (
            <a href={`mailto:${config.contactEmail}?subject=${encodeURIComponent("Question about my order")}`} className="btn btn--xl">
              Email about an order
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
