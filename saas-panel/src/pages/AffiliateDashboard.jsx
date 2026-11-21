import React, { useEffect, useMemo, useState } from "react";
import {
  createAffiliateLink,
  createAffiliatePayoutMethod,
  createAffiliateWithdrawal,
  getAffiliateDashboard,
} from "../lib/adminApi";

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function Card({ label, value, tone }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.blue}`}>
      <p className="text-xs uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function AffiliateDashboard() {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [linkForm, setLinkForm] = useState({ targetType: "site", targetId: "", path: "/" });
  const [payoutForm, setPayoutForm] = useState({
    methodType: "UPI",
    accountHolder: "",
    upiId: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
  });
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      setDashboard(await getAffiliateDashboard());
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Unable to load affiliate dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const wallet = dashboard?.wallet || {};
  const code = dashboard?.code || "";
  const methods = dashboard?.payoutMethods || [];
  const minimumCashout = Number(dashboard?.settings?.minimum_cashout || 0);
  const available = Number(wallet.available || 0);
  const canWithdraw = available >= minimumCashout && methods.length > 0;

  const defaultLink = useMemo(() => {
    if (!code) return "";
    const base = typeof window !== "undefined" ? window.location.origin.replace("admin.", "") : "https://goldencreation.in";
    const path = linkForm.path || "/";
    return `${base}${path.startsWith("/") ? path : `/${path}`}?aff=${encodeURIComponent(code)}`;
  }, [code, linkForm.path]);

  const generateLink = async (event) => {
    event.preventDefault();
    try {
      const response = await createAffiliateLink(linkForm);
      const link = response.link || defaultLink;
      await navigator.clipboard?.writeText(link);
      setNotice("Affiliate link copied.");
    } catch (error) {
      setNotice(error.message || "Unable to generate link");
    }
  };

  const savePayout = async (event) => {
    event.preventDefault();
    try {
      await createAffiliatePayoutMethod(payoutForm);
      setNotice("Payout method saved.");
      await refresh();
    } catch (error) {
      setNotice(error.message || "Unable to save payout method");
    }
  };

  const requestWithdrawal = async (event) => {
    event.preventDefault();
    try {
      await createAffiliateWithdrawal({ amount: Number(withdrawAmount) });
      setWithdrawAmount("");
      setNotice("Cashout request sent to admin.");
      await refresh();
    } catch (error) {
      setNotice(error.message || "Unable to request cashout");
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Your code</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-bold tracking-[0.12em] text-[#C2863F]">{code || "--"}</h2>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(defaultLink)}
            className="rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white"
          >
            Copy Site Link
          </button>
        </div>
      </div>

      {notice && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>}

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">Loading affiliate dashboard...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card label="Available" value={money(wallet.available)} tone="green" />
            <Card label="Pending" value={money(wallet.pending)} tone="amber" />
            <Card label="Paid" value={money(wallet.paid)} tone="blue" />
            <Card label="Rejected / Reversed" value={money(Number(wallet.reversed || 0) + Number(wallet.rejected || 0))} tone="red" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Link Generator</h3>
              <form onSubmit={generateLink} className="mt-4 space-y-3">
                <select
                  value={linkForm.targetType}
                  onChange={(event) => setLinkForm({ ...linkForm, targetType: event.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="site">Website</option>
                  <option value="product">Product</option>
                  <option value="category">Category</option>
                  <option value="app">App</option>
                </select>
                <input
                  value={linkForm.targetId}
                  onChange={(event) => setLinkForm({ ...linkForm, targetId: event.target.value })}
                  placeholder="Product or category ID, optional"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
                <input
                  value={linkForm.path}
                  onChange={(event) => setLinkForm({ ...linkForm, path: event.target.value })}
                  placeholder="/product/slug or /category/slug"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
                <p className="break-all rounded-xl bg-[#FBF8F2] p-3 text-xs text-gray-600">{defaultLink}</p>
                <button className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white">Generate & Copy</button>
              </form>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Payout Method</h3>
              <p className="mt-1 text-xs text-gray-500">
                Payment details are provided by you and will be used for manual payout processing. Please ensure the UPI ID or bank details are correct.
              </p>
              <form onSubmit={savePayout} className="mt-4 grid gap-3">
                <select
                  value={payoutForm.methodType}
                  onChange={(event) => setPayoutForm({ ...payoutForm, methodType: event.target.value })}
                  className="rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank Account</option>
                </select>
                <input value={payoutForm.accountHolder} onChange={(event) => setPayoutForm({ ...payoutForm, accountHolder: event.target.value })} placeholder="Account holder name" className="rounded-xl border px-3 py-2 text-sm" />
                {payoutForm.methodType === "UPI" ? (
                  <input value={payoutForm.upiId} onChange={(event) => setPayoutForm({ ...payoutForm, upiId: event.target.value })} placeholder="UPI ID" className="rounded-xl border px-3 py-2 text-sm" />
                ) : (
                  <>
                    <input value={payoutForm.bankName} onChange={(event) => setPayoutForm({ ...payoutForm, bankName: event.target.value })} placeholder="Bank name" className="rounded-xl border px-3 py-2 text-sm" />
                    <input value={payoutForm.accountNumber} onChange={(event) => setPayoutForm({ ...payoutForm, accountNumber: event.target.value })} placeholder="Account number" className="rounded-xl border px-3 py-2 text-sm" />
                    <input value={payoutForm.ifsc} onChange={(event) => setPayoutForm({ ...payoutForm, ifsc: event.target.value })} placeholder="IFSC" className="rounded-xl border px-3 py-2 text-sm" />
                  </>
                )}
                <button className="rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">Save Method</button>
              </form>
            </section>
          </div>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Cashout</h3>
                <p className="text-sm text-gray-500">Minimum cashout: {money(minimumCashout)}</p>
              </div>
              <form onSubmit={requestWithdrawal} className="flex flex-col gap-2 sm:flex-row">
                <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} type="number" min="1" placeholder="Amount" className="rounded-xl border px-3 py-2 text-sm" />
                <button disabled={!canWithdraw} className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Request Cashout</button>
              </form>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Recent Commission</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Order</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.ledger || []).map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-3 py-3">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "-"}</td>
                      <td className="px-3 py-3">{item.orderNumber || item.orderId || "-"}</td>
                      <td className="px-3 py-3">{item.productName || "-"}</td>
                      <td className="px-3 py-3">{money(item.commissionAmount)}</td>
                      <td className="px-3 py-3">{item.status}</td>
                    </tr>
                  ))}
                  {!(dashboard?.ledger || []).length && (
                    <tr>
                      <td colSpan="5" className="px-3 py-8 text-center text-gray-500">No earnings yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
