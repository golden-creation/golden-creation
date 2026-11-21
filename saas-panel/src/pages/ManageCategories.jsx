import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategories,
  updateAdminCategory,
  uploadAdminMedia,
} from "../lib/adminApi";
import useEditorScroll from "../hooks/useEditorScroll";
import ConfirmDialog from "../components/ConfirmDialog";

function buildCategoryTree(categories) {
  const map = new Map();

  categories.forEach((category) => {
    map.set(Number(category.id), {
      ...category,
      id: Number(category.id),
      parent_id: category.parent_id ? Number(category.parent_id) : null,
      children: [],
      depth: 0,
      path: category.name || "Untitled",
    });
  });

  const roots = [];

  map.forEach((category) => {
    if (category.parent_id && map.has(category.parent_id)) {
      map.get(category.parent_id).children.push(category);
    } else {
      roots.push(category);
    }
  });

  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
  const flattened = [];
  const walk = (items, depth = 0, parentPath = "") => {
    items.sort(byName).forEach((category) => {
      category.depth = depth;
      category.path = parentPath ? `${parentPath} > ${category.name}` : category.name;
      flattened.push(category);
      walk(category.children, depth + 1, category.path);
    });
  };

  walk(roots);
  return flattened;
}

function collectDescendantIds(categories, categoryId) {
  const childrenByParent = new Map();

  categories.forEach((category) => {
    const parentId = category.parent_id ? Number(category.parent_id) : null;
    if (!parentId) return;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), Number(category.id)]);
  });

  const descendants = new Set();
  const stack = [...(childrenByParent.get(Number(categoryId)) || [])];

  while (stack.length) {
    const id = stack.pop();
    descendants.add(id);
    stack.push(...(childrenByParent.get(id) || []));
  }

  return descendants;
}

