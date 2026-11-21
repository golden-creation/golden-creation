import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAdminStaff, getAdminRoles } from "../lib/adminApi";
import { groupPermissions, normalizePermissionCatalog } from "../lib/permissions";

function StaffForm() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    password: "Staff@123",
    permissions: [],
  });

  useEffect(() => {
    getAdminRoles()
      .then((payload) => {
        const loadedRoles = (payload.roles || []).filter(
          (role) => String(role.name || "").trim().toLowerCase() !== "super admin"
        );
        setRoles(loadedRoles);
        setPermissionCatalog(normalizePermissionCatalog(payload.permissionCatalog));

        const firstRole = loadedRoles[0];
        if (firstRole) {
          setForm((current) => ({
            ...current,
            role: firstRole.name,
            permissions: firstRole.permissions || [],
          }));
        }
      })
      .catch((error) => setMessage(error.message || "Unable to load roles"));
  }, []);

  const updateRole = (roleName) => {
    const role = roles.find((item) => item.name === roleName);
    setForm((current) => ({
      ...current,
      role: roleName,
      permissions: role?.permissions || [],
    }));
  };

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
  const groupedPermissions = groupPermissions(permissionCatalog);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await createAdminStaff(form);
      navigate("/staff", {
        state: { message: "Staff account created. Temporary password: Staff@123" },
      });
    } catch (error) {
      setMessage(error.message || "Unable to create staff");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Add Staff</h1>
          <p className="text-sm text-gray-500">Create a staff login and assign role permissions.</p>
        </div>
        <button onClick={() => navigate("/staff")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
          Back to Staff
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Profile Details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Field label="Temporary Password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Role & Permissions</h2>
          <label className="mt-4 block text-sm font-medium">Role</label>
          <select
            value={form.role}
            onChange={(event) => updateRole(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.name}>
                {role.name}
              </option>
            ))}
          </select>

          <div className="mt-4 max-h-[560px] space-y-4 overflow-y-auto pr-1">
            {Object.entries(groupedPermissions).map(([group, permissions]) => (
              <div key={group}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const keys = permissions.map((permission) => permission.key);
                      const hasEvery = keys.every((key) => form.permissions.includes(key));
                      setForm((current) => ({
                        ...current,
                        permissions: hasEvery
                          ? current.permissions.filter((key) => !keys.includes(key))
                          : [...new Set([...(current.permissions || []), ...keys])],
                      }));
                    }}
                    className="text-xs text-[#A06422]"
                  >
                    Toggle group
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
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

          <button className="mt-5 w-full rounded-lg bg-[#A68B5B] py-2 text-sm font-medium text-white">
            Create Staff
          </button>
        </section>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}

export default StaffForm;
