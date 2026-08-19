const { Pool } = require("pg");

let pool;

/**
 * Returns a shared connection pool. Supabase's own "Connection Pooling"
 * connection string (found in Supabase dashboard → Project Settings →
 * Database → Connection string → "Transaction" mode) is the right one
 * to use here — it's designed for exactly this kind of server workload.
 */
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. See .env.example.");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false }, // Supabase requires SSL; self-signed chain is normal for their pooler
      max: 10,
    });

    pool.on("error", (err) => {
      // A background/idle client error should never crash the whole
      // process — log it and let the pool recover on the next query.
      console.error("Unexpected Postgres pool error:", err);
    });
  }
  return pool;
}

module.exports = { getPool };