function ManageCategories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const { editorRef: formRef, scrollToEditor } = useEditorScroll();
  const [form, setForm] = useState({
    name: "",
    parent_id: "",
    image: "",
    description: "",
    status: "Active",
  });

  const loadCategories = async () => {
    try {
      setLoading(true);
      const payload = await getAdminCategories();
      setCategories(payload.categories || []);
    } catch (error) {
      setMessage(error.message || "Unable to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const flattenedCategories = useMemo(() => buildCategoryTree(categories), [categories]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    return flattenedCategories.filter((category) => {
      if (query) {
        return `${category.path} ${category.description} ${category.status}`.toLowerCase().includes(query);
      }

      let parentId = category.parent_id;

      while (parentId) {
        if (collapsedIds.has(Number(parentId))) return false;
        parentId = categories.find((item) => Number(item.id) === Number(parentId))?.parent_id || null;
      }

      return true;
    });
  }, [categories, collapsedIds, flattenedCategories, search]);

  const parentOptions = useMemo(() => {
    const blockedIds = editing ? collectDescendantIds(categories, editing.id) : new Set();

    if (editing) {
      blockedIds.add(Number(editing.id));
    }

    return flattenedCategories.filter((category) => !blockedIds.has(Number(category.id)));
  }, [categories, editing, flattenedCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", parent_id: "", image: "", description: "", status: "Active" });
    scrollToEditor(true);
  };

  const openEdit = (category) => {
    setEditing(category);
    setForm({
      name: category.name || "",
      parent_id: category.parent_id ? String(category.parent_id) : "",
      image: category.image || "",
      description: category.description || "",
      status: category.status || "Active",
    });
    scrollToEditor(true);
  };

  const saveCategoryNow = async () => {
    setConfirmAction(null);
    setMessage("");

    try {
      const payload = {
        ...form,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      };

      if (editing) {
        await updateAdminCategory(editing.id, payload);
        setMessage("Category updated");
      } else {
        await createAdminCategory(payload);
        setMessage("Category created");
      }

      setEditing(null);
      setForm({ name: "", parent_id: "", image: "", description: "", status: "Active" });
      await loadCategories();
    } catch (error) {
      setMessage(error.message || "Unable to save category");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setConfirmAction({
      title: editing ? "Update category?" : "Create category?",
      message: editing
        ? `Save changes to "${form.name || editing.name}" and its nesting?`
        : `Create "${form.name || "this category"}" in Website Categories?`,
      confirmLabel: "YES",
      onConfirm: saveCategoryNow,
    });
  };

  const removeCategoryNow = async (category) => {
    setConfirmAction(null);
    try {
      setMessage("");
      await deleteAdminCategory(category.id);
      if (editing?.id === category.id) {
        setEditing(null);
        setForm({ name: "", parent_id: "", image: "", description: "", status: "Active" });
      }
      setMessage("Category deleted");
      await loadCategories();
    } catch (error) {
      setMessage(error.message || "Unable to delete category");
    }
  };

  const removeCategory = async (category) => {
    const childCount = flattenedCategories.filter((item) => Number(item.parent_id) === Number(category.id)).length;
    setConfirmAction({
      title: "Delete category?",
      message: `Delete "${category.name}"? Products in this category will become uncategorized${
        childCount ? " and its direct subcategories will move up one level" : ""
      }.`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: () => removeCategoryNow(category),
    });
  };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setMessage("");
      const media = await uploadAdminMedia(file, "categories");
      setForm((current) => ({ ...current, image: media.url || media.image || media.path || "" }));
    } catch (error) {
      setMessage(error.message || "Unable to upload category image");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const toggleCollapsed = (id) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(Number(id))) next.delete(Number(id));
      else next.add(Number(id));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel || "YES"}
        tone={confirmAction?.tone}
        onConfirm={confirmAction?.onConfirm}
        onDiscard={() => setConfirmAction(null)}
      />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Manage Categories</h1>
          <p className="text-sm text-gray-500">
            Maintain nested website categories, subcategories, and storefront visibility.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate("/product")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Back to Products
          </button>
          <button onClick={openCreate} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white shadow">
            Add Category
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="space-y-6">
        <section className="rounded-xl bg-white p-4 shadow">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Active Categories</h2>
              <p className="text-xs text-gray-500">
                {categories.filter((item) => item.status === "Active").length} active of {categories.length} total
              </p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories..."
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="max-h-[720px] overflow-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b text-left text-gray-500">
                <tr>
                  <th className="p-3">Category</th>
                  <th>Parent</th>
                  <th>Description</th>
                  <th>Products</th>
                  <th>Subcategories</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-gray-500">
                      Loading categories...
                    </td>
                  </tr>
                ) : filteredCategories.length ? (
                  filteredCategories.map((category) => {
                    const childCount = flattenedCategories.filter((item) => Number(item.parent_id) === Number(category.id)).length;

                    return (
                    <tr key={category.id} className={`${category.depth ? "bg-[#FCFBF8]" : "bg-white"} border-b`}>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2" style={{ paddingLeft: `${category.depth * 22}px` }}>
                          {childCount ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(category.id)}
                              className="flex h-5 w-5 items-center justify-center rounded border text-xs text-[#8A5A22]"
                              title={collapsedIds.has(category.id) ? "Expand category" : "Collapse category"}
                            >
                              {collapsedIds.has(category.id) ? "+" : "-"}
                            </button>
                          ) : (
                            <span className="h-5 w-5 text-center text-gray-300">.</span>
                          )}
                          {category.image ? (
                            <img src={category.image} alt="" className="h-9 w-9 rounded border object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded border bg-[#FBF8F2] text-xs text-[#A68B5B]">
                              {String(category.name || "C").charAt(0)}
                            </span>
                          )}
                          <span>{category.name}</span>
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500">
                            {category.depth ? `Level ${category.depth + 1}` : "Top level"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-normal text-gray-400" style={{ paddingLeft: `${category.depth * 22 + 64}px` }}>{category.path}</p>
                      </td>
                      <td className="text-gray-500">{category.parent_name || "-"}</td>
                      <td className="text-gray-500">{category.description || "-"}</td>
                      <td>{category.product_count || 0}</td>
                      <td>{childCount}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            category.status === "Active"
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {category.status}
                        </span>
                      </td>
                      <td className="space-x-3 whitespace-nowrap">
                        <button onClick={() => openEdit(category)} className="text-[#C2863F] hover:underline">
                          Edit / move
                        </button>
                        <button onClick={() => removeCategory(category)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-gray-500">
                      No categories found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section ref={formRef} className="scroll-mt-24 rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">{editing ? "Edit Category" : "Add Category"}</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">
              Category Name
              <input
                data-editor-primary
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Parent Category
              <select
                value={form.parent_id}
                onChange={(event) => setForm({ ...form, parent_id: event.target.value })}
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value="">None - top level category</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {"- ".repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-400">
                Use this to create a subcategory or move an existing category under another category.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Category Image
              <input type="file" accept="image/*" onChange={uploadImage} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm" />
              <span className="mt-1 block text-xs text-gray-400">
                Used for top-level storefront cards. Recommended: 1200 x 900 px (4:3).
              </span>
              {uploading && <span className="mt-1 block text-xs text-[#8A5A22]">Uploading image...</span>}
              {form.image && <img src={form.image} alt="" className="mt-2 h-24 w-full rounded-lg border object-cover" />}
              {form.image && <button type="button" onClick={() => setForm({ ...form, image: "" })} className="mt-2 rounded border border-red-200 px-3 py-1.5 text-xs text-red-600">Remove Image</button>}
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-1 h-24 w-full resize-none rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Status
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
            <button className="w-full rounded-lg bg-[#A68B5B] py-2 text-sm font-medium text-white">
              {editing ? "Update Category" : "Create Category"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default ManageCategories;
