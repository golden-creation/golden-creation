import db from "../config/db.js";

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(results);
    });
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallbackValue = null) {
  if (!value) return fallbackValue;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function normalizeVariantRow(row = {}) {
  const optionRows = cleanString(row.options_text)
    ? cleanString(row.options_text)
        .split("||")
        .map((item) => {
          const [optionId, optionName, valueId, value] = item.split("::");
          return {
            optionId: Number(optionId) || null,
            optionName: cleanString(optionName),
            valueId: Number(valueId) || null,
            value: cleanString(value),
          };
        })
    : parseJson(row.options_json, []);
  const options = Array.isArray(optionRows)
    ? optionRows
        .map((option) => ({
          optionId: Number(option.optionId || option.option_id) || null,
          optionName: cleanString(option.optionName || option.option_name),
          valueId: Number(option.valueId || option.value_id) || null,
          value: cleanString(option.value),
        }))
        .filter((option) => option.optionName && option.value)
    : [];

  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    productId: Number(row.product_id),
    sku: row.sku || "",
    barcode: row.barcode || "",
    price: Number(row.price || 0),
    compare_price: row.compare_price === null ? null : Number(row.compare_price || 0),
    comparePrice: row.compare_price === null ? null : Number(row.compare_price || 0),
    cost_price: row.cost_price === null ? null : Number(row.cost_price || 0),
    costPrice: row.cost_price === null ? null : Number(row.cost_price || 0),
    stock: Number(row.stock || 0),
    weight: row.weight === null ? null : Number(row.weight || 0),
    weight_unit: row.weight_unit || "",
    weightUnit: row.weight_unit || "",
    dimensions: parseJson(row.dimensions, row.dimensions || null),
    specifications: parseJson(row.specifications, row.specifications || null),
    image: row.image || "",
    status: row.status || "Active",
    visibility: row.visibility || "Visible",
    is_default: Boolean(row.is_default),
    isDefault: Boolean(row.is_default),
    created_at: row.created_at,
    updated_at: row.updated_at,
    options,
    optionSummary: options.map((option) => `${option.optionName}: ${option.value}`).join(" / "),
  };
}

function normalizeOptionPayload(option = {}) {
  const name = cleanString(option.name || option.optionName || option.label);
  const values = Array.isArray(option.values)
    ? option.values
    : cleanString(option.valuesText || option.value || "")
        .split(",")
        .map((item) => item.trim());

  return {
    name,
    values: [...new Set(values.map(cleanString).filter(Boolean))],
  };
}

async function ensureOption(name) {
  const optionName = cleanString(name);
  if (!optionName) return null;

  await dbQuery(
    `
      INSERT INTO variant_options (name)
      VALUES (?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `,
    [optionName]
  );

  const rows = await dbQuery("SELECT id, name FROM variant_options WHERE name = ? LIMIT 1", [optionName]);
  return rows[0] || null;
}

async function ensureOptionValue(optionId, value) {
  const optionValue = cleanString(value);
  if (!optionId || !optionValue) return null;

  await dbQuery(
    `
      INSERT INTO variant_option_values (option_id, value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `,
    [optionId, optionValue]
  );

  const rows = await dbQuery(
    "SELECT id, option_id, value FROM variant_option_values WHERE option_id = ? AND value = ? LIMIT 1",
    [optionId, optionValue]
  );
  return rows[0] || null;
}

export async function getProductVariants(productId) {
  const rows = await dbQuery(
    `
      SELECT
        pv.*,
        GROUP_CONCAT(
          DISTINCT
          CASE
            WHEN vo.id IS NULL THEN NULL
            ELSE CONCAT_WS('::', vo.id, vo.name, vov.id, vov.value)
          END
          ORDER BY vo.id
          SEPARATOR '||'
        ) AS options_text
      FROM product_variants pv
      LEFT JOIN variant_attribute_map vam ON vam.variant_id = pv.id
      LEFT JOIN variant_options vo ON vo.id = vam.option_id
      LEFT JOIN variant_option_values vov ON vov.id = vam.value_id
      WHERE pv.product_id = ?
      GROUP BY pv.id
      ORDER BY pv.is_default DESC, pv.id
    `,
    [productId]
  );

  const variants = rows.map(normalizeVariantRow);
  const optionMap = new Map();

  variants.forEach((variant) => {
    variant.options.forEach((option) => {
      if (!optionMap.has(option.optionId)) {
        optionMap.set(option.optionId, {
          id: option.optionId,
          name: option.optionName,
          values: [],
        });
      }

      const group = optionMap.get(option.optionId);
      if (!group.values.some((item) => Number(item.id) === Number(option.valueId))) {
        group.values.push({
          id: option.valueId,
          value: option.value,
        });
      }
    });
  });

  return {
    variants,
    variantOptions: Array.from(optionMap.values()),
  };
}

export async function attachVariantsToProduct(product) {
  if (!product?.id) return product;

  try {
    const { variants, variantOptions } = await getProductVariants(product.id);
    const activeVariants = variants.filter(
      (variant) => variant.status === "Active" && variant.visibility !== "Hidden"
    );
    const defaultVariant =
      activeVariants.find((variant) => variant.isDefault || variant.is_default) ||
      activeVariants[0] ||
      variants[0] ||
      null;

    return {
      ...product,
      hasVariants: variants.length > 0,
      has_variants: variants.length > 0,
      variants,
      variantOptions,
      defaultVariant,
    };
  } catch {
    return {
      ...product,
      hasVariants: false,
      has_variants: false,
      variants: [],
      variantOptions: [],
      defaultVariant: null,
    };
  }
}

