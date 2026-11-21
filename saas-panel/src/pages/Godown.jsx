import React, { useEffect, useMemo, useState } from "react";
import searchIcon from "../assets/search.png";
import filterIcon from "../assets/filter.png";
import locationIcon from "../assets/location.png";
import importIcon from "../assets/import.png";
import exportIcon from "../assets/upload.png";
import addIcon from "../assets/add.png";
import a1jpg from "../assets/A1.jpg";
import a1png from "../assets/a1.png";
import a3jpg from "../assets/a3.jpg";
import t2jpeg from "../assets/t2.jpeg";
import downChevron from "../assets/down-chevron.png";
import reportIcon from "../assets/report.png";
import auditIcon from "../assets/audit.png";
import homeIcon from "../assets/home.png";
import boxIcon from "../assets/box.png";
import batteryIcon from "../assets/battery.png";
import crisisIcon from "../assets/crisis.png";
import trendIcon from "../assets/curve-arrow.png";
import { getAdminGodowns } from "../lib/adminApi";

function parsePercent(value) {
  return Number(String(value || "0").replace("%", "")) || 0;
}

function Godown() {
  const [activeBtn, setActiveBtn] = useState("");
  const [active, setActive] = useState("reports");
  const [activePageBtn, setActivePageBtn] = useState("next");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [activity, setActivity] = useState([]);
  const activityImages = [a1jpg, a1png, a3jpg, t2jpeg];

  useEffect(() => {
    let cancelled = false;

    async function loadGodowns() {
      try {
        setLoading(true);
        const data = await getAdminGodowns();

        if (!cancelled) {
          setFacilities(data.facilities || []);
          setActivity(data.activity || []);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Unable to load godowns");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGodowns();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFacilities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return facilities.filter((facility) =>
      `${facility.id} ${facility.name} ${facility.location} ${facility.status}`.toLowerCase().includes(query)
    );
  }, [facilities, search]);

  const totalCapacity = facilities.length;
  const avgUsed = facilities.length
    ? Math.round(facilities.reduce((sum, item) => sum + parsePercent(item.used), 0) / facilities.length)
    : 0;
  const alerts = facilities.filter((item) => ["Warning", "Full", "Maintenance"].includes(item.status)).length;
  const busiest = [...facilities].sort((a, b) => parsePercent(b.used) - parsePercent(a.used))[0];
  const underutilized = [...facilities].sort((a, b) => parsePercent(a.used) - parsePercent(b.used))[0];

  const cards = [
    ["Total Godowns", totalCapacity, "Backend facilities", "+0", homeIcon],
    ["Active Storage", `${avgUsed}%`, "Average used", "+0", boxIcon],
    ["Capacity Used", `${avgUsed}%`, "System-wide average", "+0", batteryIcon],
    ["Available Space", `${Math.max(0, 100 - avgUsed)}%`, "Average free", "+0", boxIcon],
    ["Critical Alerts", alerts, "Warning/full/maintenance", "-0", crisisIcon],
  ];

  const handleAction = (action) => {
    setActiveBtn(action);

    if (action === "import") {
      setMessage("Import needs a file upload endpoint before it can save.");
    } else if (action === "export") {
      const csv = [
        ["ID", "Name", "Location", "Capacity", "Used", "Status", "Updated"],
        ...filteredFacilities.map((item) => [item.id, item.name, item.location, item.capacity, item.used, item.status, item.time]),
      ]
        .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "godowns.csv";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Godown CSV exported.");
    } else {
      setMessage("Adding godowns needs a backend create endpoint before it can save.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 md:p-6">
      <div className="mb-6 rounded-xl p-6" style={{ background: "linear-gradient(180deg, #FFFFFFFF 0%, #FFF49CFF 100%)" }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 md:text-2xl">Global Godown Management</h1>
            <p className="text-sm text-gray-600">Real-time facility and capacity tracking</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionButton active={activeBtn === "import"} icon={importIcon} label="Import" onClick={() => handleAction("import")} />
            <ActionButton active={activeBtn === "export"} icon={exportIcon} label="Export" onClick={() => handleAction("export")} />
            <button onClick={() => handleAction("add")} className="flex items-center gap-2 rounded-lg bg-[#A68B5BFF] px-4 py-2 text-white shadow transition hover:scale-105">
              <img src={addIcon} className="h-4 invert" />
              Add Godown
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([title, value, sub, change, icon]) => (
          <div key={title} className="rounded-xl p-4 shadow transition hover:shadow-lg" style={{ background: "linear-gradient(180deg, #F9FAFBFF 0%, #C2863FFF 100%)" }}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">{title}</h3>
              <img src={icon} className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{value}</h2>
            <p className="mt-1 text-xs text-gray-700">{sub}</p>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <img src={trendIcon} className="h-3 w-3" />
              <span className={`font-medium ${String(change).includes("-") ? "text-red-600" : "text-green-600"}`}>{change}</span>
              <span className="text-gray-600">backend sync</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 rounded-xl bg-white p-4 shadow md:p-6">
          <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Facility Directory</h2>
              <p className="text-sm text-gray-500">Managed list of storage units</p>
            </div>
            <div className="flex w-full items-center rounded-lg bg-gray-100 px-3 py-2 lg:w-80">
              <img src={searchIcon} className="mr-2 h-4 w-4 opacity-60" />
              <input
                type="text"
                placeholder="Search facility name or ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <img src={filterIcon} className="ml-2 h-4 w-4 cursor-pointer opacity-70" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">GODOWN NAME</th>
                  <th>LOCATION</th>
                  <th>TOTAL CAPACITY</th>
                  <th>USED SPACE</th>
                  <th>STATUS</th>
                  <th>LAST UPDATED</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">Loading godowns...</td>
                  </tr>
                ) : filteredFacilities.length ? (
                  filteredFacilities.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.id}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 text-gray-600">
                          <img src={locationIcon} className="h-3 w-3" />
                          {row.location}
                        </div>
                      </td>
                      <td>{row.capacity}</td>
                      <td>
                        <p className="mb-1 text-xs">{row.used}</p>
                        <div className="h-1.5 w-20 rounded bg-gray-200">
                          <div className="h-1.5 rounded bg-[#C2863F]" style={{ width: row.used }} />
                        </div>
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-1 text-xs ${row.status === "Operational" ? "bg-green-100 text-green-600" : row.status === "Warning" ? "bg-yellow-100 text-yellow-600" : row.status === "Full" ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-600"}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="text-xs text-gray-500">{row.time}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">No facilities matched your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-gray-500">Showing {filteredFacilities.length} of {facilities.length} facilities</p>
            <div className="flex gap-2">
              <button onClick={() => setActivePageBtn("prev")} className="rounded border px-3 py-1 text-sm" style={{ backgroundColor: activePageBtn === "prev" ? "#A68B5BFF" : "white", color: activePageBtn === "prev" ? "white" : "black" }}>Previous</button>
              <button onClick={() => setActivePageBtn("next")} className="rounded px-3 py-1 text-sm" style={{ backgroundColor: activePageBtn === "next" ? "#A68B5BFF" : "white", color: activePageBtn === "next" ? "white" : "black" }}>Next</button>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-[320px]">
          <div className="rounded-xl bg-white p-6 shadow">
            <h3 className="mb-4 text-sm font-semibold text-gray-600">UTILIZATION PULSE</h3>
            <div className="mb-4 flex items-center justify-center">
              <div className="relative h-32 w-32">
                <svg className="h-full w-full rotate-[-90deg]">
                  <circle cx="64" cy="64" r="50" stroke="#E5E7EB" strokeWidth="10" fill="none" />
                  <circle cx="64" cy="64" r="50" stroke="#C2863F" strokeWidth="10" fill="none" strokeDasharray="314" strokeDashoffset={314 - (314 * avgUsed) / 100} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold">{avgUsed}%</span>
                  <span className="text-xs text-gray-500">TOTAL CAPACITY</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Busiest Hub</span>
                <span className="font-medium text-[#C2863F]">{busiest ? `${busiest.name} (${busiest.used})` : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Underutilized</span>
                <span className="font-medium text-[#C2863F]">{underutilized ? `${underutilized.name} (${underutilized.used})` : "-"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">RECENT ACTIVITY</h3>
              <span className="cursor-pointer text-xs text-[#C2863F]">View All</span>
            </div>
            <div className="space-y-4">
              {activity.map((item, index) => (
                <div key={`${item.title}-${index}`} className="flex items-start gap-3">
                  <img src={activityImages[index % activityImages.length]} className="h-8 w-8 rounded-full object-cover" />
                  <div className="text-xs">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-gray-500">{item.description}</p>
                  </div>
                  <span className="ml-auto text-[10px] text-gray-400">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs text-gray-500">System Shortcuts</h3>
              <img src={downChevron} className="h-4 w-4 cursor-pointer opacity-60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Shortcut active={active === "reports"} icon={reportIcon} label="Reports" onClick={() => setActive("reports")} />
              <Shortcut active={active === "audits"} icon={auditIcon} label="Audits" onClick={() => setActive("audits")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-4 py-2 shadow transition ${active ? "text-white" : "bg-white hover:scale-105"}`} style={{ backgroundColor: active ? "#A68B5BFF" : "white" }}>
      <img src={icon} className={`h-4 ${active ? "invert" : ""}`} />
      {label}
    </button>
  );
}

function Shortcut({ active, icon, label, onClick }) {
  return (
    <div onClick={onClick} className={`cursor-pointer rounded-lg border p-3 text-center transition ${active ? "shadow" : "hover:shadow"}`} style={{ backgroundColor: active ? "#FFF49CFF" : "white" }}>
      <img src={icon} className="mx-auto mb-1 h-5" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

export default Godown;
