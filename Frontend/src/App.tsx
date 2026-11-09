import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Empty } from "./components/bits";
import { Shop } from "./pages/Shop";
import { Product } from "./pages/Product";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Order } from "./pages/Order";
import { Track } from "./pages/Track";
import { Contact } from "./pages/Contact";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Shop />} />
        <Route path="shop" element={<Shop />} />
        {/* splat, so stock codes containing "/" (47195/ORB) still resolve */}
        <Route path="p/*" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="track" element={<Track />} />
        <Route path="order/:no" element={<Order />} />
        <Route path="contact" element={<Contact />} />
        <Route
          path="*"
          element={
            <div className="page">
              <Empty title="Page not found">
                <p>The page you're after isn't here.</p>
                <Link className="btn btn--signal" to="/">
                  See our products
                </Link>
              </Empty>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
