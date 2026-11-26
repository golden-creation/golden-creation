import React, { useEffect, useState } from "react";
import { API_BASE_URL, apiRequest, getAdminToken } from "../lib/api";

const VIEWS = {
  live: "Live Activity",
  daily: "Daily Activity History",
  user: "User Activity",
  changes: "Change History",
  login: "Login History",
  security: "Security Activity",
  reports: "Audit Reports",
};

function AuditCenter({ view = "daily" }) {
  const [data, setData] = useState({ events: [], sessions: [], total: 0, page: 1 });
  const [filters, setFilters] = useState({ date: "", user: "", role: "", module: "", page: "", action: "", status: "", q: "" });
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  const load = async (nextPage = page) => {
    const params = new URLSearchParams({ view, page: String(nextPage), limit: "25" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      setData(await apiRequest(`/admin/audit/events?${params.toString()}`));
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Audit records are unavailable");
    }
  };

  useEffect(() => {
    load(1);
    setPage(1);
  }, [view]);

  const download = async (format) => {
    const params = new URLSearchParams({ view, format });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const response = await fetch(`${API_BASE_URL}/admin/audit/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });
    if (!response.ok) {
      setMessage("Audit export is unavailable");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit.${format === "xlsx" ? "xlsx" : "csv"}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A541E]">Super Admin</p>
          <h1 className="text-2xl font-semibold">{VIEWS[view] || "Audit"}</h1>
          <p className="text-sm text-gray-500">Confirmed backend operations are separate from observed page and click activity. Retention proposal: {data.retentionDays || 365} days.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => download("csv")} className="rounded bg-white px-3 py-2 text-sm shadow">CSV</button>
          <button type="button" onClick={() => download("xlsx")} className="rounded bg-white px-3 py-2 text-sm shadow">Excel</button>
        </div>
      </div>
      {message && <div className="mb-4 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</div>}
      <div className="mb-4 grid gap-2 rounded-xl bg-white p-3 shadow md:grid-cols-4">
        {[
          ["date", "Date"],
          ["user", "User ID"],
          ["role", "Role"],
          ["module", "Module"],
          ["page", "Page"],
          ["action", "Action"],
          ["status", "Status"],
          ["q", "Search"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs text-gray-500">{label}
            <input value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
          </label>
        ))}
        <button type="button" onClick={() => { setPage(1); load(1); }} className="self-end rounded bg-[#A68B5B] px-3 py-2 text-sm text-white">Apply filters</button>
      </div>
      {view === "live" && (
        <div className="mb-4 rounded-xl bg-white p-3 shadow">
          <h2 className="text-sm font-semibold">Active sessions</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {(data.sessions || []).map((session) => (
              <div key={`${session.admin_id}-${session.last_activity}`} className="rounded border p-2 text-sm">
                <p className="font-medium">{session.actor_name || "Unknown"} · {session.actor_role}</p>
                <p className="text-gray-500">Last activity {session.last_activity_ist}</p>
              </div>
            ))}
            {!data.sessions?.length && <p className="text-sm text-gray-500">No active admin session in the last 30 minutes.</p>}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="p-2">IST</th><th>User</th><th>Module</th><th>Action</th><th>Record</th><th>Status</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(data.events || []).map((event) => (
              <tr key={event.id} className="cursor-pointer border-b" onClick={() => setSelected(event)}>
                <td className="p-2">{event.created_at_ist}</td>
                <td>{event.actor_name || "Unknown"}<div className="text-xs text-gray-500">{event.actor_role}</div></td>
                <td>{event.module_name}<div className="text-xs text-gray-500">{event.page_name}</div></td>
                <td>{event.action_name}</td>
                <td>{event.record_name || event.record_id || "-"}</td>
                <td>{event.outcome}</td>
                <td>{event.layer === "confirmed" ? "Confirmed backend" : "Observed interface"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>{data.total || 0} records</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); load(next); }} className="rounded bg-white px-3 py-1 shadow">Previous</button>
          <button type="button" disabled={page * (data.limit || 25) >= (data.total || 0)} onClick={() => { const next = page + 1; setPage(next); load(next); }} className="rounded bg-white px-3 py-1 shadow">Next</button>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold">{selected.action_name}</h2>
            <p className="text-sm text-gray-500">{selected.created_at_ist} · {selected.actor_email} · {selected.ip_address}</p>
            <p className="mt-2 text-sm">{selected.layer === "confirmed" ? "This row records the API outcome." : "This row is interface activity and is not proof of a database change."}</p>
            <h3 className="mt-4 text-sm font-semibold">Changed fields</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(selected.changed_fields || []).map((change) => (
                <li key={change.field} className="rounded border p-2">
                  <p className="font-medium">{change.field}</p>
                  <p>Before: {JSON.stringify(change.before)}</p>
                  <p>After: {JSON.stringify(change.after)}</p>
                </li>
              ))}
              {!selected.changed_fields?.length && <li className="text-gray-500">No field-level before and after snapshot for this event.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditCenter;
