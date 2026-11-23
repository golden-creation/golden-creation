import React, { useEffect, useMemo, useState } from "react";
import { getAdminReports } from "../lib/adminApi";
import { formatQuantity } from "../lib/formatQuantity";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

function Reports() {
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadReports = async (nextFilters = {}) => {
    try {
      setLoading(true);
      setMessage("");
      setReports(await getAdminReports({
        period,
        from,
        to,
        ...nextFilters,
      }));
    } catch (error) {
      setMessage(error.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const filteredFastMoving = useMemo(() => {
    const list = reports?.fastMoving || [];
    const value = query.trim().toLowerCase();
    if (!value) return list;

    return list.filter((item) =>
      `${item.name} ${item.category} ${item.velocity}`.toLowerCase().includes(value)
    );
  }, [reports, query]);

  const downloadReport = () => {
    const rows = [
      ["Metric", "Value"],
      ["Revenue", reports?.salesSummary?.totalRevenue || 0],
      ["Orders", reports?.salesSummary?.totalOrders || 0],
      ["Average Ticket", reports?.salesSummary?.avgTicket || 0],
      ["Tax Collected", reports?.taxSummary?.totalTaxCollected || 0],
      ["Stock Valuation", reports?.salesSummary?.stockValuation || 0],
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lekhanmart-report.csv";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Report downloaded.");
  };

  const applyPeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    setFrom("");
    setTo("");
    loadReports({ period: nextPeriod, from: "", to: "" });
  };

  const summary = reports?.salesSummary || {};
  const tax = reports?.taxSummary || {};

  if (loading && !reports) {
    return <div className="grid min-h-screen place-items-center bg-[#F8F6F2]">Loading reports...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports Dashboard</h1>
          <p className="text-sm text-gray-500">
            Real sales, tax, payment, stock, and product movement reports.
          </p>
          {message && <p className="mt-1 text-sm text-[#8a5b16]">{message}</p>}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products..."
            className="rounded-lg border bg-white px-3 py-2 text-sm lg:w-64"
          />
          <div className="flex flex-wrap gap-2">
            {["today", "weekly", "monthly"].map((item) => (
              <button
                key={item}
                onClick={() => applyPeriod(item)}
                className={`rounded-lg px-3 py-2 text-sm capitalize ${
                  period === item && !from && !to ? "bg-[#A68B5B] text-white" : "bg-white shadow"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          />
          <button onClick={() => loadReports()} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
            Apply
          </button>
          <button onClick={downloadReport} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Download
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Revenue" value={money(summary.totalRevenue)} />
        <Metric label="Orders" value={summary.totalOrders || 0} />
        <Metric label="Avg Ticket" value={money(summary.avgTicket)} />
        <Metric label="Tax Collected" value={money(tax.totalTaxCollected)} />
        <Metric label="Stock Valuation" value={money(summary.stockValuation)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-xl bg-white p-4 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sales Trend</h2>
            <span className="text-xs text-gray-500">
              {reports?.filters?.start} to {reports?.filters?.end}
            </span>
          </div>
          <BarChart rows={reports?.dailySales || []} labelKey="date" valueKey="revenue" valueFormatter={money} />
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">Payment Split</h2>
          <PieChart rows={reports?.paymentBreakdown || []} />
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">Category Revenue</h2>
          <BarChart rows={reports?.categorySales || []} labelKey="label" valueKey="value" valueFormatter={money} />
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">Order Status</h2>
          <PieChart rows={reports?.statusBreakdown || []} />
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ReportTable
          title="Fast Moving Items"
          headers={["Product", "Category", "Qty Sold", "Revenue", "Velocity"]}
          rows={filteredFastMoving}
          renderRow={(item) => [item.name, item.category, formatQuantity(item.qtySold) || "0", money(item.revenue), item.velocity]}
        />
        <ReportTable
          title="Slow Moving Items"
          headers={["Product", "Stock", "Last Sale", "Aging"]}
          rows={reports?.slowMoving || []}
          renderRow={(item) => [item.name, formatQuantity(item.stock) || "0", item.lastSale, item.aging]}
        />
      </div>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-4 text-lg font-semibold">Low Stock Alerts</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b text-left text-gray-500">
              <tr>
                <th className="p-3">Product</th>
                <th>Current Stock</th>
                <th>Threshold</th>
                <th>Gap</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(reports?.lowStockAlerts || []).map((item) => (
                <tr key={item.name} className="border-b">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="text-red-600">{formatQuantity(item.stock) || "0"}</td>
                  <td>{formatQuantity(item.threshold) || "0"}</td>
                  <td>{formatQuantity(item.gap) || "0"}</td>
                  <td>
                    <span className={`rounded-full px-2 py-1 text-xs ${item.action === "Critical" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}>
                      {item.action}
                    </span>
                  </td>
                </tr>
              ))}
              {!reports?.lowStockAlerts?.length && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No low stock rows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BarChart({ rows, labelKey, valueKey, valueFormatter = (value) => value }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0);
        const width = Math.max(3, Math.round((value / max) * 100));
        return (
          <div key={`${row[labelKey]}-${value}`}>
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>{row[labelKey]}</span>
              <span>{valueFormatter(value)}</span>
            </div>
            <div className="h-3 rounded bg-gray-100">
              <div className="h-3 rounded bg-[#A68B5B]" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
      {!rows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">No chart data found.</div>}
    </div>
  );
}

function PieChart({ rows }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const colors = ["#A68B5B", "#C2863F", "#404C31", "#FFF49C", "#9CA3AF", "#D6BE8C"];
  let cursor = 0;
  const gradient = rows.length
    ? rows.map((row, index) => {
        const start = cursor;
        const slice = total ? (Number(row.value || 0) / total) * 100 : 0;
        cursor += slice;
        return `${colors[index % colors.length]} ${start}% ${cursor}%`;
      }).join(", ")
    : "#E5E7EB 0% 100%";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
      <div
        className="mx-auto h-40 w-40 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: colors[index % colors.length] }} />
              {row.label}
            </span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-gray-500">No chart data found.</p>}
      </div>
    </div>
  );
}

function ReportTable({ title, headers, rows, renderRow }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              {headers.map((header, index) => (
                <th key={header} className={index === 0 ? "p-3" : ""}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={`${title}-${item.name}`} className="border-b">
                {renderRow(item).map((value, index) => (
                  <td key={`${item.name}-${index}`} className={index === 0 ? "p-3 font-medium" : ""}>{value}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={headers.length} className="p-8 text-center text-gray-500">
                  No rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default Reports;
