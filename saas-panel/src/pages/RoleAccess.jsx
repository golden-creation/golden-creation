import React, { useEffect, useMemo, useState } from "react";
import {
  createAdminRole,
  getAdminActivity,
  getAdminRoles,
} from "../lib/adminApi";
import { groupPermissions, normalizePermissionCatalog, permissionLabel } from "../lib/permissions";

function RoleAccess() {
  const [roles, setRoles] = useState([]);
  const [activity, setActivity] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: ["dashboard"],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [roleData, activityData] = await Promise.all([
        getAdminRoles(),
        getAdminActivity(),
      ]);
      setRoles(roleData.roles || []);
      setPermissionCatalog(normalizePermissionCatalog(roleData.permissionCatalog));
      setActivity(activityData.activity || []);
    } catch (error) {
      setMessage(error.message || "Unable to load access controls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const assignedPermissions = useMemo(
    () => new Set(roles.flatMap((role) => role.permissions || [])),
    [roles]
  );

  const togglePermission = (permission) => {
    setForm((current) => {
      const hasPermission = current.permissions.includes(permission);
      return {
        ...current,
        permissions: hasPermission
          ? current.permissions.filter((item) => item !== permission)
          : [...current.permissions, permission],
      };
    });
  };

  const submitRole = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await createAdminRole(form);
      setForm({ name: "", description: "", permissions: ["dashboard"] });
      setMessage("Role created.");
      await loadData();
    } catch (error) {
      setMessage(error.message || "Unable to create role");
    }
  };
  const groupedPermissions = groupPermissions(permissionCatalog);

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Role-Based Access Control</h1>
        <p className="text-sm text-gray-500">
          Create roles, assign permissions, and review admin activity.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Roles" value={roles.length} />
        <Metric label="Permission Types" value={permissionCatalog.length} />
        <Metric label="Assigned Permissions" value={assignedPermissions.size} />
        <Metric label="Activity Events" value={activity.length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">Roles</h2>
          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading roles...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr>
                    <th className="p-3">Role</th>
                    <th>Description</th>
                    <th>Permissions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b">
                      <td className="p-3 font-medium">{role.name}</td>
                      <td className="text-gray-500">{role.description || "-"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1 py-2">
                          {(role.permissions || []).map((permission) => (
                            <span key={permission} className="rounded-full bg-[#FFF49C] px-2 py-1 text-xs">
                              {permissionLabel(permission)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                          {role.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="text-lg font-semibold">Create Role</h2>
          <form onSubmit={submitRole} className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Role name"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Role description"
              className="h-20 w-full resize-none rounded-lg border px-3 py-2 text-sm"
            />
            <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
              {Object.entries(groupedPermissions).map(([group, permissions]) => (
                <div key={group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {permissions.map((permission) => (
                      <label key={permission.key} className="flex items-center gap-2 rounded-lg border px-2 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission.key)}
                          onChange={() => togglePermission(permission.key)}
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full rounded-lg bg-[#A68B5B] py-2 text-sm font-medium text-white">
              Save Role
            </button>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-4 text-lg font-semibold">Activity Tracking</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activity.slice(0, 9).map((item) => (
            <div key={item.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{item.action}</p>
              <p className="text-xs text-gray-500">{item.module} - {item.actor}</p>
              <p className="mt-1 text-xs text-gray-400">{item.detail || "No detail"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default RoleAccess;
