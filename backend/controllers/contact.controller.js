import db from "../config/db.js";

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function clean(value) {
  return String(value || "").trim();
}

export async function createContactEnquiry(req, res) {
  const firstName = clean(req.body?.firstName);
  const lastName = clean(req.body?.lastName);
  const email = clean(req.body?.email).toLowerCase();
  const subject = clean(req.body?.subject);
  const message = clean(req.body?.message);

  if (!firstName || !email || !subject || !message) {
    return res.status(400).json({ message: "First name, email, subject, and message are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address" });
  }

  try {
    const result = await dbQuery(
      `INSERT INTO contact_enquiries
        (first_name, last_name, email, subject, message, status)
       VALUES (?, ?, ?, ?, ?, 'New')`,
      [firstName, lastName || null, email, subject, message]
    );
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, reference_id, is_read)
       VALUES ('Contact Enquiry', 'New contact enquiry', ?, ?, FALSE)`,
      [`${firstName} submitted: ${subject}`, result.insertId]
    ).catch(() => {});
    return res.status(201).json({
      message: "Your enquiry has been submitted",
      enquiryId: Number(result.insertId),
    });
  } catch (error) {
    console.error("Contact enquiry submission failed:", error);
    return res.status(500).json({ message: "Unable to submit enquiry" });
  }
}

export async function getAdminContactEnquiries(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const q = clean(req.query.q);
  const status = clean(req.query.status);
  const conditions = [];
  const values = [];

  if (q) {
    conditions.push("(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)");
    const term = `%${q}%`;
    values.push(term, term, term, term, term);
  }
  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [rows, countRows] = await Promise.all([
      dbQuery(
        `SELECT * FROM contact_enquiries ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      ),
      dbQuery(`SELECT COUNT(*) AS total FROM contact_enquiries ${where}`, values),
    ]);
    return res.json({
      enquiries: rows,
      pagination: {
        page,
        limit,
        total: Number(countRows[0]?.total || 0),
        totalPages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load enquiries" });
  }
}

export async function updateAdminContactEnquiry(req, res) {
  const id = Number(req.params.id);
  const status = clean(req.body?.status);
  const adminNotes = clean(req.body?.adminNotes);
  const allowed = new Set(["New", "In Progress", "Resolved", "Closed"]);

  if (!id || !allowed.has(status)) {
    return res.status(400).json({ message: "A valid enquiry status is required" });
  }

  try {
    const result = await dbQuery(
      `UPDATE contact_enquiries
       SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, adminNotes || null, id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Enquiry not found" });
    }
    return res.json({ message: "Enquiry updated" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update enquiry" });
  }
}
