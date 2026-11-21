import db from "../config/db.js";

const sql = `
  SELECT b.id, b.name, COUNT(p.id) AS product_count
  FROM brands b
  LEFT JOIN products p ON p.brand_id = b.id
  WHERE b.deleted_at IS NULL AND b.status = 'Active'
  GROUP BY b.id
  ORDER BY b.name ASC
  LIMIT 5
`;

db.query(sql, (err, rows) => {
  if (err) {
    console.log("QUERY_ERR", err.code || "", err.sqlMessage || err.message);
    process.exit(1);
  }

  console.log("QUERY_OK", rows.length, rows.map((row) => row.name).join(" | "));
  db.query("SELECT COUNT(*) AS total, SUM(status = 'Active') AS active_count FROM brands", (countError, countRows) => {
    if (countError) {
      console.log("COUNT_ERR", countError.sqlMessage || countError.message);
      process.exit(1);
    }
    console.log("BRAND_ROWS", countRows[0].total, "ACTIVE", countRows[0].active_count);
    process.exit(0);
  });
});
