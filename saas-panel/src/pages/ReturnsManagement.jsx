import React, { useEffect, useState } from "react";
import { getAdminReturns, updateAdminReturn } from "../lib/adminApi";

const returnStatuses = ["Requested", "Approved", "Return Scheduled", "Picked Up", "Received", "Refund Done", "Rejected", "Cancelled"];
const replacementStatuses = ["Requested", "Approved", "Pickup Scheduled", "Picked Up", "Received", "Replacement Dispatched", "Replacement In Transit", "Replacement Delivered", "Rejected", "Cancelled"];

export default function ReturnsManagement() {
  const [requests, setRequests] = useState([]); const [remarks, setRemarks] = useState({}); const [message, setMessage] = useState("");
  const load = async () => { try { const data = await getAdminReturns(); setRequests(data.requests || []); } catch (error) { setMessage(error.message); } };
  useEffect(() => { load(); }, []);
  const update = async (item, status) => { await updateAdminReturn(item.id, { status, internalRemarks: remarks[item.id] ?? item.internal_remarks }); setMessage("Request updated."); await load(); };
  return <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6"><h1 className="text-2xl font-semibold">Returns & Replacements</h1><p className="text-sm text-gray-500">Internal remarks remain visible only in this panel.</p>{message && <p className="mt-4 rounded bg-amber-50 p-3 text-sm">{message}</p>}<section className="mt-5 overflow-x-auto rounded bg-white p-4 shadow"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="p-2">Order</th><th>Customer</th><th>Type</th><th>Reason</th><th>Internal remarks</th><th>Status</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.order_number}</td><td>{item.customer_name}<br /><span className="text-xs text-gray-500">{item.customer_email || item.customer_phone}</span></td><td>{item.request_type}</td><td>{item.reason}</td><td><input value={remarks[item.id] ?? item.internal_remarks ?? ""} onChange={(event) => setRemarks({ ...remarks, [item.id]: event.target.value })} className="w-56 rounded border px-2 py-1" /></td><td><select value={item.status} onChange={(event) => update(item, event.target.value)} className="rounded border px-2 py-1">{(item.request_type === "Replacement" ? replacementStatuses : returnStatuses).map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></section></main>;
}
