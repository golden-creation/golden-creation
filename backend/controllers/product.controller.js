import { Product } from "../models/product.model.js";


// ============================
// ✅ GET ALL PRODUCTS
// ============================
export const getProducts = (req, res) => {
  const { category } = req.query;

  const handler = (err, results) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({ message: "Server error" });
    }

    res.json(results);
  };

  // ✅ prevent NaN
  if (category && !isNaN(category)) {
    Product.getAllByCategory(Number(category), handler);
    return;
  }

  Product.getAll(handler);
};



// ============================
// ✅ GET SINGLE PRODUCT (WITH MULTIPLE IMAGES)
// ============================
export const getProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.getById(id, (err, results) => {
    if (err) {
      console.error("Error fetching product:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (!results.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = results[0];

    // ✅ FIX: convert images string → array
    if (product.images) {
      product.images = product.images.split(",");
    } else {
      product.images = [];
    }

    res.json(product);
  });
};



// ============================
// ✅ CREATE PRODUCT (WITH MULTIPLE IMAGES)
// ============================
export const createProduct = (req, res) => {
  const { name, description, price, category_id, images } = req.body;

  if (!name || !price || !category_id) {
    return res.status(400).json({
      message: "Name, price and category_id are required",
    });
  }

  Product.create({ name, description, price, category_id }, (err, result) => {
    if (err) {
      console.error("Error creating product:", err);
      return res.status(500).json({ message: "Server error" });
    }

    const productId = result.insertId;

    // ✅ insert multiple images if provided
    if (images && images.length > 0) {
      Product.addImages(productId, images, (err) => {
        if (err) {
          console.error("Error adding images:", err);
        }
      });
    }

    res.json({ message: "Product created successfully" });
  });
};



// ============================
// ✅ UPDATE PRODUCT
// ============================
export const updateProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.update(id, req.body, (err) => {
    if (err) {
      console.error("Error updating product:", err);
      return res.status(500).json({ message: "Server error" });
    }

    res.json({ message: "Product updated successfully" });
  });
};



// ============================
// ✅ DELETE PRODUCT
// ============================
export const deleteProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.delete(id, (err) => {
    if (err) {
      console.error("Error deleting product:", err);
      return res.status(500).json({ message: "Server error" });
    }

    res.json({ message: "Product deleted successfully" });
  });
};
