import db from "../config/db.js";
import { mockCategories } from "../config/mock-store.js";

function normaliseCategory(category) {
  return {
    ...category,
    id: Number(category.id),
    name:
      category.name ||
      category.category_name ||
      category.categoryName ||
      category.title ||
      "Uncategorized",
  };
}

export const getCategories = (_req, res) => {
  db.query("SELECT * FROM categories WHERE COALESCE(status, 'Active') = 'Active' ORDER BY name", (err, result) => {
    if (err) {
      db.query("SELECT * FROM categories ORDER BY name", (fallbackError, fallbackResult) => {
        if (fallbackError) {
          res.json(mockCategories.map(normaliseCategory));
          return;
        }

        res.json(fallbackResult.map(normaliseCategory));
      });
      return;
    }

    res.json(result.map(normaliseCategory));
  });
};

export const createCategory = (req, res) => {
  const trimmedName = String(req.body?.name || "").trim();

  if (!trimmedName) {
    return res.status(400).json({ message: "Category name is required" });
  }

  db.query(
    "INSERT INTO categories (name, description, status) VALUES (?, ?, ?)",
    [trimmedName, req.body?.description || null, req.body?.active === false ? "Inactive" : "Active"],
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
          description: req.body?.description || "",
          status: req.body?.active === false ? "Inactive" : "Active",
        },
      });
    }
  );
};
