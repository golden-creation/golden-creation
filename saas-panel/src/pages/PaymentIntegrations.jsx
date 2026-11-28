import React, { useEffect, useState } from "react";
import {
  getAdminPayments,
  getPaymentSettings,
  updateGstReturnStatus,
  updatePaymentSettings,
} from "../lib/adminApi";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

function PaymentIntegrations() {
  const [data, setData] = useState({
    summary: {},
    integrations: [],
    paymentStats: [],
    taxCollection: [],
    gstReturn: null,
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentConfig, setPaymentConfig] = useState({
    full_online_enabled: false,
    partial_cod_enabled: false,
    full_cod_enabled: false,
    default_partial_percent: 20,
    stock_hold_minutes: 30,
    cod_min_amount: 1000,
    cod_max_amount: 3000,
    partial_cod_above: 3000,
    cod_max_distance_km: 40,
    cod_pin_restricted: false,
    cod_pins: "",
    porter_enabled: false,
    porter_max_distance_km: 40,
    porter_requires_full_payment: true,
    porter_customer_pays_delivery: true,
    porter_pins: "",
    porter_collects_cod: false,
    eligibility_mode: "pin",
    eligible_pins: "",
  });
  const [partialRules, setPartialRules] = useState([]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const response = await getAdminPayments();
      setData(response);
      const config = await getPaymentSettings();
      setPaymentConfig(config.settings || paymentConfig);
      setPartialRules(config.rules || []);
    } catch (error) {
      setMessage(error.message || "Unable to load payment integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const markGstReturn = async (status) => {
    if (!data.gstReturn?.id) {
      setMessage("GST return record is not ready yet.");
      return;
    }

    try {
      await updateGstReturnStatus(data.gstReturn.id, status);
      setMessage(`GST return marked ${status.toLowerCase()}.`);
      await loadPayments();
    } catch (error) {
      setMessage(error.message || "Unable to update GST return");
    }
  };

  const gstReturn = data.gstReturn || {};

  const savePaymentConfig = async () => {
    try {
      await updatePaymentSettings(paymentConfig);
      setMessage("Payment settings updated.");
      await loadPayments();
    } catch (error) {
      setMessage(error.message || "Unable to save payment settings");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payment Integrations</h1>
          <p className="text-sm text-gray-500">
            Track Razorpay, COD, Partial COD, tax collection, and monthly GST return status.
          </p>
        </div>
        <button onClick={loadPayments} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Metric label="Connected" value={data.summary?.connected || 0} />
        <Metric label="Pending" value={data.summary?.pending || 0} tone="warn" />
        <Metric label="Payment Methods" value={data.summary?.paymentMethods || 0} />
        <Metric label="Total Tax Collected" value={money(data.summary?.totalTaxCollected || 0)} />
        <Metric label="Reconciled Revenue" value={money(data.summary?.reconciledRevenue || 0)} />
      </div>

      {loading ? (
        <div className="mt-6 rounded-xl bg-white py-10 text-center text-gray-500 shadow">
          Loading payment data...
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-xl bg-white p-4 shadow">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Checkout Payment Methods</h2>
                <p className="text-sm text-gray-500">Razorpay methods remain hidden until all three server credentials are configured.</p>
                <p className={`mt-2 text-xs font-medium ${paymentConfig.razorpayConfigured ? "text-green-700" : "text-orange-700"}`}>Razorpay: {paymentConfig.razorpayConfigured ? "Configured" : "Disabled - credentials missing"}</p>
                <code className="mt-2 block text-xs text-gray-500">{paymentConfig.webhookUrl}</code>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="Partial COD" checked={Boolean(Number(paymentConfig.partial_cod_enabled))} onChange={(value) => setPaymentConfig({ ...paymentConfig, partial_cod_enabled: value })} disabled={!paymentConfig.razorpayConfigured} />
                <Toggle label="Full COD" checked={Boolean(Number(paymentConfig.full_cod_enabled))} onChange={(value) => setPaymentConfig({ ...paymentConfig, full_cod_enabled: value })} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
              <p>Full Online stays available for every deliverable address.</p>
              <p>The cart merchandise total after product discounts and coupons decides the option, before shipping and extra tax. Below ₹1,000: online only. ₹1,000 to ₹3,000: full COD or online. Above ₹3,000: 20% online and 80% COD, or full online.</p>
              <label className="text-xs text-gray-500">Eligibility mode
                <select value={paymentConfig.eligibility_mode === "road" ? "road" : "pin"} onChange={(event) => setPaymentConfig({ ...paymentConfig, eligibility_mode: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 text-sm">
                  <option value="pin">Delhi-NCR PIN Code</option>
                  <option value="road">40 KM Road Distance</option>
                </select>
              </label>
              <Field label="Stock hold minutes" type="number" value={paymentConfig.stock_hold_minutes} onChange={(value) => setPaymentConfig({ ...paymentConfig, stock_hold_minutes: value })} />
            </div>
            <div className="mt-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Eligible PIN codes</h3>
              <p className="mt-1 text-xs text-gray-500">{paymentConfig.eligibility_mode === "road" ? "Road-distance mode checks a verified driving route of 40.000 km. 40,001 metres is outside the limit. The PIN list is kept for when Delhi-NCR PIN mode is selected again." : "Delhi-NCR PIN mode is active. Cash on Delivery and Porter use this exact post-office list. A city name or a PIN prefix is not enough. HeiGIT routing stays configured and is not called in this mode."}</p>
              <textarea value={paymentConfig.eligible_pins || ""} onChange={(event) => setPaymentConfig({ ...paymentConfig, eligible_pins: event.target.value })} rows={8} className="mt-3 w-full rounded border px-3 py-2 font-mono text-xs" placeholder="One 6-digit PIN code on each line" />
            </div>
            <div className="mt-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Local Delivery via Porter — At Buyer's Cost</h3>
              <p className="mt-1 text-xs text-gray-500">Pickup is Golden Creation, G-38, Baani The Address Shopping Arcade, Sector 56, Golf Course Road, Gurugram. Porter stays manual. The product amount must be paid in full before booking. The customer pays Porter separately, and Porter cannot collect cash. Those rules cannot be turned off.</p>
              <div className="mt-3">
                <Toggle label="Porter Delivery" checked={Boolean(Number(paymentConfig.porter_enabled))} onChange={(value) => setPaymentConfig({ ...paymentConfig, porter_enabled: value })} />
              </div>
            </div>
            <button onClick={savePaymentConfig} className="mt-4 rounded bg-[#A68B5B] px-4 py-2 text-sm text-white">Save payment settings</button>
          </section>

          <section className="mt-6 rounded-xl bg-white p-4 shadow">
            <h2 className="text-lg font-semibold">Partial COD Overrides</h2>
            <p className="text-sm text-gray-500">Older override rows stay on record and cannot change checkout. The advance is 20% when the cart merchandise total is above ₹3,000.</p>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="border-b text-left text-gray-500"><tr><th className="p-2">Target</th><th>Percentage</th><th>Eligible</th><th>Priority</th></tr></thead><tbody>{partialRules.map((rule) => <tr key={rule.id} className="border-b"><td className="p-2">{rule.target_type} #{rule.target_id}</td><td>{rule.percentage ?? "Default"}%</td><td>{Number(rule.eligible) ? "Yes" : "No"}</td><td>{rule.priority}</td></tr>)}</tbody></table></div>
          </section>

          <section className="mt-6 rounded-xl bg-white p-4 shadow">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Current Month GST Return</h2>
                <p className="text-sm text-gray-500">
                  {gstReturn.period_start ? new Date(gstReturn.period_start).toLocaleDateString("en-IN") : "-"} to{" "}
                  {gstReturn.period_end ? new Date(gstReturn.period_end).toLocaleDateString("en-IN") : "-"}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[560px]">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">GST Return Amount</p>
                  <p className="mt-1 text-xl font-semibold">{money(gstReturn.total_tax)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${gstReturn.status === "Paid" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"}`}>
                    {gstReturn.status || "Pending"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => markGstReturn("Paid")} className="rounded-lg bg-[#A68B5B] px-3 py-2 text-sm text-white">
                    Mark Paid
                  </button>
                  <button onClick={() => markGstReturn("Pending")} className="rounded-lg border px-3 py-2 text-sm">
                    Pending
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
            <section className="rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">Providers</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(data.integrations || []).map((integration) => (
                  <div key={integration.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{integration.provider}</p>
                        <p className="text-xs text-gray-500">{integration.mode} mode</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs ${integration.status === "Connected" ? "bg-green-50 text-green-700" : integration.status === "Disabled" ? "bg-gray-100 text-gray-600" : "bg-orange-50 text-orange-700"}`}>
                        {integration.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-500">{integration.config_summary}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      Last checked: {integration.last_checked_at ? new Date(integration.last_checked_at).toLocaleString("en-IN") : "-"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">Payment Split</h2>
              <div className="space-y-3">
                {(data.paymentStats || []).map((stat) => (
                  <div key={stat.method} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{stat.method}</p>
                      <span className="text-sm text-gray-500">{stat.orders} orders</span>
                    </div>
                    <p className="mt-2 text-lg font-semibold">{money(stat.revenue)}</p>
                  </div>
                ))}
                {!data.paymentStats?.length && (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                    No order payments recorded yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Order-wise Tax Collection</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr>
                    <th className="p-3">Order</th>
                    <th>Customer</th>
                    <th>Payment</th>
                    <th>Tax</th>
                    <th>Order Total</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.taxCollection || []).map((order) => (
                    <tr key={order.id} className="border-b">
                      <td className="p-3 font-medium">{order.order_number}</td>
                      <td>{order.customer_name || order.customer_email || "Customer"}</td>
                      <td>{order.payment_method || "Unknown"}</td>
                      <td className="font-medium text-[#A68B5B]">{money(order.tax_amount)}</td>
                      <td>{money(order.total_amount)}</td>
                      <td>{order.order_status}</td>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN") : "-"}</td>
                    </tr>
                  ))}
                  {!data.taxCollection?.length && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-500">
                        No tax collection rows found.
                      </td>
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

function Metric({ label, value, tone = "normal" }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone === "warn" ? "text-orange-700" : ""}`}>{value}</p>
    </div>
  );
}

export default PaymentIntegrations;

function Toggle({ label, checked, onChange, disabled = false }) {
  return <label className={`flex items-center justify-between gap-3 rounded border p-3 text-sm ${disabled ? "opacity-50" : ""}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /></label>;
}

function Field({ label, value, onChange, type = "text" }) {
  return <label className="text-xs text-gray-500">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" /></label>;
}
