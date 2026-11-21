import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAppStore } from "./context/AppContext";
import { captureReferralFromUrl, initializeRecaptcha } from "./lib/api";
import { PageLoader } from "./components/Skeleton";

const About = lazy(() => import("./pages/About"));
const Address = lazy(() => import("./pages/Address"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogDetail = lazy(() => import("./pages/BlogDetail"));
const Cart = lazy(() => import("./pages/ConnectedCart"));
const Checkout = lazy(() => import("./pages/ConnectedCheckout"));
const Home = lazy(() => import("./pages/ConnectedHome"));
const Orders = lazy(() => import("./pages/ConnectedOrders"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const ProductDetail = lazy(() => import("./pages/ConnectedProductDetail"));
const TrackOrder = lazy(() => import("./pages/ConnectedTrackOrder"));
const WritingEssentials = lazy(() => import("./pages/WritingEssentials"));
const Brands = lazy(() => import("./pages/Brands"));
const BrandDetail = lazy(() => import("./pages/BrandDetail"));
const CollectionDetail = lazy(() => import("./pages/CollectionDetail"));
const CorporateOrders = lazy(() => import("./pages/CorporateOrders"));
const BundleShopping = lazy(() => import("./pages/BundleShopping"));
const BundleDetail = lazy(() => import("./pages/BundleDetail"));
const Contact = lazy(() => import("./pages/Contact"));
const Login = lazy(() => import("./pages/Login"));
const Faqs = lazy(() => import("./pages/Faqs"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const Profile = lazy(() => import("./pages/Profile"));
const Wishlist = lazy(() => import("./pages/ConnectedWishlist"));
const AffiliateLanding = lazy(() => import("./pages/AffiliateLanding"));
const AffiliateJoin = lazy(() => import("./pages/AffiliateJoin"));

function ProtectedRoute({ children }) {
  const { currentUser } = useAppStore();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  return null;
}

function RouteContainer({ children }) {
  const location = useLocation();

  return (
    <div key={`${location.pathname}${location.search}`} className="route-fade-in">
      {children}
    </div>
  );
}

function ExternalRedirect({ to }) {
  useEffect(() => {
    window.location.href = to;
  }, [to]);

  return <PageLoader />;
}

function App() {
  useEffect(() => {
    initializeRecaptcha();
    void captureReferralFromUrl();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <RouteContainer>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/writing-essentials" element={<WritingEssentials />} />
            <Route path="/all-products" element={<WritingEssentials />} />
            <Route path="/category/:slug" element={<WritingEssentials />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/brand/:slug" element={<BrandDetail />} />
            <Route path="/collections/:slug" element={<CollectionDetail />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route
              path="/cart"
              element={
                <ProtectedRoute>
                  <Cart />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wishlist"
              element={
                <ProtectedRoute>
                  <Wishlist />
                </ProtectedRoute>
              }
            />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Orders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/order-success"
              element={
                <ProtectedRoute>
                  <OrderSuccess />
                </ProtectedRoute>
              }
            />
            <Route
              path="/track-order"
              element={
                <ProtectedRoute>
                  <TrackOrder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/address"
              element={
                <ProtectedRoute>
                  <Address />
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faqs" element={<Faqs />} />
            <Route path="/affiliate" element={<AffiliateLanding />} />
            <Route path="/affiliate/join" element={<AffiliateJoin />} />
            <Route path="/affiliate/login" element={<ExternalRedirect to="https://admin.goldencreation.in/login" />} />
            <Route path="/shipping-policy" element={<PolicyPage type="shipping" />} />
            <Route path="/return-policy" element={<PolicyPage type="returns" />} />
            <Route path="/privacy-policy" element={<PolicyPage type="privacy" />} />
            <Route path="/terms-and-conditions" element={<PolicyPage type="terms" />} />
            <Route path="/BundleKits" element={<BundleShopping />} />
            <Route path="/bundle-kits" element={<BundleShopping />} />
            <Route path="/bundles" element={<BundleShopping />} />
            <Route path="/bundles/:slug" element={<BundleDetail />} />
            <Route path="/corporate-orders" element={<CorporateOrders />} />
          </Routes>
        </RouteContainer>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
