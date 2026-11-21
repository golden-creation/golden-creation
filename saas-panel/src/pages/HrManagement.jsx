import React, { useEffect, useMemo, useState } from "react";
import { getHrSummary, saveHrAttendance } from "../lib/adminApi";

const todayValue = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const scoreClass = (score) => {
  const value = Number(score || 0);
  if (value < 50) return "border-red-300 bg-red-50 text-red-800";
  if (value < 75) return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
};

const barClass = (score) => {
  const value = Number(score || 0);
  if (value < 50) return "bg-red-500";
  if (value < 75) return "bg-amber-500";
  return "bg-emerald-600";
};

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#1f1f14]">{value || 0}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ScoreBar({ label, value }) {
  const score = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className={score < 50 ? "font-semibold text-red-600" : "font-semibold text-gray-700"}>{score}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${barClass(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function HrManagement() {
  const [data, setData] = useState({ summary: {}, staff: [], todayAttendance: [], attendanceStatuses: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({
    staffId: "",
    date: todayValue(),
    status: "Present",
    checkIn: "",
    checkOut: "",
    remarks: "",
  });

  const loadHr = async () => {
    try {
      setLoading(true);
      const response = await getHrSummary();
      setData(response);
      setAttendanceForm((current) => ({
        ...current,
        staffId: current.staffId || response.staff?.[0]?.id || "",
      }));
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load HR Lite data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHr();
  }, []);

  const submitAttendance = async (event) => {
    event.preventDefault();
    if (!attendanceForm.staffId) {
      setMessage("Select a staff member before saving attendance");
      return;
    }

    try {
      setSaving(true);
      const response = await saveHrAttendance(attendanceForm);
      setMessage(response.message || "Attendance saved");
      await loadHr();
    } catch (error) {
      setMessage(error.message || "Unable to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const summary = data.summary || {};
  const metrics = [
    ["Assigned", "assigned"],
    ["Done", "done"],
    ["Pending", "pending"],
    ["Ongoing", "ongoing"],
    ["Not Completed", "not_completed"],
    ["Abandoned", "abandoned"],
    ["Overdue", "overdue"],
  ];
  const attendanceStatuses = data.attendanceStatuses?.length ? data.attendanceStatuses : ["Present", "Absent", "Half Day", "Leave"];
  const atRiskStaff = useMemo(() => (data.staff || []).filter((item) => Number(item.overallScore || 0) < 50), [data.staff]);

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1f1f14]">HR Lite</h1>
          <p className="text-sm text-gray-500">Track employee attendance, task completion, and performance risk.</p>
        </div>
        <button onClick={loadHr} className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white">
          Refresh
        </button>
      </div>

      {message && <p className="mb-4 rounded-xl border border-[#E8DDBF] bg-white p-3 text-sm text-[#8A541E]">{message}</p>}

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-gray-500 shadow-sm">Loading HR Lite...</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="Average Score" value={`${summary.averageOverallScore || 0}%`} hint="Attendance + tasks" />
            <MetricCard label="Present Days" value={summary.present_days || 0} hint="Last 30 days" />
            <MetricCard label="Absent Days" value={summary.absent_days || 0} hint="Last 30 days" />
            <MetricCard label="Tasks Done" value={summary.done || 0} hint="All employees" />
            <MetricCard label="Abandoned" value={summary.abandoned || 0} hint="Needs review" />
            <MetricCard label="Below 50%" value={atRiskStaff.length} hint="Red cards" />
          </div>

          <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Employee Performance Cards</h2>
              <p className="text-sm text-gray-500">Cards turn red when the overall score falls below 50%.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(data.staff || []).map((item) => (
                <article key={item.id} className={`rounded-2xl border p-4 shadow-sm ${scoreClass(item.overallScore)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#1f1f14]">{item.name || "Staff"}</h3>
                      <p className="text-xs text-gray-500">{item.role || "Staff"} - {item.email}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-bold">{item.overallScore || 0}%</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <ScoreBar label="Attendance" value={item.attendanceScore} />
                    <ScoreBar label="Task Completion" value={item.taskCompletionScore} />
                    <ScoreBar label="Reliability" value={item.taskReliabilityScore} />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                    <span className="rounded-xl bg-white/80 p-2">Assigned<br /><strong>{item.assigned || 0}</strong></span>
                    <span className="rounded-xl bg-white/80 p-2">Done<br /><strong>{item.done || 0}</strong></span>
                    <span className="rounded-xl bg-white/80 p-2">Abandoned<br /><strong>{item.abandoned || 0}</strong></span>
                    <span className="rounded-xl bg-white/80 p-2">Overdue<br /><strong>{item.overdue || 0}</strong></span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-[380px_1fr]">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Mark Attendance</h2>
              <form onSubmit={submitAttendance} className="mt-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Employee
                  <select
                    value={attendanceForm.staffId}
                    onChange={(event) => setAttendanceForm({ ...attendanceForm, staffId: event.target.value })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                  >
                    {(data.staff || []).map((item) => (
                      <option key={item.id} value={item.id}>{item.name} - {item.role || "Staff"}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Date
                    <input
                      type="date"
                      value={attendanceForm.date}
                      onChange={(event) => setAttendanceForm({ ...attendanceForm, date: event.target.value })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Status
                    <select
                      value={attendanceForm.status}
                      onChange={(event) => setAttendanceForm({ ...attendanceForm, status: event.target.value })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                    >
                      {attendanceStatuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Check In
                    <input
                      type="time"
                      value={attendanceForm.checkIn}
                      onChange={(event) => setAttendanceForm({ ...attendanceForm, checkIn: event.target.value })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Check Out
                    <input
                      type="time"
                      value={attendanceForm.checkOut}
                      onChange={(event) => setAttendanceForm({ ...attendanceForm, checkOut: event.target.value })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Remarks
                  <textarea
                    value={attendanceForm.remarks}
                    onChange={(event) => setAttendanceForm({ ...attendanceForm, remarks: event.target.value })}
                    className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                    placeholder="Optional notes"
                  />
                </label>
                <button disabled={saving} className="w-full rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </form>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Today Attendance</h2>
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b bg-[#FBF8F2] text-left text-xs uppercase tracking-[0.08em] text-gray-500">
                    <th className="px-3 py-3">Employee</th>
                    <th>Status</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.todayAttendance || []).map((item) => (
                    <tr key={item.staff_id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.role || "Staff"}</p>
                      </td>
                      <td className={item.status ? "" : "text-gray-400"}>{item.status || "Not marked"}</td>
                      <td>{item.check_in || "-"}</td>
                      <td>{item.check_out || "-"}</td>
                      <td>{item.remarks || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-5 overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Task Performance Detail</h2>
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-[#FBF8F2] text-left text-xs uppercase tracking-[0.08em] text-gray-500">
                  <th className="p-3">Staff</th>
                  {metrics.map(([label]) => <th key={label}>{label}</th>)}
                  <th>Attendance Score</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {(data.staff || []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.email}</p>
                    </td>
                    {metrics.map(([, key]) => <td key={key}>{item[key] || 0}</td>)}
                    <td className={Number(item.attendanceScore || 0) < 50 ? "font-semibold text-red-600" : ""}>{item.attendanceScore || 0}%</td>
                    <td className={Number(item.overallScore || 0) < 50 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>{item.overallScore || 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
