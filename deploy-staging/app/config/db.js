import dotenv from "dotenv";
import mysql from "mysql2";

dotenv.config();

const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5000;
const queryTimeout = Number(process.env.DB_QUERY_TIMEOUT_MS) || 3000;

const rawDb = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lekhanmart",
  port: Number(process.env.DB_PORT) || 3306,
  connectTimeout,
});

let connectionReady = false;
let connectionFailed = false;
let lastConnectionError = null;

function isConnectionFailure(error) {
  return Boolean(
    error?.fatal ||
      [
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "PROTOCOL_CONNECTION_LOST",
        "ER_ACCESS_DENIED_ERROR",
        "ER_BAD_DB_ERROR",
      ].includes(error?.code)
  );
}

function markConnectionFailure(error) {
  if (connectionFailed) {
    return;
  }

  connectionFailed = true;
  lastConnectionError = error;
}

rawDb.connect((err) => {
  if (err) {
    markConnectionFailure(err);
    console.log("DB Error:", err);
  } else {
    connectionReady = true;
    console.log("MySQL Connected");
  }
});

rawDb.on("error", (error) => {
  markConnectionFailure(error);
  console.log("DB Error:", error);
});

setTimeout(() => {
  if (!connectionReady && !connectionFailed) {
    const timeoutError = new Error(
      `Database connection timed out after ${connectTimeout}ms`
    );

    markConnectionFailure(timeoutError);
    console.log("DB Error:", timeoutError.message);
  }
}, connectTimeout + 250);

function createQueryTimeoutError(sql) {
  return new Error(
    `Database query timed out after ${queryTimeout}ms for: ${String(sql)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)}`
  );
}

function invokeCallback(callback, error, results, fields) {
  if (typeof callback !== "function") {
    return;
  }

  queueMicrotask(() => callback(error, results, fields));
}

const db = {
  query(sql, values, callback) {
    const hasValues = typeof values !== "function";
    const queryValues = hasValues ? values : [];
    const queryCallback = hasValues ? callback : values;

    if (connectionFailed) {
      invokeCallback(
        queryCallback,
        lastConnectionError || new Error("Database connection unavailable")
      );
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      const timeoutError = createQueryTimeoutError(sql);
      markConnectionFailure(timeoutError);
      invokeCallback(queryCallback, timeoutError);
    }, queryTimeout);

    const finish = (error, results, fields) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (error && isConnectionFailure(error)) {
        markConnectionFailure(error);
      }

      invokeCallback(queryCallback, error, results, fields);
    };

    try {
      if (hasValues) {
        rawDb.query(sql, queryValues, finish);
        return;
      }

      rawDb.query(sql, finish);
    } catch (error) {
      finish(error);
    }
  },
};

export default db;
