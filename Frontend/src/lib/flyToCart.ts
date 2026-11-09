// "Fly to cart": a small copy of the product picture arcs from where the shopper tapped into
// the Cart button. Pure decoration, done with the Web Animations API; skipped when the device
// asks for reduced motion or the browser can't animate.

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param from   the element that was tapped (the Add button)
 * @param source optional picture to copy (the card's image); a coloured dot is used otherwise
 */
export function flyToCart(from: Element, source?: Element | null) {
  if (reduced()) return;
  const target = document.querySelector(".scart");
  if (!target || typeof (target as HTMLElement).animate !== "function") return;

  const a = (source ?? from).getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 56;

  const ghost = document.createElement("div");
  ghost.className = "fly-ghost";
  ghost.setAttribute("aria-hidden", "true");
  if (source) {
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute("style");
    copy.style.setProperty("--h", (source as HTMLElement).style.getPropertyValue("--h"));
    copy.className = `${(source as HTMLElement).className} fly-ghost__img`;
    ghost.appendChild(copy);
  }
  ghost.style.left = `${a.left + a.width / 2 - size / 2}px`;
  ghost.style.top = `${a.top + a.height / 2 - size / 2}px`;
  document.body.appendChild(ghost);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  // Arc: rise a little first, then curve into the cart
  const lift = Math.min(120, Math.abs(dy) * 0.35 + 40);

  const anim = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.85)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.4 },
    ],
    { duration: 700, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
  const done = () => ghost.remove();
  anim.onfinish = () => {
    done();
    (target as HTMLElement).animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
      { duration: 380, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
  };
  anim.oncancel = done;
}
