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

export async function getStoreTaxRules(_req, res) {
  try {
    const rules = await dbQuery(`
      SELECT
        ctr.id,
        ctr.category_id,
        c.name AS category_name,
        ctr.tax_name,
        ctr.tax_rate
      FROM category_tax_rules ctr
      JOIN categories c ON ctr.category_id = c.id
      WHERE ctr.status = 'Active'
      ORDER BY c.name, ctr.tax_name
    `);

    res.json({ rules });
  } catch (error) {
    console.log("Failed to load public tax rules", error);
    res.status(500).json({ message: "Failed to load tax rules" });
  }
}
