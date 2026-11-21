import db from "../config/db.js";

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

function parseJson(value, fallback = []) {
  try {
    return typeof value === "string" ? JSON.parse(value || "[]") : value || fallback;
  } catch {
    return fallback;
  }
}

function normalizeEnquiry(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    products: parseJson(row.products_json, []),
  };
}

export async function submitCorporateEnquiry(req, res) {
  const payload = {
    companyName: cleanString(req.body.companyName || req.body.company_name),
    contactName: cleanString(req.body.contactName || req.body.contact_name),
    email: cleanString(req.body.email),
    phone: cleanString(req.body.phone),
    whatsapp: cleanString(req.body.whatsapp),
    enquiryType: cleanString(req.body.enquiryType || req.body.enquiry_type) || "Corporate Order",
    budgetRange: cleanString(req.body.budgetRange || req.body.budget_range),
    timeline: cleanString(req.body.timeline),
    message: cleanString(req.body.message),
    products: Array.isArray(req.body.products) ? req.body.products : [],
  };

  if (!payload.companyName || !payload.contactName || !payload.email || !payload.phone) {
    return res.status(400).json({ message: "Company, contact name, email and phone are required" });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO corporate_enquiries
          (company_name, contact_name, email, phone, whatsapp, enquiry_type, budget_range, timeline, products_json, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.companyName,
        payload.contactName,
        payload.email,
        payload.phone,
        payload.whatsapp || null,
        payload.enquiryType,
        payload.budgetRange || null,
        payload.timeline || null,
        JSON.stringify(payload.products),
        payload.message || null,
      ]
    );

    await dbQuery(
      `
        INSERT INTO admin_notifications (type, title, message, link)
        VALUES ('corporate_enquiry', 'New corporate enquiry', ?, '/corporate-enquiries')
      `,
      [`${payload.companyName} requested ${payload.enquiryType}`]
    ).catch(() => {});

    res.status(201).json({
      message: "Corporate enquiry submitted",
      enquiry: { id: result.insertId, ...payload, status: "New" },
    });
  } catch (error) {
    console.log("Corporate Enquiry Error:", error);
    res.status(500).json({ message: "Failed to submit corporate enquiry" });
  }
}

export async function getAdminCorporateEnquiries(req, res) {
  const q = cleanString(req.query.q);
  const status = cleanString(req.query.status);
  const values = [];
  const where = ["1=1"];

  if (q) {
    where.push("(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (status) {
    where.push("status = ?");
    values.push(status);
  }

  try {
    const rows = await dbQuery(
      `
        SELECT *
        FROM corporate_enquiries
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 200
      `,
      values
    );

    res.json({
      enquiries: rows.map(normalizeEnquiry),
      metrics: {
        total: rows.length,
        new: rows.filter((item) => item.status === "New").length,
        inProgress: rows.filter((item) => item.status === "In Progress").length,
        closed: rows.filter((item) => item.status === "Closed").length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load corporate enquiries" });
  }
}

export async function getAdminCorporateEnquiryDetail(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM corporate_enquiries WHERE id = ? LIMIT 1", [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Corporate enquiry not found" });
    }

    res.json({ enquiry: normalizeEnquiry(rows[0]) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load corporate enquiry" });
  }
}

export async function updateAdminCorporateEnquiry(req, res) {
  const status = cleanString(req.body.status) || "New";
  const adminNotes = cleanString(req.body.adminNotes || req.body.admin_notes);

  try {
    await dbQuery(
      `
        UPDATE corporate_enquiries
        SET status = ?, admin_notes = ?
        WHERE id = ?
      `,
      [status, adminNotes || null, req.params.id]
    );

    res.json({ message: "Corporate enquiry updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update corporate enquiry" });
  }
}
