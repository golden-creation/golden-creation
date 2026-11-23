import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import profileImg from "../assets/A1.jpg";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import dashboardIcon from "../assets/settings.png";
import ordersIcon from "../assets/shopping-cart.png";
import addressIcon from "../assets/location.png";
import wishlistIcon from "../assets/heart.png";
import trackIcon from "../assets/search.png";
import chevron from "../assets/chevron.png";
import starIcon from "../assets/star.png";
import settingIcon from "../assets/settings.png";
import rightArrow from "../assets/right-arrow.png";
import boxIcon from "../assets/box.png";
import homeIcon from "../assets/home.png";
import workIcon from "../assets/briefcase (1).png";
import phoneIcon from "../assets/telephone.png";
import editIcon from "../assets/pencil.png";
import deleteIcon from "../assets/delete.png";
import warrantyIcon from "../assets/warranty.png";
import walletIcon from "../assets/wallet.png";
import documentIcon from "../assets/document.png";
import transitIcon from "../assets/express-delivery.png";
import deliveredIcon from "../assets/warranty.png";
import cancelIcon from "../assets/close.png";
import undoIcon from "../assets/undo.png";
import questionIcon from "../assets/question.png";
import clockIcon from "../assets/clock (1).png";
import checkIcon from "../assets/check.png";
import { useAppStore } from "../context/AppContext";
import {
  downloadOrderInvoice,
  buildReferralLink,
  deleteCustomerPayoutMethod,
  formatCurrency,
  formatDate,
  getCustomerPayoutMethods,
  getCustomerReferralLedger,
  getCustomerReferralSummary,
  getCustomerWithdrawals,
  getUserProfile,
  requestCustomerWithdrawal,
  saveCustomerPayoutMethod,
  submitProductReview,
  updateUserProfile,
  uploadMedia,
  removeUserProfileImage,
} from "../lib/api";

