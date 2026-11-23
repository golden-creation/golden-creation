import mysql from "mysql2";
import "./load-env.js";

const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000;
const queryTimeout = Number(process.env.DB_QUERY_TIMEOUT_MS) || 15000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lekhanmart",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  connectTimeout,
});

pool.getConnection((error, connection) => {
  if (error) {
    console.log("DB Error:", error);
    return;
  }

  connection.release();
  console.log("MySQL pool connected");
});

function normalizeQueryArgs(values, callback) {
  if (typeof values === "function") {
    return { values: [], callback: values };
  }

  return {
    values: Array.isArray(values) ? values : [],
    callback,
  };
}

function invokeCallback(callback, error, results, fields) {
  if (typeof callback !== "function") {
    return;
  }

  queueMicrotask(() => callback(error, results, fields));
}

const db = {
  query(sql, values, callback) {
    const queryArgs = normalizeQueryArgs(values, callback);
    const queryOptions = {
      sql,
      timeout: queryTimeout,
    };

    try {
      pool.query(queryOptions, queryArgs.values, (error, results, fields) => {
        invokeCallback(queryArgs.callback, error, results, fields);
      });
    } catch (error) {
      invokeCallback(queryArgs.callback, error);
    }
  },

  getConnection(callback) {
    pool.getConnection(callback);
  },

  end(callback) {
    pool.end(callback);
  },
};

export default db;
