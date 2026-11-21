import {
  createMockProduct,
  deleteMockProduct,
  getMockProductById,
  getMockProducts,
  updateMockProduct,
} from "../config/mock-store.js";
import { Product } from "../models/product.model.js";
import { syncProductTags } from "../services/merchandising.service.js";
import { ensureProductSlug, slugify } from "../services/seo.service.js";
import {
  attachVariantsToProduct,
  dbQuery,
  getProductVariants,
  replaceProductVariants,
} from "../services/variant.service.js";

async function syncProductImageList(productId, primaryImage, images) {
  if (!Array.isArray(images)) return;
  const unique = [
    primaryImage,
    ...images,
  ]
    .map((value, index) => {
      if (typeof value === "string") {
        return { url: value.trim(), sortOrder: index + 1 };
      }
      return {
        url: String(value?.url || value?.image_url || value?.image || "").trim(),
        altText: String(value?.altText || value?.alt_text || value?.alt || "").trim(),
        titleText: String(value?.titleText || value?.title_text || "").trim(),
        caption: String(value?.caption || "").trim(),
        description: String(value?.description || "").trim(),
        seoFilename: String(value?.seoFilename || value?.seo_filename || "").trim(),
        sortOrder: Number(value?.sortOrder || value?.sort_order || index + 1) || index + 1,
        key: String(value?.key || value?.storage_key || "").trim(),
      };
    })
    .filter((value, index, list) => value.url && list.findIndex((item) => item.url === value.url) === index);
  await dbQuery("DELETE FROM product_images WHERE product_id=?", [productId]);
  for (const image of unique) {
    await dbQuery(
      `INSERT INTO product_images
        (product_id,image_url,alt_text,title_text,caption,description,seo_filename,sort_order,storage_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        productId,
        image.url,
        image.altText || null,
        image.titleText || image.altText || null,
        image.caption || null,
        image.description || null,
        image.seoFilename || null,
        image.sortOrder,
        image.key || null,
      ]
    );
  }
  await dbQuery("UPDATE products SET image=? WHERE id=?", [unique[0]?.url || null, productId]);
}

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
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({ message: "Invalid product identifier" });
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
    const fallbackImages = product.images ? product.images.split(",").filter(Boolean) : [];
    dbQuery(
      `SELECT id, image_url AS url, alt_text AS altText, title_text AS titleText,
              caption, description, seo_filename AS seoFilename, sort_order AS sortOrder, storage_key AS storageKey
         FROM product_images
        WHERE product_id = ?
        ORDER BY COALESCE(NULLIF(sort_order, 0), id), id`,
      [product.id]
    )
      .then((imageRows) => {
        product.imagesDetailed = imageRows;
        product.images = imageRows.length ? imageRows.map((image) => image.url).filter(Boolean) : fallbackImages;
        return attachVariantsToProduct(product);
      })
      .then((productWithVariants) => res.json(productWithVariants))
      .catch(() => {
        product.images = fallbackImages;
        res.json(product);
      });
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

export const createProduct = async (req, res) => {
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
    barcode,
    weight,
    weight_unit,
    weightUnit,
    dimensions,
    specifications,
    gst_inclusive,
    gstInclusive,
    tags,
    tagIds,
    tag_ids,
    slug,
    meta_title,
    metaTitle,
    meta_description,
    metaDescription,
    seo_description,
    seoDescription,
    focus_keyword,
    focusKeyword,
    search_keywords,
    searchKeywords,
    canonical_url,
    canonicalUrl,
    robots_directive,
    robotsDirective,
    og_image,
    ogImage,
    schema_override_json,
    schemaOverrideJson,
  } = req.body;

  if (!name || !price || !category_id) {
    return res.status(400).json({
      message: "Name, price and category_id are required",
    });
  }

  const canonicalSlug = await ensureProductSlug(0, name, slug);

  Product.create(
    {
      name,
      description,
        price,
        image,
        category_id,
        brand_id: brand_id ?? brandId,
        sku,
        barcode,
        weight,
        weight_unit: weight_unit ?? weightUnit,
        dimensions,
        specifications,
        gst_inclusive: gst_inclusive ?? gstInclusive,
        slug: canonicalSlug,
        meta_title: meta_title || metaTitle,
        meta_description: meta_description || metaDescription,
        seo_description: seo_description || seoDescription,
        focus_keyword: focus_keyword || focusKeyword,
        search_keywords: search_keywords || searchKeywords,
        canonical_url: canonical_url || canonicalUrl,
        robots_directive: robots_directive || robotsDirective,
        og_image: og_image || ogImage,
        schema_override_json: schema_override_json || schemaOverrideJson,
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
        barcode,
        weight,
        weight_unit: weight_unit ?? weightUnit,
        dimensions,
        specifications,
        gst_inclusive: gst_inclusive ?? gstInclusive,
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

    await dbQuery("UPDATE products SET slug=? WHERE id=?", [canonicalSlug, productId]).catch(() => {});
    await syncProductImageList(productId, image, images || (image ? [image] : []));

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
        slug: canonicalSlug,
        name,
        description,
        price: Number(price),
        image: image || null,
        category_id: Number(category_id),
        brand_id: Number(brand_id ?? brandId) || null,
        sku: sku || null,
        barcode: barcode || null,
        weight: Number(weight || 0) || null,
        weight_unit: weight_unit || weightUnit || null,
        dimensions: dimensions || null,
        specifications: specifications || null,
        gst_inclusive: gst_inclusive === false || gstInclusive === false || Number(gst_inclusive ?? gstInclusive) === 0 ? 0 : 1,
        stock_quantity: Number(stock_quantity ?? stock ?? 0) || 0,
        reorder_level: Number(reorder_level ?? 0) || 0,
        status: status || "Active",
        tags: Array.isArray(tagInput) ? tagInput : [],
        hasVariants: variantPayload.variants.length > 0,
        variants: variantPayload.variants,
        variantOptions: variantPayload.variantOptions,
      },
    });
  });
};

export const updateProduct = async (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  if (req.body?.slug || req.body?.name) {
    req.body.slug = await ensureProductSlug(id, req.body.name, req.body.slug).catch(() => slugify(req.body.slug || req.body.name));
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

    if (Array.isArray(req.body.images)) {
      await syncProductImageList(id, req.body.image, req.body.images);
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