function Profile() {
  const [active, setActive] = useState("dashboard");
  const [activeCard, setActiveCard] = useState("orders");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    profileImage: "",
  });
  const [referralData, setReferralData] = useState({
    code: "",
    wallet: {},
    ledger: [],
    methods: [],
    withdrawals: [],
  });
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMessage, setReferralMessage] = useState("");
  const navigate = useNavigate();
  const {
    currentUser,
    setCurrentUser,
    logout,
    orders,
    wishlistItems,
    cartGrandTotal,
    addToCart,
    removeFromWishlist,
    clearWishlist,
    addresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  } = useAppStore();

  useEffect(() => {
    setProfileUser(currentUser);
    setEditForm({
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "",
      profileImage: currentUser?.profile_image || currentUser?.profileImage || "",
    });
  }, [currentUser]);

  useEffect(() => {
    let ignore = false;
    const email = currentUser?.email || "";
    const phone = currentUser?.phone || "";

    async function refreshProfile() {
      if (!email && !phone) {
        setProfileUser(currentUser);
        return;
      }

      try {
        setProfileLoading(true);
        const nextUser = await getUserProfile({ email, phone });

        if (!ignore && nextUser) {
          setProfileUser(nextUser);
          setCurrentUser((previous) => {
            if (!previous) {
              return nextUser;
            }

            const mergedUser = {
              ...previous,
              ...nextUser,
            };

            const hasChanged =
              previous.id !== mergedUser.id ||
              previous.name !== mergedUser.name ||
              previous.email !== mergedUser.email ||
              previous.phone !== mergedUser.phone ||
              previous.is_verified !== mergedUser.is_verified ||
              previous.created_at !== mergedUser.created_at;

            return hasChanged ? mergedUser : previous;
          });
          setProfileError("");
        }
      } catch (error) {
        if (!ignore) {
          setProfileUser(currentUser);
          setProfileError(error.message || "Unable to load profile details.");
        }
      } finally {
        if (!ignore) {
          setProfileLoading(false);
        }
      }
    }

    refreshProfile();

    return () => {
      ignore = true;
    };
  }, [currentUser, setCurrentUser]);

  const refreshReferralWallet = async () => {
    if (!currentUser?.id) return;
    setReferralLoading(true);
    try {
      const [summary, ledgerResponse, methods, withdrawals] = await Promise.all([
        getCustomerReferralSummary(),
        getCustomerReferralLedger(),
        getCustomerPayoutMethods(),
        getCustomerWithdrawals(),
      ]);
      setReferralData({
        code: summary?.code || "",
        wallet: summary?.wallet || {},
        ledger: ledgerResponse?.ledger || summary?.ledger || [],
        methods,
        withdrawals,
      });
      setReferralMessage("");
    } catch (error) {
      setReferralMessage(error.message || "Unable to load referral wallet.");
    } finally {
      setReferralLoading(false);
    }
  };

  useEffect(() => {
    if (active === "referrals") {
      void refreshReferralWallet();
    }
  }, [active, currentUser?.id]);

  const userName =
    profileUser?.name?.trim() ||
    profileUser?.email?.trim() ||
    profileUser?.phone?.trim() ||
    "Aarav";
  const memberSinceLabel = profileUser?.created_at
    ? `Member since ${formatDate(profileUser.created_at)}`
    : "Member since unavailable";
  const memberSinceValue = profileUser?.created_at
    ? new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "numeric",
      }).format(new Date(profileUser.created_at))
    : "--";
  const verificationValue = profileUser?.is_verified ? "Yes" : "No";
  const processingOrders = orders.filter((order) => order.status !== "Delivered").length;
  const recentOrders = orders.slice(0, 5);

  const dashboardRows = useMemo(() => {
    if (recentOrders.length) {
      return recentOrders.map((order) => [
        order.id,
        formatDate(order.createdAt),
        formatCurrency(order.total),
        order.status,
      ]);
    }

    return [
      ["#LM-98210", "Oct 12, 2023", "INR 1,240", "Delivered"],
      ["#LM-97554", "Oct 05, 2023", "INR 450", "Processing"],
    ];
  }, [recentOrders]);

  const handleClick = (msg) => {
    if (msg === "Logout") {
      logout();
      navigate("/login");
      return;
    }

    if (msg === "View Orders") {
      setActive("orders");
      return;
    }

    if (msg === "Edit Profile") {
      setEditingProfile(true);
      return;
    }

    alert(msg);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();

    if (!String(editForm.name || "").trim()) {
      setProfileError("Name is required.");
      return;
    }

    if (!profileUser?.id) {
      setProfileError("Unable to update this profile yet.");
      return;
    }

    try {
      setSavingProfile(true);
      const nextUser = await updateUserProfile({
        id: profileUser.id,
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        profileImage: editForm.profileImage,
      });

      if (nextUser) {
        setProfileUser(nextUser);
        setCurrentUser((previous) => ({
          ...(previous || {}),
          ...nextUser,
        }));
        setProfileError("");
        setEditingProfile(false);
      }
    } catch (error) {
      setProfileError(error.message || "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const menuClass = (name) =>
    `flex items-center justify-between p-3 rounded-xl cursor-pointer transition whitespace-nowrap ${
      active === name ? "bg-[#FFF49C] text-black font-semibold" : "hover:bg-gray-100"
    }`;

  return (
    <>
      <Navbar />
      <div className="w-full max-w-screen bg-[#F4F4F4]">
        <div className="w-full flex flex-col md:flex-row">
          <div className="md:w-64 w-full bg-white px-0 md:p-5 shadow-sm flex md:flex-col justify-between md:sticky md:top-16 h-auto md:h-[calc(100vh-64px)] overflow-x-auto md:overflow-visible overflow-y-hidden flex-shrink-0">
            <div className="flex flex-col w-full">
              <h2 className="text-lg font-semibold mb-6 hidden md:block">Dashboard</h2>
              <div className="flex md:flex-col gap-2 md:space-y-2 text-sm w-full overflow-x-auto md:overflow-visible px-2 py-2">
                {[
                  ["dashboard", "Dashboard", dashboardIcon],
                  ["orders", "My Orders", ordersIcon],
                  ["address", "Addresses", addressIcon],
                  ["wishlist", "Wishlist", wishlistIcon],
                  ["referrals", "Refer & Earn", walletIcon],
                  ["track", "Track Order", trackIcon],
                ].map(([key, label, icon]) => (
                  <div
                    key={key}
                    onClick={() => setActive(key)}
                    className={`${menuClass(key)} min-w-[80px] md:min-w-full flex flex-col md:flex-row items-center justify-center md:justify-between`}
                  >
                    <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
                      <img src={icon} className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="text-[11px] md:text-sm">{label}</span>
                    </div>
                    <img src={chevron} className="w-3 opacity-50 hidden md:block" />
                  </div>
                ))}
                <div
                  onClick={() => handleClick("Logout")}
                  className="md:hidden flex flex-col items-center p-2 text-black min-w-[70px]"
                >
                  <span className="text-[11px]">Log Out</span>
                </div>
              </div>
            </div>
            <div className="hidden md:flex flex-col justify-end h-full">
              <div
                onClick={() => handleClick("Logout")}
                className="flex items-center justify-center p-3 rounded-xl cursor-pointer bg-[#FFF49C] text-black font-semibold hover:bg-[#f7e98a]"
              >
                <span className="text-sm">Log Out</span>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full px-3 md:px-6 py-3 md:py-6 overflow-y-auto h-[calc(100vh-64px)] overflow-x-hidden">
            <div className="w-full bg-white px-3 py-4 md:p-5 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
              <div className="flex items-center gap-3">
                <img src={profileUser?.profile_image || profileUser?.profileImage || profileImg} className="h-10 w-10 rounded-full object-cover md:h-12 md:w-12" />
                <div>
                  <h1 className="text-sm md:text-lg font-semibold">Welcome back, {userName}!</h1>
                  <p className="text-[10px] md:text-sm text-gray-500">
                    {profileUser?.email || profileUser?.phone || "Database profile unavailable"}
                  </p>
                  <p className="text-[10px] md:text-xs text-gray-400">
                    Customer ID: {profileUser?.id || "--"} | {memberSinceLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleClick("Edit Profile")}
                className="flex items-center justify-center gap-2 bg-[#C2863F] text-white px-4 py-2 rounded-xl text-xs md:text-sm w-full md:w-auto"
              >
                <img src={settingIcon} className="w-4" />
                Edit Profile
              </button>
            </div>

            {active === "dashboard" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6 w-full">
                  {[
                    [
                      "orders",
                      "TOTAL ORDERS",
                      String(orders.length).padStart(2, "0"),
                      `${processingOrders} orders in transit`,
                      boxIcon,
                    ],
                    [
                      "wishlist",
                      "IN WISHLIST",
                      String(wishlistItems.length).padStart(2, "0"),
                      wishlistItems.length ? "Saved for later" : "Build your list",
                      wishlistIcon,
                    ],
                    ["member", "MEMBER SINCE", memberSinceValue, memberSinceLabel, addressIcon],
                    [
                      "verified",
                      "VERIFIED",
                      verificationValue,
                      profileUser?.google_id ? "Google account linked" : "OTP verified account",
                      starIcon,
                    ],
                  ].map(([key, title, val, para, icon], i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setActiveCard(key);
                        if (["orders", "address", "wishlist", "track"].includes(key)) {
                          setActive(key);
                        }
                      }}
                      className={`p-3 md:p-4 rounded-2xl shadow-sm border cursor-pointer transition ${
                        activeCard === key ? "bg-[#A8AEA4] text-black" : "bg-white"
                      }`}
                    >
                      <div className="flex justify-end">
                        <img src={chevron} className="w-3" />
                      </div>
                      <img src={icon} className="w-5 md:w-7 mx-auto mb-2" />
                      <p className="text-[9px] md:text-xs text-center">{title}</p>
                      <h2 className="text-base md:text-xl font-semibold text-center">{val}</h2>
                      <p className="text-[9px] md:text-xs text-center">{para}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 mt-6 w-full">
                  <div className="md:col-span-2 w-full bg-white p-3 md:p-5 rounded-2xl shadow-sm border">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
                      <div>
                        <h3 className="text-base md:text-lg font-semibold text-[#C2863F]">
                          Recent Orders
                        </h3>
                        <p className="text-[10px] md:text-xs text-gray-400">
                          You have placed {orders.length} order{orders.length === 1 ? "" : "s"} so far.
                        </p>
                      </div>
                      <button
                        onClick={() => handleClick("View Orders")}
                        className="w-full md:w-auto px-4 py-2 border border-[#C2863F] text-[#C2863F] rounded-lg hover:bg-[#C2863F] hover:text-white text-xs md:text-sm"
                      >
                        View All Orders
                      </button>
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-xs md:text-sm">
                        <thead className="bg-[#A8AEA4] text-white">
                          <tr>
                            <th className="text-left p-2 md:p-3">Order ID</th>
                            <th className="p-2 md:p-3">Date</th>
                            <th className="p-2 md:p-3">Amount</th>
                            <th className="p-2 md:p-3">Status</th>
                            <th className="p-2 md:p-3">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardRows.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="p-2 md:p-3">{row[0]}</td>
                              <td className="p-2 md:p-3 text-center">{row[1]}</td>
                              <td className="p-2 md:p-3 text-center">{row[2]}</td>
                              <td className="p-2 md:p-3 text-center font-medium">{row[3]}</td>
                              <td className="p-2 md:p-3 text-[#C2863F]">
                                <button
                                  type="button"
                                  onClick={() => setActive("orders")}
                                  className="mx-auto flex items-center justify-center gap-1"
                                >
                                  Details
                                  <img src={rightArrow} className="w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-4 w-full">
                    <div className="bg-white px-3 py-3 rounded-2xl shadow-sm border">
                      <h4 className="font-semibold mb-2 text-sm md:text-base">Account Snapshot</h4>
                      <div className="space-y-1 text-[10px] md:text-xs text-gray-500">
                        <p>User ID: {profileUser?.id || "Not available"}</p>
                        <p>Name: {profileUser?.name || "Not available"}</p>
                        <p>Email: {profileUser?.email || "Not available"}</p>
                        <p>Phone: {profileUser?.phone || "Not available"}</p>
                        <p>Joined: {profileUser?.created_at ? formatDate(profileUser.created_at) : "Not available"}</p>
                        <p>Verified: {profileUser?.is_verified ? "Yes" : "No"}</p>
                        <p>Merchandise total: {formatCurrency(cartGrandTotal)}</p>
                        {profileLoading && <p>Refreshing profile...</p>}
                        {profileError && <p>{profileError}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {active === "orders" && (
              <EmbeddedOrders
                orders={orders}
                currentUser={profileUser}
                onReorder={(order) => {
                  order.items.forEach((item) => addToCart(item, item.quantity));
                  navigate("/cart");
                }}
                onTrack={(order) => navigate("/track-order", { state: { order } })}
              />
            )}

            {active === "address" && (
              <EmbeddedAddresses
                addresses={addresses}
                currentUser={profileUser}
                addAddress={addAddress}
                updateAddress={updateAddress}
                deleteAddress={deleteAddress}
                setDefaultAddress={setDefaultAddress}
              />
            )}

            {active === "wishlist" && (
              <EmbeddedWishlist
                wishlistItems={wishlistItems}
                clearWishlist={clearWishlist}
                removeFromWishlist={removeFromWishlist}
                addToCart={addToCart}
                navigate={navigate}
              />
            )}

            {active === "track" && (
              <EmbeddedTrackOrder
                orders={orders}
                currentUser={profileUser}
                navigate={navigate}
              />
            )}

            {active === "referrals" && (
              <EmbeddedReferralWallet
                data={referralData}
                loading={referralLoading}
                message={referralMessage}
                setMessage={setReferralMessage}
                refresh={refreshReferralWallet}
              />
            )}
          </div>
        </div>
      </div>
      {editingProfile && (
        <EditProfileModal
          form={editForm}
          setForm={setEditForm}
          onClose={() => setEditingProfile(false)}
          onSubmit={handleProfileSave}
          saving={savingProfile}
          error={profileError}
          userId={profileUser?.id}
          onRemoved={(nextUser) => {
            setProfileUser(nextUser);
            setCurrentUser((previous) => ({ ...(previous || {}), ...nextUser }));
            setEditForm((previous) => ({ ...previous, profileImage: "" }));
          }}
        />
      )}
      <Footer />
    </>
  );
}

function EditProfileModal({ form, setForm, onClose, onSubmit, saving, error, userId, onRemoved }) {
  const [uploading, setUploading] = useState(false);
  const handleImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadMedia(file, "customer-profiles");
      setForm((previous) => ({ ...previous, profileImage: media.url }));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleRemove = async () => {
    if (!userId || !form.profileImage) return;
    const nextUser = await removeUserProfileImage({ id: userId, imageUrl: form.profileImage });
    onRemoved(nextUser);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Profile</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4 rounded-xl border p-3">
            <img src={form.profileImage || profileImg} className="h-16 w-16 rounded-full object-cover" alt="Profile" />
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg bg-[#C2863F] px-3 py-2 text-sm text-white">
                {uploading ? "Uploading..." : "Upload photo"}
                <input hidden type="file" accept="image/*" onChange={handleImage} disabled={uploading} />
              </label>
              {form.profileImage && (
                <button type="button" onClick={handleRemove} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">
                  Remove
                </button>
              )}
            </div>
          </div>
          <Field
            label="Name"
            value={form.name}
            onChange={(value) => setForm((previous) => ({ ...previous, name: value }))}
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(value) => setForm((previous) => ({ ...previous, phone: value }))}
          />
          {error && <p className="text-sm text-[#C2863F]">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[#C2863F] px-4 py-2 text-sm text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmbeddedReferralWallet({ data, loading, message, setMessage, refresh }) {
  const wallet = data.wallet || {};
  const [path, setPath] = useState("/");
  const [methodForm, setMethodForm] = useState({
    methodType: "UPI",
    accountHolder: "",
    upiId: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
  });
  const [amount, setAmount] = useState("");
  const code = data.code || "";
  const referralLink = code ? buildReferralLink(path || "/", code, "ref") : "";
  const minimumCashout = Number(wallet.minimumCashout || 0);
  const available = Number(wallet.available || 0);
  const canCashout = available >= minimumCashout && data.methods.length > 0;

  const copy = async (text) => {
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setMessage("Referral link copied.");
  };

  const shareWhatsapp = () => {
    if (!referralLink) return;
    const text = encodeURIComponent(`Shop Golden Creation with my referral link: ${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const saveMethod = async (event) => {
    event.preventDefault();
    try {
      await saveCustomerPayoutMethod(methodForm);
      setMessage("Payout method saved.");
      await refresh();
    } catch (error) {
      setMessage(error.message || "Unable to save payout method.");
    }
  };

  const removeMethod = async (id) => {
    try {
      await deleteCustomerPayoutMethod(id);
      setMessage("Payout method removed.");
      await refresh();
    } catch (error) {
      setMessage(error.message || "Unable to remove payout method.");
    }
  };

  const cashout = async (event) => {
    event.preventDefault();
    try {
      await requestCustomerWithdrawal(Number(amount));
      setAmount("");
      setMessage("Cashout request sent to admin.");
      await refresh();
    } catch (error) {
      setMessage(error.message || "Unable to request cashout.");
    }
  };

  return (
    <div className="mt-6 space-y-5 px-3 md:px-6">
      <div>
        <h2 className="text-xl font-semibold">Refer & Earn Wallet</h2>
        <p className="text-sm text-gray-500">
          Share Golden Creation links. Commission appears as pending first and becomes available after delivery and the hold period.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-8 text-sm text-gray-500">Loading referral wallet...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Available", wallet.available, "bg-emerald-50 text-emerald-800"],
              ["Pending", wallet.pending, "bg-amber-50 text-amber-800"],
              ["Paid", wallet.paid, "bg-sky-50 text-sky-800"],
              ["Rejected", wallet.rejected, "bg-rose-50 text-rose-800"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded-2xl border p-4 ${tone}`}>
                <p className="text-[10px] uppercase tracking-[0.14em] opacity-70">{label}</p>
                <p className="mt-2 text-lg font-bold">{formatCurrency(value || 0)}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Your referral code</p>
                <h3 className="text-2xl font-bold tracking-[0.14em] text-[#C2863F]">{code || "--"}</h3>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => copy(referralLink)} className="rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">
                  Copy Link
                </button>
                <button type="button" onClick={shareWhatsapp} className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white">
                  WhatsApp Share
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_2fr]">
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/product/product-slug or /category/category-slug"
                className="rounded-xl border px-3 py-2 text-sm"
              />
              <p className="break-all rounded-xl bg-[#FBF8F2] px-3 py-2 text-xs text-gray-600">{referralLink || "Login profile is preparing your code."}</p>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="font-semibold">Payout Details</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Payment details are provided by you and will be used for manual payout processing. Please ensure the UPI ID or bank details are correct.
              </p>
              <form onSubmit={saveMethod} className="mt-4 grid gap-3">
                <select value={methodForm.methodType} onChange={(event) => setMethodForm({ ...methodForm, methodType: event.target.value })} className="rounded-xl border px-3 py-2 text-sm">
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank Account</option>
                </select>
                <input value={methodForm.accountHolder} onChange={(event) => setMethodForm({ ...methodForm, accountHolder: event.target.value })} placeholder="Account holder name" className="rounded-xl border px-3 py-2 text-sm" />
                {methodForm.methodType === "UPI" ? (
                  <input value={methodForm.upiId} onChange={(event) => setMethodForm({ ...methodForm, upiId: event.target.value })} placeholder="UPI ID" className="rounded-xl border px-3 py-2 text-sm" />
                ) : (
                  <>
                    <input value={methodForm.bankName} onChange={(event) => setMethodForm({ ...methodForm, bankName: event.target.value })} placeholder="Bank name" className="rounded-xl border px-3 py-2 text-sm" />
                    <input value={methodForm.accountNumber} onChange={(event) => setMethodForm({ ...methodForm, accountNumber: event.target.value })} placeholder="Account number" className="rounded-xl border px-3 py-2 text-sm" />
                    <input value={methodForm.ifsc} onChange={(event) => setMethodForm({ ...methodForm, ifsc: event.target.value })} placeholder="IFSC" className="rounded-xl border px-3 py-2 text-sm" />
                  </>
                )}
                <button className="rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">Save Payout Method</button>
              </form>

              <div className="mt-4 space-y-2">
                {data.methods.map((method) => (
                  <div key={method.id} className="flex items-center justify-between rounded-xl bg-[#FBF8F2] px-3 py-2 text-xs">
                    <span>
                      {method.methodType}: {method.upiId || method.accountNumber || method.bankName || "Saved"}
                    </span>
                    <button type="button" onClick={() => removeMethod(method.id)} className="font-semibold text-red-600">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="font-semibold">Cashout</h3>
              <p className="mt-1 text-sm text-gray-500">Minimum cashout: {formatCurrency(minimumCashout)}</p>
              <form onSubmit={cashout} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" placeholder="Amount" className="rounded-xl border px-3 py-2 text-sm" />
                <button disabled={!canCashout} className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Request Cashout
                </button>
              </form>
              {!canCashout && (
                <p className="mt-3 text-xs text-gray-500">Cashout unlocks when balance reaches the minimum amount and a payout method is saved.</p>
              )}
              <div className="mt-5 space-y-2">
                {data.withdrawals.slice(0, 5).map((request) => (
                  <div key={request.id} className="rounded-xl border px-3 py-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span>{formatCurrency(request.amount)}</span>
                      <span>{request.status}</span>
                    </div>
                    <p className="mt-1 text-gray-500">{request.requestedAt ? formatDate(request.requestedAt) : ""}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h3 className="font-semibold">Commission History</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-[#FBF8F2] text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Order</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Commission</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-3 py-3">{item.createdAt ? formatDate(item.createdAt) : "-"}</td>
                      <td className="px-3 py-3">{item.orderNumber || item.orderId || "-"}</td>
                      <td className="px-3 py-3">{item.productName || "-"}</td>
                      <td className="px-3 py-3">{formatCurrency(item.commissionAmount)}</td>
                      <td className="px-3 py-3">{item.status}</td>
                    </tr>
                  ))}
                  {!data.ledger.length && (
                    <tr>
                      <td colSpan="5" className="px-3 py-8 text-center text-gray-500">No commission entries yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EmbeddedOrders({ orders, currentUser, onReorder, onTrack }) {
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    reviewText: "",
  });
  const [reviewImages, setReviewImages] = useState([]);

  const filteredOrders = orders.filter((order) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "progress" && order.status !== "Delivered" && order.status !== "Cancelled") ||
      (activeTab === "delivered" && order.status === "Delivered") ||
      (activeTab === "cancelled" && order.status === "Cancelled");

    const normalizedQuery = query.trim().toLowerCase();
    const matchesSearch =
      !normalizedQuery ||
      order.id.toLowerCase().includes(normalizedQuery) ||
      order.items.some((item) => item.name.toLowerCase().includes(normalizedQuery));

    return matchesTab && matchesSearch;
  });

  const handleInvoice = async (order) => {
    try {
      setNotice("");
      await downloadOrderInvoice(order.id, {
        email: order.customer?.email || currentUser?.email,
        phone: order.customer?.phoneNumber || currentUser?.phone,
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

  return (
    <div className="bg-[#F6F6F6] mt-6 rounded-2xl px-4 md:px-6 py-6">
      <div className="flex flex-col md:flex-row md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Order History</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            View your past orders, track shipments, and reorder your essentials.
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by Order ID or Product"
          className="w-full md:w-72 rounded-xl border bg-white px-4 py-2 text-sm"
        />
      </div>
      <div className="mt-5 flex gap-2 flex-wrap">
        {[
          ["all", "All Orders"],
          ["progress", "In Progress"],
          ["delivered", "Delivered"],
          ["cancelled", "Cancelled"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-full text-xs md:text-sm ${
              activeTab === key ? "bg-[#C2863F] text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
          {notice}
        </div>
      )}

      <div className="bg-white mt-6 p-5 rounded-2xl shadow-sm space-y-4">
        {filteredOrders.length ? (
          filteredOrders.map((order) => (
            <div key={order.id} className="border rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-4">
                <div className="flex gap-6 text-[11px] text-gray-500 flex-wrap">
                  <div>
                    <p>ORDER ID</p>
                    <p className="text-black font-medium">{order.id}</p>
                  </div>
                  <div>
                    <p>PLACED ON</p>
                    <p className="text-black">{formatDate(order.createdAt)}</p>
                  </div>
                  <div>
                    <p>TOTAL PRICE</p>
                    <p className="text-black">{formatCurrency(order.total)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    onClick={() => handleInvoice(order)}
                    className="flex items-center gap-1 rounded-md border border-[#C2863F] px-3 py-1.5 text-[#C2863F]"
                  >
                    <img src={documentIcon} className="w-4" />
                    Download Invoice
                  </button>
                  <div className="flex items-center gap-1 text-gray-600">
                    <img
                      src={
                        order.status === "Delivered"
                          ? deliveredIcon
                          : order.status === "Cancelled"
                          ? cancelIcon
                          : transitIcon
                      }
                      className="w-3"
                    />
                    {order.status}
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {order.items[0]?.name}
                    {order.items.length > 1 ? ` and ${order.items.length - 1} more items` : ""}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Shipment will be updated as the order progresses.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onTrack(order)}
                    className="px-3 py-1.5 rounded-md text-xs border bg-[#C2863F] text-white"
                  >
                    Track Order
                  </button>
                  <button
                    onClick={() => onReorder(order)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs border"
                  >
                    <img src={undoIcon} className="w-3" />
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
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
            No orders found yet.
          </div>
        )}
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
    </div>
  );
}

function EmbeddedAddresses({
  addresses,
  currentUser,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
}) {
  const [draft, setDraft] = useState({
    type: "HOME",
    name: currentUser?.name || "",
    address: "",
    phone: currentUser?.phone || "",
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (editingId) {
      return;
    }

    setDraft((previous) => ({
      ...previous,
      name: previous.name || currentUser?.name || "",
      phone: previous.phone || currentUser?.phone || "",
    }));
  }, [currentUser?.name, currentUser?.phone, editingId]);

  const submitAddress = () => {
    if (!draft.name.trim() || !draft.address.trim() || !draft.phone.trim()) {
      return;
    }

    if (editingId) {
      updateAddress(editingId, draft);
      setEditingId(null);
    } else {
      addAddress(draft);
    }

    setDraft({
      type: "HOME",
      name: currentUser?.name || "",
      address: "",
      phone: currentUser?.phone || "",
    });
  };

  return (
    <div className="bg-gray-100 mt-6 rounded-2xl p-4 md:p-8">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xl font-semibold">Saved Addresses</h2>
        <span className="text-sm text-black bg-white px-3 py-1 rounded-full">
          {addresses.length} Saved Locations
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Manage your shipping and billing locations for a faster checkout experience.
      </p>

      <div className="grid gap-4 md:grid-cols-[1.2fr_2fr]">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{editingId ? "Edit Address" : "Add New Address"}</h3>
          <div className="mt-4 space-y-3">
            <select
              value={draft.type}
              onChange={(event) => setDraft((previous) => ({ ...previous, type: event.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option>HOME</option>
              <option>WORK</option>
              <option>OTHER</option>
            </select>
            <Field
              label="Name"
              value={draft.name}
              onChange={(value) => setDraft((previous) => ({ ...previous, name: value }))}
            />
            <Field
              label="Address"
              value={draft.address}
              onChange={(value) => setDraft((previous) => ({ ...previous, address: value }))}
            />
            <Field
              label="Phone"
              value={draft.phone}
              onChange={(value) => setDraft((previous) => ({ ...previous, phone: value }))}
            />
            <button
              onClick={submitAddress}
              className="w-full rounded-lg bg-[#C2863F] px-4 py-2 text-sm text-white"
            >
              {editingId ? "Save Address" : "Add Address"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => {
            const icon =
              address.type === "HOME" ? homeIcon : address.type === "WORK" ? workIcon : boxIcon;

            return (
              <div key={address.id} className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <img src={icon} className="w-4 h-4" />
                    {address.type}
                  </div>
                  {address.isDefault && (
                    <span className="text-xs bg-[#C2863F] text-white px-2 py-1 rounded">
                      Default
                    </span>
                  )}
                </div>
                <h3 className="font-semibold">{address.name}</h3>
                <div className="flex gap-2 text-sm text-gray-600 mt-1">
                  <img src={addressIcon} className="w-4 h-4 mt-1" />
                  <p>{address.address}</p>
                </div>
                <div className="flex gap-2 text-sm text-gray-600 mt-1">
                  <img src={phoneIcon} className="w-4 h-4" />
                  <p>{address.phone}</p>
                </div>
                <div className="flex justify-between items-center mt-3 text-sm">
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setEditingId(address.id);
                        setDraft({
                          type: address.type,
                          name: address.name,
                          address: address.address,
                          phone: address.phone,
                        });
                      }}
                      className="flex items-center gap-1"
                    >
                      <img src={editIcon} className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteAddress(address.id)}
                      className="flex items-center gap-1 text-red-500"
                    >
                      <img src={deleteIcon} className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                  <button
                    onClick={() => setDefaultAddress(address.id)}
                    className="text-black text-xs"
                  >
                    Set Default
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl flex gap-3 text-black bg-[#C2863F]">
        <img src={warrantyIcon} className="w-5 h-5 mt-1" />
        <p className="text-sm text-white">
          We recommend keeping your primary residential address as default to
          ensure smooth order processing.
        </p>
      </div>
    </div>
  );
}

function EmbeddedWishlist({
  wishlistItems,
  clearWishlist,
  removeFromWishlist,
  addToCart,
  navigate,
}) {
  return (
    <div className="mt-6 px-3 md:px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
        <div>
          <h2 className="text-lg font-semibold">My Wishlist</h2>
          <p className="text-xs text-gray-500">
            You have {wishlistItems.length} item{wishlistItems.length === 1 ? "" : "s"} saved for later.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => navigate("/writing-essentials")}
            className="px-4 py-2 rounded-lg text-xs md:text-sm bg-gray-200 text-black"
          >
            Continue Shopping
          </button>
          <button
            onClick={() => {
              wishlistItems.forEach((item) => addToCart(item, 1));
              clearWishlist();
              navigate("/cart");
            }}
            className="px-4 py-2 rounded-lg text-xs md:text-sm flex items-center gap-2 bg-[#C2863F] text-white"
          >
            Add All to Cart
            <img src={rightArrow} className="w-3" />
          </button>
        </div>
      </div>

      {wishlistItems.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {wishlistItems.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50">
                {item.imageUrl ? (
                  <img src={item.imageUrl} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm text-gray-400">No image</span>
                )}
              </div>
              <p className="mt-3 text-[10px] text-gray-400 uppercase">{item.categoryName}</p>
              <h3 className="text-sm font-semibold leading-tight">{item.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="font-semibold">{formatCurrency(item.price)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    addToCart(item, 1);
                    removeFromWishlist(item.id);
                  }}
                  className="flex-1 bg-[#C2863F] text-white py-2 rounded-lg text-xs"
                >
                  Move to Cart
                </button>
                <button
                  onClick={() => removeFromWishlist(item.id)}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          Your wishlist is empty.
        </div>
      )}
    </div>
  );
}

function EmbeddedTrackOrder({ orders, currentUser, navigate }) {
  const [query, setQuery] = useState("");
  const [contact, setContact] = useState(currentUser?.email || currentUser?.phone || "");
  const [selectedOrder, setSelectedOrder] = useState(orders[0] || null);

  useEffect(() => {
    setContact(currentUser?.email || currentUser?.phone || "");
  }, [currentUser?.email, currentUser?.phone]);

  useEffect(() => {
    setSelectedOrder((previous) => previous || orders[0] || null);
  }, [orders]);

  const handleTrack = () => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedContact = contact.trim().toLowerCase();

    const match = orders.find((order) => {
      const matchesOrder =
        !normalizedQuery || order.id.toLowerCase().includes(normalizedQuery);
      const customerEmail = order.customer?.email?.toLowerCase() || "";
      const customerPhone = order.customer?.phoneNumber?.toLowerCase() || "";
      const matchesContact =
        !normalizedContact ||
        customerEmail.includes(normalizedContact) ||
        customerPhone.includes(normalizedContact);

      return matchesOrder && matchesContact;
    });

    setSelectedOrder(match || null);
  };

  const steps = [
    { label: "Order Placed", done: Boolean(selectedOrder) },
    { label: "Packed", done: Boolean(selectedOrder) },
    {
      label: "Shipped",
      active: selectedOrder?.status === "Processing",
      done: selectedOrder?.status === "Delivered",
    },
    { label: "Out for Delivery", done: selectedOrder?.status === "Delivered" },
    { label: "Delivered", done: selectedOrder?.status === "Delivered" },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 mt-6 p-3 md:p-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Track Your Order</h1>
        <p className="text-sm text-gray-500">
          Enter your order details to see real-time updates on your shipment.
        </p>
        <div className="bg-gray-100 p-3 rounded-xl mt-3 flex flex-col md:flex-row gap-2 items-center">
          <div className="w-full">
            <p className="text-xs text-gray-600 mb-1">Order ID</p>
            <div className="flex items-center bg-white px-3 py-2 rounded-lg border w-full">
              <img src={trackIcon} className="w-4 mr-2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={orders[0]?.id || "LM-8892410"}
                className="outline-none text-sm w-full"
              />
            </div>
          </div>
          <div className="w-full">
            <p className="text-xs text-gray-600 mb-1">Phone Number / Email</p>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="name@example.com"
              className="px-3 py-2 rounded-lg border w-full text-sm"
            />
          </div>
          <button
            onClick={handleTrack}
            className="px-5 py-2 mt-4 rounded-lg text-white text-sm whitespace-nowrap bg-[#C2863F]"
          >
            Track Status
          </button>
        </div>
      </div>

      {!selectedOrder ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          No matching order found.
        </div>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden shadow-sm border">
            <div
              className="flex justify-between items-center p-4"
              style={{ background: "linear-gradient(180deg, #FFFFFFFF 0%, #FFF49CFF 100%)" }}
            >
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-full">
                  <img src={transitIcon} className="w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">
                    {selectedOrder.status === "Delivered" ? "Delivered" : "On the way"}
                  </h2>
                  <p className="text-xs text-gray-600">
                    Latest status for Order {selectedOrder.id}
                  </p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-[#C2863F] text-white">
                {selectedOrder.status}
              </span>
            </div>
            <div className="px-3 py-5 bg-[#FFF8C7]">
              <div className="flex justify-between items-center relative">
                <div className="absolute top-4 left-0 right-0 h-[2px] bg-gray-300" />
                {steps.map((step, i) => (
                  <div key={i} className="flex flex-col items-center w-full z-10">
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full ${
                        step.active
                          ? "bg-white border-2 border-black"
                          : step.done
                          ? "bg-[#404C31]"
                          : "bg-gray-300"
                      }`}
                    >
                      {step.done ? (
                        <img src={checkIcon} className="w-4 invert" />
                      ) : (
                        <img src={transitIcon} className="w-4 opacity-60" />
                      )}
                    </div>
                    <p className="text-[10px] md:text-xs mt-2 text-center">{step.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border">
              <h3 className="font-semibold mb-3">Shipment Details</h3>
              <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
                <div className="flex gap-2">
                  <img src={addressIcon} className="w-3 h-3 mt-1" />
                  <div>
                    {selectedOrder.customer?.firstName || currentUser?.name || "Customer"}
                    <br />
                    {selectedOrder.customer?.streetAddress || "Address pending"}
                    <br />
                    {selectedOrder.customer?.city || ""} {selectedOrder.customer?.state || ""}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Carrier</p>
                  <p>Standard Express</p>
                </div>
                <div className="bg-gray-100 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Tracking ID</p>
                  <p>{selectedOrder.id}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border">
              <div className="flex justify-between mb-3">
                <h3 className="font-semibold">Order Summary</h3>
                <span className="text-xs text-[#C2863F]">View Invoice</span>
              </div>
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="flex justify-between mb-3">
                  <div className="flex gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-50">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} className="h-full w-full rounded object-contain" />
                      ) : (
                        <img src={boxIcon} className="w-5" />
                      )}
                    </div>
                    <div className="text-xs">
                      {item.name}
                      <br />
                      <span className="text-gray-500">Qty: {item.quantity}</span>
                    </div>
                  </div>
                  {formatCurrency(item.price * item.quantity)}
                </div>
              ))}
              <div className="flex justify-between border-t mt-3 pt-3 font-semibold">
                <p>Total Paid</p>
                <p>{formatCurrency(selectedOrder.total)}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#C2863F] text-white p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-3">
            <div>
              <p className="font-medium flex items-center gap-2">
                <img src={questionIcon} className="w-4" />
                Need assistance with your shipment?
              </p>
              <p className="text-xs opacity-90">Our support team is available 24/7 to help you.</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={() => navigate("/faqs")}
                className="px-3 py-1 rounded-lg text-sm bg-white text-black"
              >
                Check FAQs
              </button>
              <button
                type="button"
                onClick={() => navigate("/contact")}
                className="px-3 py-1 rounded-lg text-sm bg-[#404C31] text-white"
              >
                Contact Support
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <h3 className="font-semibold p-4 border-b">Recent Updates</h3>
            {[
              `Order created on ${formatDate(selectedOrder.createdAt)}`,
              `Current status: ${selectedOrder.status}`,
              "The delivery team will contact you before arrival.",
            ].map((message, index) => (
              <div key={index} className="flex justify-between items-center px-4 py-3 border-b last:border-none">
                <div className="flex gap-3">
                  <img src={clockIcon} className="w-3 h-3 mt-1" />
                  <div className="text-sm">
                    <p>{message}</p>
                    <span className="text-xs text-gray-500">{formatDate(selectedOrder.createdAt)}</span>
                  </div>
                </div>
                <img src={chevron} className="w-4 opacity-60" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </div>
  );
}

export default Profile;
