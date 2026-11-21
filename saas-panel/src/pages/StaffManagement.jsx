import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import addFriend from "../assets/add-friend.png";
import searchIcon from "../assets/search.png";
import userIcon from "../assets/user.png";
import clockIcon from "../assets/clock.png";
import clockIcon2 from "../assets/clock (1).png";
import verifyIcon from "../assets/verify.png";
import filterIcon from "../assets/filter.png";
import downIcon from "../assets/down-chevron.png";
import viewIcon from "../assets/view.png";
import pencilIcon from "../assets/pencil.png";
import binIcon from "../assets/bin.png";
import {
  createAdminStaff,
  deleteAdminStaff,
  getAdminRoles,
  getAdminStaff,
} from "../lib/adminApi";
import { permissionLabel } from "../lib/permissions";
import ConfirmDialog from "../components/ConfirmDialog";

function StaffManagement() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("role");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState({});
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [rolePanelOpen, setRolePanelOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "Store Manager",
    password: "Staff@123",
  });
  const initials = (name) =>
    String(name || "Staff")
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const loadStaff = async () => {
    try {
      setLoading(true);
      const [data, roleData] = await Promise.all([getAdminStaff(), getAdminRoles()]);
      setSummary(data.summary || {});
      setStaff(data.staff || []);
      setRoles(roleData.roles || []);
    } catch (error) {
      setMessage(error.message || "Unable to load staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const submitStaff = (event) => {
    event.preventDefault();
    setConfirmAction({
      title: "Create staff account?",
      message: `Create staff login for ${form.name || form.email || "this user"} with role ${form.role}?`,
      confirmLabel: "YES",
      onConfirm: createStaffNow,
    });
  };

  const createStaffNow = async () => {
    setConfirmAction(null);
    setMessage("");

    try {
      await createAdminStaff({
        ...form,
        permissions:
          roles.find((role) => role.name === form.role)?.permissions || [],
      });
      setForm({
        name: "",
        email: "",
        phone: "",
        role: roles[0]?.name || "Store Manager",
        password: "Staff@123",
      });
      setMessage("Staff account created. Temporary password: Staff@123");
      const data = await getAdminStaff();
      setSummary(data.summary || {});
      setStaff(data.staff || []);
    } catch (error) {
      setMessage(error.message || "Unable to create staff account");
    }
  };

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();

    return staff.filter((item) => {
      const text = `${item.id} ${item.name} ${item.role} ${item.email} ${item.phone} ${item.status}`.toLowerCase();

      return text.includes(query);
    });
  }, [search, staff]);

  const cards = [
    ["Total Staff", summary.totalStaff || 0, "Admin and staff accounts", userIcon],
    ["Active Staff", summary.activeStaff || 0, "Active accounts", clockIcon],
    ["Pending Invites", summary.pendingInvites || 0, "Awaiting verification", clockIcon2],
    ["Role Types", summary.roleTypes || 0, "System roles", verifyIcon],
  ];
  const allVisibleSelected =
    filteredStaff.length > 0 && filteredStaff.every((item) => selectedIds.includes(item.id));
  const removeStaff = async (item) => {
    setConfirmAction({
      title: "Delete staff account?",
      message: `Delete ${item.name}? This removes their admin panel access.`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: () => removeStaffNow(item),
    });
  };

  const removeStaffNow = async (item) => {
    setConfirmAction(null);
    try {
      const response = await deleteAdminStaff(String(item.id).replace(/^ADM-/, ""));
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      setMessage(response?.message || "Staff account deleted.");
      await loadStaff();
    } catch (error) {
      setMessage(error.message || "Unable to delete staff account");
    }
  };
  const removeSelected = async () => {
    if (!selectedIds.length) return;
    setConfirmAction({
      title: "Delete selected staff?",
      message: `Delete ${selectedIds.length} selected staff account(s)? This removes their admin panel access.`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: removeSelectedNow,
    });
  };

  const removeSelectedNow = async () => {
    setConfirmAction(null);
    let deleted = 0;
    const failures = [];

    for (const id of selectedIds) {
      try {
        const response = await deleteAdminStaff(String(id).replace(/^ADM-/, ""));
        if (response?.removalRequest) {
          failures.push(response.message || `Delete approval requested for ${id}`);
        } else {
          deleted += 1;
        }
      } catch (error) {
        failures.push(error.message || `Unable to delete ${id}`);
      }
    }

    setSelectedIds([]);
    setMessage(`${deleted} staff account(s) deleted.${failures.length ? ` ${failures.join(" ")}` : ""}`);
    await loadStaff();
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] p-3 sm:p-4 md:p-8">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel || "YES"}
        tone={confirmAction?.tone}
        onConfirm={confirmAction?.onConfirm}
        onDiscard={() => setConfirmAction(null)}
      />
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Staff Management</h1>
          <p className="text-xs text-gray-500 sm:text-sm">
            Create staff accounts, assign roles and permissions, and open detailed staff profiles.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center rounded-lg bg-white px-3 py-2 shadow sm:max-w-xs">
            <img src={searchIcon} className="mr-2 h-4 w-4 opacity-60" />
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full text-sm outline-none"
            />
          </div>

          <button
            onClick={() => navigate("/staff/new")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#A68B5BFF] px-4 py-2 text-white shadow hover:opacity-90 sm:w-auto"
          >
            <img src={addFriend} className="h-4 w-4" />
            Add Staff
          </button>
        </div>
      </div>

      {rolePanelOpen && (
        <form onSubmit={submitStaff} className="mb-6 rounded-2xl bg-white p-4 shadow">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Name"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="Email"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="Phone"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {(roles.length ? roles : [{ name: "Store Manager" }])
                .filter((role) => String(role.name || "").trim().toLowerCase() !== "super admin")
                .map((role) => (
                <option key={role.name}>{role.name}</option>
              ))}
            </select>
            <button className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
              Create Account
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Temporary password: {form.password}
          </p>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([title, value, sub, icon]) => (
          <div
            key={title}
            className="flex items-center justify-between rounded-xl bg-[linear-gradient(180deg,#F9FAFBFF_0%,#C2863FFF_100%)] p-4"
          >
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">{title}</p>
              <h2 className="text-lg font-bold sm:text-xl">{value}</h2>
              <p className="text-xs text-[#C2863FFF]">{sub}</p>
            </div>
            <img src={icon} className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-white p-4 shadow">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFilter("role")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeFilter === "role" ? "bg-[#A68B5BFF] text-white" : "bg-gray-100 text-black"
              }`}
            >
              <img src={filterIcon} className={`h-4 w-4 ${activeFilter === "role" ? "invert" : ""}`} />
              Filter by Role
              <img src={downIcon} className="h-3 w-3" />
            </button>

            <button
              onClick={() => setActiveFilter("status")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeFilter === "status" ? "bg-[#A68B5BFF] text-white" : "bg-gray-100 text-black"
              }`}
            >
              Status: All
              <img src={downIcon} className="h-3 w-3" />
            </button>
          </div>

          <p className="text-xs text-gray-400">
            SHOWING {filteredStaff.length} OF {staff.length} STAFF
          </p>
          <button onClick={removeSelected} className="rounded-lg bg-red-700 px-3 py-2 text-xs text-white">
            Delete selected
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
            {message}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[36px_1.3fr_1fr_1.2fr_1fr_0.7fr_0.8fr] border-b pb-2 text-xs font-semibold text-gray-400">
              <input
                type="checkbox"
                aria-label="Select all staff"
                checked={allVisibleSelected}
                onChange={(event) => setSelectedIds(event.target.checked ? filteredStaff.map((item) => item.id) : [])}
              />
              <p>NAME & ID</p>
              <p>DESIGNATION</p>
              <p>EMAIL</p>
              <p>PHONE</p>
              <p>STATUS</p>
              <p className="text-center">MANAGE</p>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading staff...</div>
            ) : filteredStaff.length ? (
              filteredStaff.map((item) => (
                <div key={item.id} className="grid grid-cols-[36px_1.3fr_1fr_1.2fr_1fr_0.7fr_0.8fr] items-center border-b py-3 text-sm">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, item.id])] : selectedIds.filter((id) => id !== item.id))} />
                  <div className="flex items-center gap-3">
                    {item.image || item.profile_image ? (
                      <img src={item.image || item.profile_image} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                        {initials(item.name)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-400">ID: {item.id}</p>
                      {item.permissions?.length ? (
                        <p className="text-[10px] text-gray-400">{item.permissions.length} permissions</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="w-fit rounded bg-gray-100 px-2 py-1 text-xs">{item.role}</p>
                  <p className="text-gray-500">{item.email}</p>
                  <p className="text-gray-500">{item.phone}</p>
                  <p
                    className={`w-fit rounded px-2 py-1 text-xs ${
                      item.status === "Active"
                        ? "bg-yellow-100 text-[#C2863FFF]"
                        : item.status === "Pending"
                          ? "bg-orange-100 text-[#C2863FFF]"
                          : "bg-gray-200 text-[#C2863FFF]"
                    }`}
                  >
                    {item.status}
                  </p>
                  <div className="flex justify-center gap-3">
                    <button onClick={() => navigate(`/staff/${String(item.id).replace(/^ADM-/, "")}`)} title="View staff profile">
                      <img src={viewIcon} className="h-4 w-4" />
                    </button>
                    <button onClick={() => navigate(`/staff/${String(item.id).replace(/^ADM-/, "")}`)} title="Edit staff">
                      <img src={pencilIcon} className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeStaff(item)} title="Delete staff">
                      <img src={binIcon} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">No staff matched your search.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Roles & Permissions</h2>
            <p className="text-sm text-gray-500">
              Roles are managed inside this module and assigned when creating or editing staff.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRolePanelOpen((value) => !value)}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Quick Create Staff
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border p-3">
              <p className="font-medium">{role.name}</p>
              <p className="mt-1 text-xs text-gray-500">{role.description || "Custom staff role"}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(role.permissions || []).slice(0, 5).map((permission) => (
                  <span key={permission} className="rounded-full bg-[#FFF49C] px-2 py-1 text-[10px]">
                    {permissionLabel(permission)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StaffManagement;
