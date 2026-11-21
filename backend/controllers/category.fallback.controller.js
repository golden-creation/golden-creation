import db from "../config/db.js";
import { mockCategories } from "../config/mock-store.js";

function normaliseCategory(category) {
  return {
    ...category,
    id: Number(category.id),
    parent_id: category.parent_id ? Number(category.parent_id) : null,
    name:
      category.name ||
      category.category_name ||
      category.categoryName ||
      category.title ||
      "Uncategorized",
  };
}

function attachCategoryPaths(categories) {
  const normalized = categories.map(normaliseCategory);
  const byId = new Map(normalized.map((category) => [category.id, category]));

  return normalized.map((category) => {
    const names = [category.name];
    let parentId = category.parent_id;
    const seen = new Set([category.id]);

    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      names.unshift(parent.name);
      seen.add(parent.id);
      parentId = parent.parent_id;
    }

    return {
      ...category,
      path: names.join(" > "),
    };
  });
}

export const getCategories = (_req, res) => {
  db.query("SELECT * FROM categories WHERE COALESCE(status, 'Active') = 'Active' ORDER BY parent_id IS NOT NULL, name", (err, result) => {
    if (err) {
      db.query("SELECT * FROM categories ORDER BY name", (fallbackError, fallbackResult) => {
        if (fallbackError) {
          res.json(attachCategoryPaths(mockCategories));
          return;
        }

        res.json(attachCategoryPaths(fallbackResult));
      });
      return;
    }

    res.json(attachCategoryPaths(result));
  });
};

export const createCategory = (req, res) => {
  const trimmedName = String(req.body?.name || "").trim();
  const parentId = Number(req.body?.parent_id || req.body?.parentId) || null;
  const image = String(req.body?.image || req.body?.image_url || req.body?.imageUrl || "").trim();
  const status = req.body?.active === false || req.body?.status === "Inactive" ? "Inactive" : "Active";

  if (!trimmedName) {
    return res.status(400).json({ message: "Category name is required" });
  }

  db.query(
    "INSERT INTO categories (name, parent_id, slug, image, description, status) VALUES (?, ?, ?, ?, ?, ?)",
    [
      trimmedName,
      parentId,
      trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      image || null,
      req.body?.description || null,
      status,
    ],
    (err, result) => {
      if (err) {
        db.query("INSERT INTO categories (name) VALUES (?)", [trimmedName], (fallbackError, fallbackResult) => {
          if (!fallbackError) {
            return res.status(201).json({
              message: "Category created successfully",
              category: {
                id: fallbackResult.insertId,
                name: trimmedName,
              },
            });
          }

        const existingCategory = mockCategories.find(
          (category) => category.name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (existingCategory) {
          return res.status(409).json({ message: "Category already exists" });
        }

        const nextCategoryId =
          mockCategories.reduce(
            (maxCategoryId, category) =>
              Math.max(maxCategoryId, Number(category.id) || 0),
            0
          ) + 1;

        const category = {
          id: nextCategoryId,
          name: trimmedName,
        };

        mockCategories.push(category);

        return res.status(201).json({
          message: "Category created successfully",
          category,
        });
        });
        return;
      }

      res.status(201).json({
        message: "Category created successfully",
          category: {
            id: result.insertId,
            name: trimmedName,
            parent_id: parentId,
            image,
            description: req.body?.description || "",
            status,
        },
      });
    }
  );
};
