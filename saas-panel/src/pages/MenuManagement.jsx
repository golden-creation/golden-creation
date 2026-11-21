import React, { useEffect, useMemo, useState } from "react";
import RemoteLookup from "../components/RemoteLookup";
import {
  createAdminMenu,
  deleteAdminMenu,
  duplicateAdminMenu,
  getAdminMenuReferences,
  getAdminMenus,
  reorderAdminMenus,
  updateAdminMenu,
  uploadAdminMedia,
} from "../lib/adminApi";
import useEditorScroll from "../hooks/useEditorScroll";

const emptyForm = {
  id: "",
  title: "",
  type: "custom",
  referenceId: "",
  url: "",
  icon: "",
  image: "",
  parentId: "",
  megaMenu: false,
  sortOrder: 0,
  visibility: "Visible",
};

function MenuManagement() {
  const [menus, setMenus] = useState([]);
  const [tree, setTree] = useState([]);
  const [references, setReferences] = useState({ categories: [], collections: [], brands: [], pages: [] });
  const [form, setForm] = useState(emptyForm);
  const [linkedItem, setLinkedItem] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const { editorRef, scrollToEditor } = useEditorScroll();

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };

  const loadMenus = async () => {
    setLoading(true);
    try {
      const [menuData, referenceData] = await Promise.all([getAdminMenus(), getAdminMenuReferences()]);
      setMenus(menuData.menus || []);
      setTree(menuData.tree || []);
      setReferences(referenceData || references);
    } catch (error) {
      showToast(error.message || "Unable to load menus");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenus();
  }, []);

  const flatMenus = useMemo(() => flattenTree(tree), [tree]);
  const parentOptions = menus.filter((menu) => Number(menu.id) !== Number(form.id));
  const referenceKey = form.type === "category" ? "categories" : `${form.type}s`;
  const referenceOptions = references[referenceKey] || [];

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "type") {
        next.referenceId = "";
        next.url = value === "page" ? "/writing-essentials" : value === "custom" ? "" : next.url;
        setLinkedItem(null);
      }

      if (field === "referenceId") {
        const selected = referenceOptions.find((item) => Number(item.id) === Number(value));
        if (selected) {
          next.url = autoUrl(form.type, selected);
        }
      }

      if (field === "url" && form.type === "page") {
        next.url = value;
      }

      return next;
    });
  };

  const readImage = async (field, file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.type)) {
      showToast("Only image files are allowed");
      return;
    }
    try {
      showToast(`Uploading ${field}...`);
      const media = await uploadAdminMedia(file, `menus/${field}`);
      updateField(field, media.url);
      showToast(`${field === "icon" ? "Icon" : "Image"} uploaded`);
    } catch (error) {
      showToast(error.message || "Unable to upload image");
    }
  };

  const editMenu = (menu) => {
    const key = menu.type === "category" ? "categories" : `${menu.type}s`;
    const reference = (references[key] || []).find((item) => Number(item.id) === Number(menu.reference_id));
    setLinkedItem(reference ? { ...reference, label: reference.title || reference.name } : null);
    setForm({
      id: menu.id,
      title: menu.title || "",
      type: menu.type || "custom",
      referenceId: menu.reference_id || "",
      url: menu.url || "",
      icon: menu.icon || "",
      image: menu.image || "",
      parentId: menu.parent_id || "",
      megaMenu: Boolean(menu.mega_menu),
      sortOrder: Number(menu.sort_order || 0),
      visibility: menu.visibility || "Visible",
    });
    scrollToEditor();
  };

  const saveMenu = async () => {
    if (!form.title.trim()) {
      showToast("Menu title is required");
      return;
    }

    try {
      const payload = {
        title: form.title,
        type: form.type,
        referenceId: form.referenceId || null,
        url: form.url,
        icon: form.icon,
        image: form.image,
        parentId: form.parentId || null,
        megaMenu: form.megaMenu,
        sortOrder: form.sortOrder,
        visibility: form.visibility,
      };

      if (form.id) {
        await updateAdminMenu(form.id, payload);
        showToast("Menu item updated");
      } else {
        await createAdminMenu(payload);
        showToast("Menu item created");
      }

      setForm(emptyForm);
      await loadMenus();
    } catch (error) {
      showToast(error.message || "Unable to save menu");
    }
  };

  const removeMenu = async (menu) => {
    if (!window.confirm(`Delete ${menu.title}? Child menu items will also be hidden.`)) return;
    await deleteAdminMenu(menu.id);
    showToast("Menu item deleted");
    await loadMenus();
  };

  const cloneMenu = async (menu) => {
    await duplicateAdminMenu(menu.id);
    showToast("Menu item duplicated");
    await loadMenus();
  };

  const dropOnMenu = async (target) => {
    if (!dragId || Number(dragId) === Number(target.id)) return;
    const dragged = menus.find((menu) => Number(menu.id) === Number(dragId));
    if (!dragged) return;

    const siblings = menus
      .filter((menu) => Number(menu.parent_id || 0) === Number(target.parent_id || 0))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
    const withoutDragged = siblings.filter((item) => Number(item.id) !== Number(dragged.id));
    const targetIndex = withoutDragged.findIndex((item) => Number(item.id) === Number(target.id));
    withoutDragged.splice(Math.max(0, targetIndex), 0, dragged);

    await reorderAdminMenus(
      withoutDragged.map((item, index) => ({
        id: item.id,
        parentId: item.parent_id || null,
        sortOrder: (index + 1) * 10,
      }))
    );
    setDragId(null);
    await loadMenus();
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Menu Management</h1>
          <p className="text-sm text-gray-500">Build navbar links, nested dropdowns, and mega menus without hardcoding categories.</p>
        </div>
        <button onClick={() => setForm(emptyForm)} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Add Menu Item</button>
      </div>

      <div className="flex flex-col gap-5">
        <section ref={editorRef} className="scroll-mt-24 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{form.id ? "Edit Menu Item" : "Add Menu Item"}</h2>
          <div className="mt-4 space-y-3">
            <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} />
            <Select label="Type" value={form.type} onChange={(value) => updateField("type", value)} options={[["category", "Category"], ["collection", "Collection"], ["brand", "Brand"], ["page", "Static Page"], ["custom", "Custom URL"]]} />

            {["category", "collection", "brand"].includes(form.type) && (
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Linked Item</span>
                <div className="mt-1">
                  <RemoteLookup
                    type={form.type === "category" ? "categories" : `${form.type}s`}
                    value={linkedItem}
                    onChange={(option) => {
                      setLinkedItem(option);
                      setForm((current) => ({
                        ...current,
                        referenceId: option?.id || "",
                        url: option ? autoUrl(current.type, option) : "",
                      }));
                    }}
                    placeholder={`Search ${form.type}...`}
                  />
                </div>
              </label>
            )}

            {form.type === "page" && (
              <Select label="Page" value={form.url} onChange={(value) => updateField("url", value)} options={references.pages.map((page) => [page.url, page.title])} />
            )}

            <Field label="URL" value={form.url} onChange={(value) => updateField("url", value)} disabled={["category", "collection", "brand"].includes(form.type)} />
            <Select label="Parent Menu" value={form.parentId} onChange={(value) => updateField("parentId", value)} options={[["", "Top level"], ...parentOptions.map((item) => [String(item.id), item.title])]} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort Order" value={form.sortOrder} onChange={(value) => updateField("sortOrder", value)} />
              <Select label="Visibility" value={form.visibility} onChange={(value) => updateField("visibility", value)} options={[["Visible", "Visible"], ["Hidden", "Hidden"]]} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.megaMenu} onChange={(event) => updateField("megaMenu", event.target.checked)} />
              Enable mega menu
            </label>
            <Upload label="Icon" value={form.icon} onDrop={(file) => readImage("icon", file)} onClear={() => updateField("icon", "")} />
            <Upload label="Image" value={form.image} onDrop={(file) => readImage("image", file)} onClear={() => updateField("image", "")} />
            <div className="flex gap-2">
              <button onClick={saveMenu} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Save</button>
              {form.id && <button onClick={() => setForm(emptyForm)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>}
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="font-semibold">Navbar Menu Tree</h2>
            <p className="text-xs text-gray-500">Drag items within the same level to reorder.</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading menus...</div>
          ) : flatMenus.length ? (
            <div className="space-y-2">
              {flatMenus.map(({ item, depth }) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOnMenu(item)}
                  className="flex flex-col gap-3 rounded-xl border bg-white p-3 text-sm shadow-sm md:flex-row md:items-center"
                  style={{ marginLeft: `${depth * 22}px` }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="cursor-grab text-gray-400">::</span>
                    {item.icon && <img src={item.icon} alt="" className="h-8 w-8 rounded object-contain" />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.title}</p>
                      <p className="truncate text-xs text-gray-500">{item.type} - {item.url || "No URL"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.mega_menu && <span className="rounded-full bg-[#FFF4DC] px-2 py-1 text-xs text-[#7A4D18]">Mega</span>}
                    <span className={`rounded-full px-2 py-1 text-xs ${item.visibility === "Visible" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{item.visibility}</span>
                    <button onClick={() => editMenu(item)} className="rounded border px-3 py-1 text-xs">Edit</button>
                    <button onClick={() => cloneMenu(item)} className="rounded border px-3 py-1 text-xs">Duplicate</button>
                    <button onClick={() => removeMenu(item)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">No menus created yet.</div>
          )}

          <div className="mt-6 rounded-xl border bg-[#FBF8F2] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Desktop Preview</p>
            <div className="flex flex-wrap gap-2 rounded-lg bg-[#bf7b28] p-3">
              {tree.map((item) => (
                <div key={item.id} className="group relative">
                  <span className="inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white">{item.title}{item.children?.length ? " ▾" : ""}</span>
                  {!!item.children?.length && (
                    <div className="mt-2 hidden min-w-44 rounded-lg bg-white p-3 text-sm shadow group-hover:block">
                      {item.children.map((child) => <p key={child.id} className="py-1 text-gray-700">{child.title}</p>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function flattenTree(items = [], depth = 0) {
  return items.flatMap((item) => [
    { item, depth },
    ...flattenTree(item.children || [], depth + 1),
  ]);
}

function autoUrl(type, item) {
  if (type === "category") return `/writing-essentials?category=${item.id}`;
  if (type === "collection") return `/collections/${item.slug}`;
  if (type === "brand") return `/brand/${item.slug}`;
  return "";
}

function Field({ label, value, onChange, disabled = false }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function Upload({ label, value, onDrop, onClear }) {
  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {value && <button onClick={onClear} className="text-xs text-red-600">Clear</button>}
      </div>
      {value && <img src={value} alt="" className="mb-2 h-16 w-full rounded object-contain" />}
      <label className="inline-flex cursor-pointer rounded border bg-white px-3 py-1.5 text-xs">
        Choose {label}
        <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => onDrop(event.target.files?.[0])} />
      </label>
    </div>
  );
}

export default MenuManagement;
