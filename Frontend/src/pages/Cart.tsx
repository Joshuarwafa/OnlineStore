import { config } from "../config";
import { useDocumentTitle } from "../lib/useAsync";
import { DocketBody } from "../components/Docket";

export function Cart() {
  useDocumentTitle("Cart", config.storeName);
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow">Your docket</p>
        <h1 className="page__title">Ready when you are</h1>
      </header>
      <DocketBody />
    </div>
  );
}
