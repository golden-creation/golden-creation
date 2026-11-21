import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteAdminMedia,
  getAdminRoles,
  getAdminStaffProfile,
  updateAdminStaff,
  uploadAdminMedia,
} from "../lib/adminApi";
import { groupPermissions, normalizePermissionCatalog } from "../lib/permissions";
import ConfirmDialog from "../components/ConfirmDialog";

function StaffProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [activity, setActivity] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const availableRoles = roles.filter((role) => {
    const roleName = String(role.name || "").trim().toLowerCase();
    if (roleName !== "super admin") return true;
    return Number(id) === 1 && String(form?.role || "").trim().toLowerCase() === "super admin";
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        const [profilePayload, rolePayload] = await Promise.all([
          getAdminStaffProfile(id),
          getAdminRoles(),
        ]);

        if (!cancelled) {
          setForm(profilePayload.staff);
          setActivity(profilePayload.activity || []);
          setRoles(rolePayload.roles || []);
          setPermissionCatalog(normalizePermissionCatalog(rolePayload.permissionCatalog));
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Unable to load staff profile");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateRole = (roleName) => {
    const role = roles.find((item) => item.name === roleName);
    setForm((current) => ({
      ...current,
      role: roleName,
      permissions: role?.permissions || current.permissions || [],
    }));
  };

  const togglePermission = (permission) => {
    setForm((current) => {
      const permissions = current.permissions || [];
      const hasPermission = permissions.includes(permission);
      return {
        ...current,
        permissions: hasPermission
          ? permissions.filter((item) => item !== permission)
          : [...permissions, permission],
      };
    });
  };

  const save = async () => {
    setConfirmSave(false);
    try {
      await updateAdminStaff(id, {
        name: form.name,
        role: form.role,
        status: form.status,
        profile_image: form.profile_image || form.image || "",
        permissions: form.permissions,
      });
      setMessage("Staff profile updated");
    } catch (error) {
      setMessage(error.message || "Unable to update staff");
    }
  };
  const groupedPermissions = groupPermissions(permissionCatalog);

  const uploadProfileImage = async (file) => {
    if (!file) return;

    try {
      const media = await uploadAdminMedia(file, "staff/profile");
      setForm((current) => ({
        ...current,
        profile_image: media.url,
        image: media.url,
      }));
      await updateAdminStaff(id, { profile_image: media.url });
      setMessage("Profile image updated");
    } catch (error) {
      setMessage(error.message || "Unable to update profile image");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading staff profile...</div>;
  }

  if (!form) {
    return <div className="p-6 text-sm text-gray-500">{message || "Staff not found."}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <ConfirmDialog
        open={confirmSave}
        title="Save staff changes?"
        message={`Apply role, status, profile, and permission changes for ${form.name}?`}
        confirmLabel="YES"
        onConfirm={save}
        onDiscard={() => setConfirmSave(false)}
      />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs text-gray-500">STAFF PROFILE</p>
          <h1 className="text-2xl font-semibold">{form.name}</h1>
          <p className="text-sm text-gray-500">{form.email}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/staff")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Back
          </button>
          <button onClick={() => setConfirmSave(true)} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white shadow">
            Save Changes
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="mt-4 flex items-center gap-4">
            <img
              src={form.profile_image || form.image || "https://ui-avatars.com/api/?name=Staff"}
              alt={form.name}
              className="h-16 w-16 rounded-full border object-cover"
            />
            <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm">
              Upload Photo
              <input type="file" hidden accept="image/*" onChange={(event) => uploadProfileImage(event.target.files?.[0])} />
            </label>
            {(form.profile_image || form.image) && <button type="button" onClick={async () => { const previous = form.profile_image || form.image; await updateAdminStaff(id, { profile_image: "" }); setForm((current) => ({ ...current, profile_image: "", image: "" })); await deleteAdminMedia(previous).catch(() => null); setMessage("Profile image removed"); }} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600">Remove Photo</button>}
            <span className="text-xs text-gray-400">Recommended: 600 x 600 px square image.</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <Field label="Email" value={form.email} readOnly />
            <Field label="Phone" value={form.phone || "-"} readOnly />
            <label className="block text-sm font-medium">
              Status
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option>Active</option>
                <option>Pending</option>
                <option>Inactive</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Role
              <select
                value={form.role}
                onChange={(event) => updateRole(event.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h2 className="mt-8 text-lg font-semibold">Recent Activity</h2>
          <div className="mt-3 space-y-2">
            {activity.length ? (
              activity.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{item.action}</p>
                  <p className="text-xs text-gray-500">{item.module} - {item.detail || "No detail"}</p>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                No tracked activity yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Permissions</h2>
          <div className="mt-4 max-h-[640px] space-y-4 overflow-y-auto pr-1">
            {Object.entries(groupedPermissions).map(([group, permissions]) => (
              <div key={group}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const keys = permissions.map((permission) => permission.key);
                      const hasEvery = keys.every((key) => (form.permissions || []).includes(key));
                      setForm((current) => ({
                        ...current,
                        permissions: hasEvery
                          ? (current.permissions || []).filter((key) => !keys.includes(key))
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
                        checked={(form.permissions || []).includes(permission.key)}
                        onChange={() => togglePermission(permission.key)}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, readOnly = false }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={value || ""}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
          readOnly ? "bg-gray-50 text-gray-500" : ""
        }`}
      />
    </label>
  );
}

export default StaffProfile;
