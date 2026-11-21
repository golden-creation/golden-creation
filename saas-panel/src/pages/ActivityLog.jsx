import React, { useEffect, useMemo, useState } from "react";
import { getAdminActivity } from "../lib/adminApi";

const initialFilters = {
  from: "",
  to: "",
  module: "",
  actor: "",
};

function ActivityLog({ admin }) {
  const [filters, setFilters] = useState(initialFilters);
  const [activity, setActivity] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isAdmin = String(admin?.role || "").toLowerCase().includes("admin");

  const loadActivity = async (nextFilters = filters) => {
    if (!isAdmin) {
      setLoading(false);
      setMessage("Only admin users can view the full activity log.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const response = await getAdminActivity(nextFilters);
      setActivity(response.activity || []);
      setModules(response.modules || []);
    } catch (error) {
      setMessage(error.message || "Unable to load activity log.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const groupedActivity = useMemo(() => {
    return activity.reduce((groups, item) => {
      const key = item.created_at
        ? new Date(item.created_at).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Unknown date";

      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [activity]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyFilters = () => {
    loadActivity(filters);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    loadActivity(initialFilters);
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 text-[13px] md:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-950">Activity Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Admin-only monitoring for login, logout, billing, warehouse, product, shipping, and staff actions.
          </p>
        </div>
        <button onClick={() => loadActivity()} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <section className="rounded-xl bg-white p-4 shadow">
        <div className="grid gap-3 md:grid-cols-[160px_160px_180px_1fr_auto_auto] md:items-end">
          <Field label="From" type="date" value={filters.from} onChange={(value) => updateFilter("from", value)} />
          <Field label="To" type="date" value={filters.to} onChange={(value) => updateFilter("to", value)} />
          <label className="text-sm">
            <span className="text-xs text-gray-500">Module</span>
            <select
              value={filters.module}
              onChange={(event) => updateFilter("module", event.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </label>
          <Field label="Actor" value={filters.actor} onChange={(value) => updateFilter("actor", value)} placeholder="Email or name" />
          <button onClick={applyFilters} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
            Apply
          </button>
          <button onClick={clearFilters} className="rounded-lg border px-4 py-2 text-sm">
            Clear
          </button>
        </div>
      </section>

      <section className="mt-5 rounded-xl bg-white shadow">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">Recorded Activity</h2>
          <span className="rounded-full bg-[#FFF49C] px-3 py-1 text-xs text-[#6E4D13]">
            {activity.length} events
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading activity...</div>
        ) : activity.length ? (
          <div className="max-h-[68vh] overflow-y-auto p-4">
            {Object.entries(groupedActivity).map(([date, items]) => (
              <div key={date} className="mb-6 last:mb-0">
                <div className="sticky top-0 z-10 mb-3 bg-white py-1">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {date}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="border-b text-left text-xs text-gray-500">
                      <tr>
                        <th className="p-3">Time</th>
                        <th>Actor</th>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="p-3 whitespace-nowrap text-gray-500">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </td>
                          <td className="font-medium">{item.actor || "System"}</td>
                          <td>
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                              {item.module || "Admin"}
                            </span>
                          </td>
                          <td>{item.action}</td>
                          <td className="text-gray-500">{item.detail || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-500">No activity found for the selected filters.</div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

export default ActivityLog;