export async function replaceProductVariants(productId, variantOptionsPayload = [], variantsPayload = []) {
  const productIdNumber = Number(productId);
  if (!productIdNumber) {
    throw new Error("Product ID is required for variants");
  }

  const normalizedOptions = variantOptionsPayload
    .map(normalizeOptionPayload)
    .filter((option) => option.name && option.values.length);
  const normalizedVariants = Array.isArray(variantsPayload) ? variantsPayload : [];

  if (!normalizedOptions.length || !normalizedVariants.length) {
    await dbQuery("DELETE FROM product_variants WHERE product_id = ?", [productIdNumber]);
    return getProductVariants(productIdNumber);
  }

  const optionLookup = new Map();

  for (const option of normalizedOptions) {
    const optionRow = await ensureOption(option.name);
    if (!optionRow) continue;

    const valueLookup = new Map();
    for (const value of option.values) {
      const valueRow = await ensureOptionValue(optionRow.id, value);
      if (valueRow) {
        valueLookup.set(cleanString(value).toLowerCase(), valueRow);
      }
    }

    optionLookup.set(option.name.toLowerCase(), {
      row: optionRow,
      values: valueLookup,
    });
  }

  let defaultAssigned = false;
  const existingVariants = await dbQuery(
    "SELECT id, sku FROM product_variants WHERE product_id = ?",
    [productIdNumber]
  );
  const existingBySku = new Map(
    existingVariants.map((variant) => [cleanString(variant.sku).toLowerCase(), variant])
  );
  const keptVariantIds = [];

  for (const [index, rawVariant] of normalizedVariants.entries()) {
    const rawOptions = Array.isArray(rawVariant.options) ? rawVariant.options : [];
    const sku =
      cleanString(rawVariant.sku) ||
      `LM-${productIdNumber}-VAR-${String(index + 1).padStart(2, "0")}`;
    const isDefault = Boolean(rawVariant.isDefault || rawVariant.is_default || (!defaultAssigned && index === 0));

    const variantValues = [
      cleanString(rawVariant.barcode) || null,
      toMoney(rawVariant.price),
      rawVariant.comparePrice || rawVariant.compare_price ? toMoney(rawVariant.comparePrice ?? rawVariant.compare_price) : null,
      rawVariant.costPrice || rawVariant.cost_price ? toMoney(rawVariant.costPrice ?? rawVariant.cost_price) : null,
      Math.max(0, Number(rawVariant.stock) || 0),
      rawVariant.weight ? Number(rawVariant.weight) || null : null,
      cleanString(rawVariant.weightUnit || rawVariant.weight_unit) || null,
      rawVariant.dimensions ? JSON.stringify(rawVariant.dimensions) : null,
      rawVariant.specifications ? JSON.stringify(rawVariant.specifications) : null,
      cleanString(rawVariant.image) || null,
      cleanString(rawVariant.status) || "Active",
      cleanString(rawVariant.visibility) || "Visible",
      isDefault,
    ];
    const existingVariant = existingBySku.get(sku.toLowerCase());
    let variantId = existingVariant?.id || null;

    if (variantId) {
      await dbQuery(
        `
          UPDATE product_variants
          SET barcode = ?, price = ?, compare_price = ?, cost_price = ?, stock = ?,
              weight = ?, weight_unit = ?, dimensions = ?, specifications = ?,
              image = ?, status = ?, visibility = ?, is_default = ?
          WHERE id = ?
        `,
        [...variantValues, variantId]
      );
      await dbQuery("DELETE FROM variant_attribute_map WHERE variant_id = ?", [variantId]);
    } else {
      const insertResult = await dbQuery(
        `
          INSERT INTO product_variants
            (product_id, sku, barcode, price, compare_price, cost_price, stock,
             weight, weight_unit, dimensions, specifications, image, status, visibility, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [productIdNumber, sku, ...variantValues]
      );
      variantId = insertResult.insertId;
    }

    keptVariantIds.push(Number(variantId));

    if (isDefault) {
      defaultAssigned = true;
    }

    for (const option of rawOptions) {
      const optionName = cleanString(option.optionName || option.name);
      const optionValue = cleanString(option.value);
      const optionMatch = optionLookup.get(optionName.toLowerCase());
      const valueMatch = optionMatch?.values.get(optionValue.toLowerCase());

      if (!optionMatch?.row?.id || !valueMatch?.id) continue;

      await dbQuery(
        `
          INSERT INTO variant_attribute_map (variant_id, option_id, value_id)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value_id = VALUES(value_id)
        `,
        [variantId, optionMatch.row.id, valueMatch.id]
      );
    }
  }

  if (keptVariantIds.length) {
    await dbQuery(
      `
        DELETE FROM product_variants
        WHERE product_id = ?
          AND id NOT IN (${keptVariantIds.map(() => "?").join(", ")})
      `,
      [productIdNumber, ...keptVariantIds]
    );
  }

  return getProductVariants(productIdNumber);
}

export async function findVariantForCart(productId, variantId) {
  if (!variantId) return null;

  const rows = await dbQuery(
    `
      SELECT *
      FROM product_variants
      WHERE id = ?
        AND product_id = ?
      LIMIT 1
    `,
    [variantId, productId]
  );

  return rows[0] ? normalizeVariantRow(rows[0]) : null;
}

export async function deductVariantStock(variantId, quantity) {
  const result = await dbQuery(
    `
      UPDATE product_variants
      SET stock = stock - ?
      WHERE id = ?
        AND stock >= ?
    `,
    [quantity, variantId, quantity]
  );

  return Number(result.affectedRows || 0) > 0;
}

export { dbQuery, cleanString, toMoney };
