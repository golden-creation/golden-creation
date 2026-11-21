import React, { useEffect, useMemo, useState } from "react";
import RemoteLookup from "../components/RemoteLookup";
import {
  createAdminTaxRule,
  deleteAdminTaxRule,
  getAdminStoreSettings,
  updateAdminStoreSetting,
  updateAdminTaxRule,
} from "../lib/adminApi";
import useEditorScroll from "../hooks/useEditorScroll";

const emptyTaxRule = {
  category_id: "",
  tax_name: "GST",
  tax_rate: 0,
  status: "Active",
};

function StoreManagement() {
  const [settings, setSettings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [taxDraft, setTaxDraft] = useState(emptyTaxRule);
  const [taxCategory, setTaxCategory] = useState(null);
  const [editingTaxId, setEditingTaxId] = useState(null);
  const [editing, setEditing] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const { editorRef, scrollToEditor } = useEditorScroll();

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getAdminStoreSettings();
      setSettings(data.settings || []);
      setCategories(data.categories || []);
      setTaxRules(data.taxRules || []);
    } catch (error) {
      setMessage(error.message || "Unable to load shop settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    return settings
      .filter((setting) => {
        const category = String(setting.category || "").toLowerCase();
        const key = String(setting.setting_key || "").toLowerCase();

        return category !== "shipping" && !key.includes("shipping");
      })
      .reduce((groups, setting) => {
      const key = setting.category || "Store";
      groups[key] = groups[key] || [];
      groups[key].push(setting);
      return groups;
    }, {});
  }, [settings]);

  const saveSetting = async (setting) => {
    try {
      await updateAdminStoreSetting(
        setting.setting_key,
        editing[setting.setting_key] ?? setting.setting_value
      );
      setMessage("Setting saved.");
      await loadSettings();
    } catch (error) {
      setMessage(error.message || "Unable to save setting");
    }
  };

  const resetTaxDraft = () => {
    setTaxDraft(emptyTaxRule);
    setTaxCategory(null);
    setEditingTaxId(null);
  };

  const saveTaxRule = async () => {
    if (!taxDraft.category_id) {
      setMessage("Select a category for the tax rule.");
      return;
    }

    try {
      const payload = {
        ...taxDraft,
        tax_rate: Number(taxDraft.tax_rate || 0),
      };

      if (editingTaxId) {
        await updateAdminTaxRule(editingTaxId, payload);
        setMessage("Tax rule updated.");
      } else {
        await createAdminTaxRule(payload);
        setMessage("Tax rule saved.");
      }

      resetTaxDraft();
      await loadSettings();
    } catch (error) {
      setMessage(error.message || "Unable to save tax rule");
    }
  };

  const editTaxRule = (rule) => {
    setEditingTaxId(rule.id);
    setTaxDraft({
      category_id: rule.category_id,
      tax_name: rule.tax_name || "GST",
      tax_rate: Number(rule.tax_rate || 0),
      status: rule.status || "Active",
    });
    setTaxCategory({ id: rule.category_id, label: rule.category_name });
    scrollToEditor();
  };

  const removeTaxRule = async (id) => {
    try {
      await deleteAdminTaxRule(id);
      setMessage("Tax rule deleted.");
      await loadSettings();
    } catch (error) {
      setMessage(error.message || "Unable to delete tax rule");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Store Settings</h1>
        <p className="text-sm text-gray-500">
          Configure online store identity and category tax settings.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="Settings" value={settings.length} />
        <Metric label="Tax Rules" value={taxRules.length} />
        <Metric label="Categories" value={categories.length} />
      </div>

      {loading ? (
        <div className="mt-6 rounded-xl bg-white py-10 text-center text-gray-500 shadow">
          Loading shop settings...
        </div>
      ) : (
        <div className="mt-6">
          <section className="space-y-4">
            <div ref={editorRef} className="scroll-mt-24 rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">
                {editingTaxId ? "Edit Category Tax Rule" : "Add Category Tax Rule"}
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <label className="text-sm md:col-span-2">
                  <span className="text-xs text-gray-500">Category</span>
                  <RemoteLookup
                    type="categories"
                    value={taxCategory}
                    onChange={(option) => {
                      setTaxCategory(option);
                      setTaxDraft({ ...taxDraft, category_id: option?.id || "" });
                    }}
                    placeholder="Search category..."
                  />
                </label>
                <Field label="Tax Name" value={taxDraft.tax_name} onChange={(value) => setTaxDraft({ ...taxDraft, tax_name: value })} />
                <Field label="Tax Rate %" type="number" value={taxDraft.tax_rate} onChange={(value) => setTaxDraft({ ...taxDraft, tax_rate: value })} />
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Status</span>
                  <select
                    value={taxDraft.status}
                    onChange={(event) => setTaxDraft({ ...taxDraft, status: event.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={saveTaxRule} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
                  {editingTaxId ? "Update Tax Rule" : "Save Tax Rule"}
                </button>
                {editingTaxId && (
                  <button onClick={resetTaxDraft} className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">Current Category Tax Rules</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr>
                      <th className="p-3">Category</th>
                      <th>Tax</th>
                      <th>Rate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRules.map((rule) => (
                      <tr key={rule.id} className="border-b">
                        <td className="p-3 font-medium">{rule.category_name}</td>
                        <td>{rule.tax_name}</td>
                        <td>{Number(rule.tax_rate || 0)}%</td>
                        <td>
                          <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                            {rule.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => editTaxRule(rule)} className="rounded-lg border px-3 py-1.5 text-xs">
                              Edit
                            </button>
                            <button onClick={() => removeTaxRule(rule.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!taxRules.length && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-gray-500">
                          No category tax rules found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {Object.entries(groupedSettings).map(([category, items]) => (
              <div key={category} className="rounded-xl bg-white p-4 shadow">
                <h2 className="mb-4 text-lg font-semibold">{category} Settings</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {items.map((setting) => (
                    <div key={setting.setting_key} className="rounded-lg border p-3">
                      <label className="text-xs uppercase text-gray-500">
                        {setting.setting_key.replace(/_/g, " ")}
                      </label>
                      <div className="mt-2 flex gap-2">
                        <input
                          value={editing[setting.setting_key] ?? setting.setting_value}
                          onChange={(event) =>
                            setEditing({
                              ...editing,
                              [setting.setting_key]: event.target.value,
                            })
                          }
                          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => saveSetting(setting)}
                          className="rounded-lg bg-[#A68B5B] px-3 py-2 text-sm text-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
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

export default StoreManagement;
