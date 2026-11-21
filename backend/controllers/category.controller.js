import db from "../config/db.js";
import { mockCategories } from "../config/mock-store.js";

export const getCategories = (req, res) => {
  db.query("SELECT * FROM categories", (err, result) => {
    if (err) return res.json(mockCategories);
    res.json(result);
  });
};
