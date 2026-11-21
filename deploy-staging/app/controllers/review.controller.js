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

function parseJson(value, fallbackValue = []) {
  if (!value) return fallbackValue;
  if (Array.isArray(value)) return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

export async function getProductReviews(req, res) {
  const productId = Number(req.params.id);

  if (!productId) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const reviews = await dbQuery(
      `
        SELECT
          id,
          customer_name,
          rating,
          review_text,
          review_images,
          created_at
        FROM product_reviews
        WHERE product_id = ?
          AND status = 'Published'
        ORDER BY created_at DESC
      `,
      [productId]
    );

    const averageRating = reviews.length
      ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
      : 0;

    res.json({
      averageRating: Number(averageRating.toFixed(1)),
      reviewCount: reviews.length,
      reviews: reviews.map((review) => ({
        ...review,
        review_images: parseJson(review.review_images),
      })),
    });
  } catch (error) {
    console.log("Reviews Error:", error);
    res.status(500).json({ message: "Failed to load reviews" });
  }
}

export async function createProductReview(req, res) {
  const productId = Number(req.params.id);
  const orderNumber = cleanString(req.body?.orderNumber);
  const email = cleanString(req.body?.email).toLowerCase();
  const phone = cleanString(req.body?.phone);
  const rating = Math.max(1, Math.min(5, Number(req.body?.rating) || 0));
  const reviewText = cleanString(req.body?.reviewText);
  const reviewImages = Array.isArray(req.body?.images)
    ? req.body.images
        .filter(
          (image) =>
            typeof image === "string" &&
            (image.startsWith("data:image/") || /^https:\/\/.+/i.test(image))
        )
        .slice(0, 4)
    : [];

  if (!productId || !orderNumber || !rating || (!email && !phone)) {
    return res.status(400).json({
      message: "Delivered order, customer contact and rating are required",
    });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT
          o.id AS order_id,
          o.user_id,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.order_status,
          oi.product_id
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.order_number = ?
          AND oi.product_id = ?
          AND (
            (? <> '' AND o.customer_email = ?)
            OR (? <> '' AND o.customer_phone = ?)
          )
        LIMIT 1
      `,
      [orderNumber, productId, email, email, phone, phone]
    );
    const order = rows[0];

    if (!order) {
      return res.status(403).json({
        message: "This product can be reviewed only from a matching order",
      });
    }

    if (order.order_status !== "Delivered") {
      return res.status(403).json({
        message: "Ratings become available after the order is delivered",
      });
    }

    await dbQuery(
      `
        INSERT INTO product_reviews (
          product_id,
          order_id,
          user_id,
          customer_name,
          customer_email,
          customer_phone,
          rating,
          review_text,
          review_images,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Published')
        ON DUPLICATE KEY UPDATE
          rating = VALUES(rating),
          review_text = VALUES(review_text),
          review_images = VALUES(review_images),
          status = 'Published',
          updated_at = NOW()
      `,
      [
        productId,
        order.order_id,
        order.user_id,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        rating,
        reviewText || null,
        JSON.stringify(reviewImages),
      ]
    );

    res.status(201).json({ message: "Review saved" });
  } catch (error) {
    console.log("Create Review Error:", error);
    res.status(500).json({ message: "Failed to save review" });
  }
}
