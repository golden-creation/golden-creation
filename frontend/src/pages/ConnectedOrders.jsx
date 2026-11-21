import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useAppStore } from "../context/AppContext";
import {
  downloadOrderInvoice,
  createReturnRequest,
  formatCurrency,
  formatDate,
  getCustomerReturns,
  submitProductReview,
  uploadMedia,
} from "../lib/api";

function ConnectedOrders() {
  const { orders, addToCart, currentUser } = useAppStore();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    reviewText: "",
  });
  const [reviewImages, setReviewImages] = useState([]);
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnForm, setReturnForm] = useState({ requestType: "Return", reason: "" });
  const [returnRequests, setReturnRequests] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const highlightOrderId = location.state?.highlightOrderId;

  useEffect(() => {
    if (!currentUser?.email && !currentUser?.phone) return;
    getCustomerReturns({ email: currentUser?.email, phone: currentUser?.phone }).then(setReturnRequests).catch(() => {});
  }, [currentUser?.email, currentUser?.phone]);

  const filteredOrders = orders.filter((order) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "progress" && order.status === "Processing") ||
      (activeTab === "delivered" && order.status === "Delivered") ||
      (activeTab === "cancelled" && order.status === "Cancelled");

    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      order.id.toLowerCase().includes(query) ||
      order.items.some((item) => item.name.toLowerCase().includes(query));

    return matchesTab && matchesSearch;
  });

  const reorder = (order) => {
    order.items.forEach((item) => addToCart(item, item.quantity));
    navigate("/cart");
  };

  const downloadInvoice = async (order) => {
    try {
      setNotice("");
      await downloadOrderInvoice(order.id, {
        email: order.customer?.email,
        phone: order.customer?.phoneNumber,
      });
    } catch (error) {
      setNotice(error.message || "Unable to download invoice");
    }
  };

  const openReview = (order, item) => {
    setNotice("");
    setReviewTarget({ order, item });
    setReviewForm({ rating: 5, reviewText: "" });
    setReviewImages([]);
  };

  const handleReviewImages = async (event) => {
    try {
      const files = Array.from(event.target.files || []).slice(0, 4);
      const uploads = await Promise.all(
        files.map((file) => uploadMedia(file, "reviews"))
      );
      setReviewImages(uploads.map((media) => media.url));
    } catch (error) {
      setNotice(error.message || "Unable to upload review images");
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();

    if (!reviewTarget) return;

    try {
      await submitProductReview(reviewTarget.item.id, {
        orderNumber: reviewTarget.order.id,
        email: currentUser?.email || reviewTarget.order.customer?.email,
        phone: currentUser?.phone || reviewTarget.order.customer?.phoneNumber,
        rating: reviewForm.rating,
        reviewText: reviewForm.reviewText,
        images: reviewImages,
      });
      setReviewTarget(null);
      setReviewForm({ rating: 5, reviewText: "" });
      setReviewImages([]);
      setNotice("Review saved successfully.");
    } catch (error) {
      setNotice(error.message || "Unable to save review");
    }
  };

  const submitReturn = async (event) => {
    event.preventDefault();
    try {
      await createReturnRequest({ orderNumber: returnTarget.id, ...returnForm, email: currentUser?.email || returnTarget.customer?.email, phone: currentUser?.phone || returnTarget.customer?.phoneNumber });
      setReturnRequests(await getCustomerReturns({ email: currentUser?.email, phone: currentUser?.phone }));
      setReturnTarget(null); setReturnForm({ requestType: "Return", reason: "" }); setNotice("Request submitted.");
    } catch (error) { setNotice(error.message || "Unable to submit request"); }
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F6F6F6] px-4 py-6 md:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">Order History</h1>
            <p className="mt-1 text-xs text-gray-500 md:text-sm">
              View your recent orders and jump back into shopping whenever you need.
            </p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by Order ID or Product"
            className="w-full rounded-xl border bg-white px-4 py-2 text-sm md:w-72"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["all", "All Orders"],
            ["progress", "In Progress"],
            ["delivered", "Delivered"],
            ["cancelled", "Cancelled"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-4 py-2 text-xs md:text-sm ${
                activeTab === key ? "bg-[#C2863F] text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {returnRequests.length > 0 && <section className="mt-5 rounded-xl bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold">Return & replacement requests</h2><div className="mt-3 space-y-2">{returnRequests.map((request) => <div key={request.id} className="flex flex-wrap justify-between gap-2 rounded border px-3 py-2 text-xs"><span>{request.order_number} - {request.request_type}</span><span className="font-semibold text-[#7a4d18]">{request.status}</span></div>)}</div></section>}

        {notice && (
          <div className="mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
            {notice}
          </div>
        )}

        <div className="mt-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          {!filteredOrders.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
              No orders found yet. Place an order from checkout to see it here.
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div
                key={order.id}
                className={`rounded-xl border p-4 ${
                  order.id === highlightOrderId ? "border-[#C2863F] bg-[#FFF9EB]" : ""
                }`}
              >
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex flex-wrap gap-6 text-[11px] text-gray-500">
                    <div>
                      <p>ORDER ID</p>
                      <p className="font-medium text-black">{order.id}</p>
                    </div>
                    <div>
                      <p>PLACED ON</p>
                      <p className="text-black">{formatDate(order.createdAt)}</p>
                    </div>
                    <div>
                      <p>TOTAL PRICE</p>
                      <p className="text-black">{formatCurrency(order.total)}</p>
                    </div>
                    <div>
                      <p>PAID</p>
                      <p className="text-black">{formatCurrency(order.amountPaid || 0)}</p>
                    </div>
                    <div>
                      <p>COD DUE</p>
                      <p className="text-black">{formatCurrency(order.codDue || 0)}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#FFF4CC] px-3 py-1 text-xs text-[#7a4d18]">
                    {order.status}
                  </span>
                </div>

                <div className="mb-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => downloadInvoice(order)}
                    className="rounded-md border border-[#C2863F] px-3 py-1.5 text-xs font-medium text-[#C2863F]"
                  >
                    Download PDF Invoice
                  </button>
                  {order.status === "Delivered" && <button onClick={() => setReturnTarget(order)} className="rounded-md border border-[#C2863F] px-3 py-1.5 text-xs font-medium text-[#C2863F]">Return / Replace</button>}
                  {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="rounded-md bg-[#404C31] px-3 py-1.5 text-xs font-medium text-white">Provider tracking</a>}
                  {order.status === "Delivered" ? (
                    <span className="rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-700">
                      Ratings and reviews are available for this order
                    </span>
                  ) : (
                    <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-500">
                      Reviews unlock after delivery
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {order.items[0]?.name}
                      {order.items.length > 1 ? ` and ${order.items.length - 1} more item(s)` : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Shipment will be updated as the order progresses.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => navigate("/track-order", { state: { order } })}
                      className="rounded-md border px-3 py-1.5 text-xs"
                    >
                      Track Order
                    </button>
                    <button
                      onClick={() => reorder(order)}
                      className="rounded-md bg-[#C2863F] px-3 py-1.5 text-xs text-white"
                    >
                      Reorder
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t pt-4">
                  {order.items.map((item) => (
                    <div
                      key={`${order.id}-${item.id}-${item.name}`}
                      className="flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          Qty {item.quantity} • {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                      {order.status === "Delivered" ? (
                        <button
                          onClick={() => openReview(order, item)}
                          className="rounded-md bg-[#C2863F] px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Rate & Review
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Review after delivery</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitReview} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4">
              <p className="text-xs text-gray-500">REVIEW PRODUCT</p>
              <h2 className="text-lg font-semibold">{reviewTarget.item.name}</h2>
              <p className="text-xs text-gray-500">Order {reviewTarget.order.id}</p>
            </div>
            <label className="block text-sm font-medium">
              Rating
              <select
                value={reviewForm.rating}
                onChange={(event) =>
                  setReviewForm({ ...reviewForm, rating: Number(event.target.value) })
                }
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating} stars
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-medium">
              Review
              <textarea
                value={reviewForm.reviewText}
                onChange={(event) =>
                  setReviewForm({ ...reviewForm, reviewText: event.target.value })
                }
                className="mt-1 h-28 w-full resize-none rounded-lg border px-3 py-2 text-sm"
                placeholder="Share your experience"
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Product Images
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleReviewImages}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">Upload up to 4 images.</span>
            </label>
            {reviewImages.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {reviewImages.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    className="h-16 w-16 rounded-lg border object-cover"
                    alt="Review preview"
                  />
                ))}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-lg bg-[#C2863F] px-4 py-2 text-sm text-white">
                Submit Review
              </button>
            </div>
          </form>
        </div>
      )}
      {returnTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitReturn} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-semibold">Return or replacement</h2><p className="mt-1 text-xs text-gray-500">Order {returnTarget.id}</p><select value={returnForm.requestType} onChange={(event) => setReturnForm({ ...returnForm, requestType: event.target.value })} className="mt-4 w-full rounded border px-3 py-2 text-sm"><option>Return</option><option>Replacement</option></select><textarea required value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })} placeholder="Reason" className="mt-3 h-28 w-full rounded border px-3 py-2 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReturnTarget(null)} className="rounded bg-gray-100 px-4 py-2 text-sm">Cancel</button><button className="rounded bg-[#C2863F] px-4 py-2 text-sm text-white">Submit</button></div></form></div>}
      <Footer />
    </>
  );
}

export default ConnectedOrders;
