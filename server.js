const jsonServer = require("json-server");
const express = require("express");
const { Pool } = require("pg");

const server = express();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

// Postgres connection (adjust with your connection string)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@host:5432/dbname",
  ssl: { rejectUnauthorized: false }, // required for render.com Postgres
});

// Middlewares
server.use(express.json()); // for JSON body parsing
server.use(middlewares);

// 🔹 Example custom API route (Postgres)
server.get("/sync/bills", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bills");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/bills", async (req, res) => {
  try {
    const { data } = req.body;
    const result = await pool.query(
      "INSERT INTO bills (data) VALUES ($1) RETURNING *",
      [data]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ...existing code...

// Sync inventory table
server.get("/sync/inventory", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM inventory");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/inventory", async (req, res) => {
  try {
    const { data } = req.body;
    const result = await pool.query(
      "INSERT INTO inventory (data) VALUES ($1) RETURNING *",
      [data]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Sync supply table
server.get("/sync/supply", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM supply");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/supply", async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      "INSERT INTO supply (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ...existing code...

// 🔹 Mount json-server router last
server.use(router);

server.listen(process.env.PORT || 10000, () => {
  console.log("Server is running with JSON + Express routes");
});
