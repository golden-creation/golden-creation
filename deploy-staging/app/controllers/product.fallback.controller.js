import {
  createMockProduct,
  deleteMockProduct,
  getMockProductById,
  getMockProducts,
  updateMockProduct,
} from "../config/mock-store.js";
import { Product } from "../models/product.model.js";
import { syncProductTags } from "../services/merchandising.service.js";
import {
  attachVariantsToProduct,
  dbQuery,
  getProductVariants,
  replaceProductVariants,
} from "../services/variant.service.js";

export const getProducts = (req, res) => {
  const handler = (err, results) => {
    if (err) {
      res.json(getMockProducts(req.query.category));
      return;
    }

    res.json(results);
  };

  const hasAdvancedFilters =
    req.query.q ||
    req.query.search ||
    req.query.brands ||
    req.query.brand_id ||
    req.query.brandId ||
    req.query.tags ||
    req.query.tag ||
    req.query.sort ||
    req.query.page ||
    req.query.limit;

  if (hasAdvancedFilters && typeof Product.search === "function") {
    Product.search(req.query, handler);
    return;
  }

  if (req.query.category && !isNaN(req.query.category)) {
    Product.getAllByCategory(Number(req.query.category), handler);
    return;
  }

  Product.getAll(handler);
};

export const getProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.getById(id, (err, results) => {
    if (err || !results.length) {
      const fallbackProduct = getMockProductById(id);

      if (!fallbackProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      return res.json(fallbackProduct);
    }

    const product = results[0];
    product.images = product.images ? product.images.split(",") : [];
    attachVariantsToProduct(product)
      .then((productWithVariants) => res.json(productWithVariants))
      .catch(() => res.json(product));
  });
};

export const getVariantFilters = async (_req, res) => {
  try {
    const rows = await dbQuery(
      `
        SELECT
          vo.id AS option_id,
          vo.name AS option_name,
          vov.id AS value_id,
          vov.value,
          COUNT(DISTINCT pv.product_id) AS product_count
        FROM variant_options vo
        JOIN variant_option_values vov ON vov.option_id = vo.id
        JOIN variant_attribute_map vam ON vam.option_id = vo.id AND vam.value_id = vov.id
        JOIN product_variants pv ON pv.id = vam.variant_id
        WHERE pv.status = 'Active'
          AND pv.visibility <> 'Hidden'
        GROUP BY vo.id, vo.name, vov.id, vov.value
        ORDER BY vo.name, vov.value
      `
    );

    const filters = rows.reduce((groups, row) => {
      if (!groups[row.option_id]) {
        groups[row.option_id] = {
          id: Number(row.option_id),
          name: row.option_name,
          values: [],
        };
      }

      groups[row.option_id].values.push({
        id: Number(row.value_id),
        value: row.value,
        productCount: Number(row.product_count || 0),
      });

      return groups;
    }, {});

    res.json({ filters: Object.values(filters) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load variant filters" });
  }
};

export const getProductVariantDetail = async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const payload = await getProductVariants(id);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Failed to load product variants" });
  }
};

export const updateProductVariantDetail = async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const payload = await replaceProductVariants(
      id,
      req.body.variantOptions || req.body.variant_options || [],
      req.body.variants || []
    );

    res.json({
      message: "Product variants updated successfully",
      ...payload,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update product variants" });
  }
};

export const createProduct = (req, res) => {
  const {
    name,
    description,
    price,
    category_id,
    brand_id,
    brandId,
    image,
    images,
    sku,
    stock_quantity,
    stock,
    reorder_level,
    status,
    tags,
    tagIds,
    tag_ids,
  } = req.body;

  if (!name || !price || !category_id) {
    return res.status(400).json({
      message: "Name, price and category_id are required",
    });
  }

  Product.create(
    {
      name,
      description,
        price,
        image,
        category_id,
        brand_id: brand_id ?? brandId,
        sku,
      stock_quantity: stock_quantity ?? stock,
      reorder_level,
      status,
    },
    async (err, result) => {
    if (err) {
      const product = createMockProduct({
        name,
        description,
        price,
        image,
        category_id,
        brand_id: brand_id ?? brandId,
        images,
        sku,
        stock_quantity: stock_quantity ?? stock,
        reorder_level,
        status,
      });

      return res.status(201).json({
        message: "Product created successfully",
        product,
      });
    }

    const productId = result.insertId;

    if (images && images.length > 0 && typeof Product.addImages === "function") {
      Product.addImages(productId, images, () => {});
    }

    const tagInput = tags ?? tagIds ?? tag_ids ?? [];
    syncProductTags(productId, tagInput).finally(() => {});

    const variantOptions = req.body.variantOptions || req.body.variant_options || [];
    const variants = req.body.variants || [];
    let variantPayload = {
      variants: [],
      variantOptions: [],
    };

    if ((req.body.hasVariants || req.body.has_variants) && variants.length) {
      try {
        variantPayload = await replaceProductVariants(productId, variantOptions, variants);
      } catch (variantError) {
        return res.status(400).json({
          message: variantError.message || "Product saved but variants could not be saved",
        });
      }
    }

    res.status(201).json({
      message: "Product created successfully",
      product: {
        id: productId,
        name,
        description,
        price: Number(price),
        image: image || null,
        category_id: Number(category_id),
        brand_id: Number(brand_id ?? brandId) || null,
        sku: sku || null,
        stock_quantity: Number(stock_quantity ?? stock ?? 0) || 0,
        reorder_level: Number(reorder_level ?? 10) || 10,
        status: status || "Active",
        tags: Array.isArray(tagInput) ? tagInput : [],
        hasVariants: variantPayload.variants.length > 0,
        variants: variantPayload.variants,
        variantOptions: variantPayload.variantOptions,
      },
    });
  });
};

export const updateProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.update(id, req.body, async (err) => {
    if (err) {
      const product = updateMockProduct(id, req.body);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      return res.json({ message: "Product updated successfully", product });
    }

    const tagInput = req.body.tags ?? req.body.tagIds ?? req.body.tag_ids;

    if (tagInput !== undefined) {
      syncProductTags(id, tagInput).finally(() => {});
    }

    if (
      req.body.hasVariants !== undefined ||
      req.body.has_variants !== undefined ||
      req.body.variants !== undefined ||
      req.body.variantOptions !== undefined ||
      req.body.variant_options !== undefined
    ) {
      try {
        if (req.body.hasVariants || req.body.has_variants) {
          await replaceProductVariants(
            id,
            req.body.variantOptions || req.body.variant_options || [],
            req.body.variants || []
          );
        } else {
          await replaceProductVariants(id, [], []);
        }
      } catch (variantError) {
        return res.status(400).json({
          message: variantError.message || "Product updated but variants could not be saved",
        });
      }
    }

    const variantPayload = await getProductVariants(id).catch(() => ({
      variants: [],
      variantOptions: [],
    }));

    res.json({
      message: "Product updated successfully",
      variants: variantPayload.variants,
      variantOptions: variantPayload.variantOptions,
    });
  });
};

export const deleteProduct = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  Product.delete(id, (err) => {
    if (err) {
      const product = deleteMockProduct(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      return res.json({ message: "Product deleted successfully", product });
    }

    res.json({ message: "Product deleted successfully" });
  });
};
