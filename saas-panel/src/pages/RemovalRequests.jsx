import React, { useEffect, useState } from "react";
import { decideRemovalRequest, getRemovalRequests } from "../lib/adminApi";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN");
}

function RemovalRequests() {
  const [status, setStatus] = useState("Pending");
  const [requests, setRequests] = useState([]);
  const [remarks, setRemarks] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const payload = await getRemovalRequests({ status });
      setRequests(payload.requests || []);
    } catch (error) {
      setMessage(error.message || "Unable to load removal requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [status]);

  const review = async (request, decision) => {
    try {
      const payload = await decideRemovalRequest(request.id, {
        decision,
        remarks: remarks[request.id] || "",
      });
      setMessage(payload.message || `Request ${decision}`);
      await loadRequests();
    } catch (error) {
      setMessage(error.message || "Unable to review request");
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Removal Requests</h1>
          <p className="text-sm text-gray-500">
            Review delete requests raised by admins and staff before anything is removed.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          >
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option value="">All Status</option>
          </select>
          <button onClick={loadRequests} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-4 py-3 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <section className="overflow-x-auto rounded-xl bg-white p-4 shadow">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3">Requested By</th>
              <th className="p-3">Request</th>
              <th className="p-3">Date & Time</th>
              <th className="p-3">Status</th>
              <th className="p-3">Remarks</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  Loading requests...
                </td>
              </tr>
            ) : requests.length ? (
              requests.map((request) => (
                <tr key={request.id} className="border-b last:border-b-0">
                  <td className="p-3">
                    <p className="font-medium">{request.requester_name || "Staff"}</p>
                    <p className="text-xs text-gray-500">{request.requester_email || "-"}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{request.target_label || request.request_path}</p>
                    <p className="text-xs text-gray-500">{request.request_method} {request.request_path}</p>
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDate(request.created_at)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-3 py-1 text-xs ${
                      request.status === "Approved"
                        ? "bg-green-100 text-green-700"
                        : request.status === "Rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {request.status === "Pending" ? (
                      <input
                        value={remarks[request.id] || ""}
                        onChange={(event) => setRemarks((current) => ({ ...current, [request.id]: event.target.value }))}
                        placeholder="Optional admin remarks"
                        className="w-full rounded border px-3 py-2 text-sm"
                      />
                    ) : (
                      <p className="text-sm text-gray-600">{request.remarks || "-"}</p>
                    )}
                  </td>
                  <td className="p-3">
                    {request.status === "Pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => review(request, "rejected")}
                          className="rounded border border-red-200 px-3 py-2 text-xs text-red-600"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => review(request, "approved")}
                          className="rounded bg-[#A68B5B] px-3 py-2 text-xs text-white"
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-gray-500">
                        {request.reviewer_name || "Reviewed"}<br />{formatDate(request.reviewed_at)}
                      </p>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  No removal requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default RemovalRequests;
