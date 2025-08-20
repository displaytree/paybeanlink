const jsonServer = require("json-server");
const express = require("express");
const { Pool } = require("pg");

const server = express();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

// Postgres connection (adjust with your connection string)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/paybean",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false, // Only use SSL in production
});

// Initialize database tables if they don't exist
async function initDatabase() {
  try {
    // Create merchants table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create bills table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create inventory table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        merchant_name TEXT NOT NULL,
        date TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(merchant_name, date)
      )
    `);
    
    // Create supply table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supply (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create production table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  }
}

// Call the init function
initDatabase();

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
    
    // Parse the bill data to extract the bill number
    let billData;
    try {
      billData = JSON.parse(data);
    } catch (err) {
      console.error("Failed to parse bill data:", err);
      return res.status(400).json({ error: "Invalid bill data format" });
    }
    
    // Check if a bill with this bill number already exists
    const existingBillResult = await pool.query(
      "SELECT id FROM bills WHERE data->>'billNumber' = $1",
      [billData.billNumber]
    );
    
    let result;
    if (existingBillResult.rows.length > 0) {
      // Update existing bill
      result = await pool.query(
        "UPDATE bills SET data = $1, created_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        [data, existingBillResult.rows[0].id]
      );
      console.log("Updated bill with ID:", existingBillResult.rows[0].id);
    } else {
      // Insert new bill
      result = await pool.query(
        "INSERT INTO bills (data) VALUES ($1) RETURNING *",
        [data]
      );
      console.log("Inserted new bill with ID:", result.rows[0].id);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error syncing bill:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
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
    let inventoryData;
    
    try {
      inventoryData = JSON.parse(data);
    } catch (err) {
      console.error("Failed to parse inventory data:", err);
      return res.status(400).json({ error: "Invalid inventory data format" });
    }
    
    // Check if inventory with this merchant_name and date already exists
    const existingInventoryResult = await pool.query(
      "SELECT id FROM inventory WHERE merchant_name = $1 AND date = $2",
      [inventoryData.merchantName, inventoryData.date]
    );
    
    let result;
    if (existingInventoryResult.rows.length > 0) {
      // Update existing inventory
      result = await pool.query(
        "UPDATE inventory SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        [JSON.stringify(inventoryData.rows), existingInventoryResult.rows[0].id]
      );
      console.log("Updated inventory with ID:", existingInventoryResult.rows[0].id);
    } else {
      // Insert new inventory
      result = await pool.query(
        "INSERT INTO inventory (merchant_name, date, data, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
        [inventoryData.merchantName, inventoryData.date, JSON.stringify(inventoryData.rows)]
      );
      console.log("Inserted new inventory with ID:", result.rows[0].id);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error syncing inventory:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Sync inventories in batch
server.post("/sync/inventories", async (req, res) => {
  try {
    const { data } = req.body;
    let inventoriesArray;
    
    try {
      inventoriesArray = JSON.parse(data);
      if (!Array.isArray(inventoriesArray)) {
        inventoriesArray = [inventoriesArray];
      }
    } catch (err) {
      // If data is already an object/array, use it directly
      inventoriesArray = Array.isArray(data) ? data : [data];
    }
    
    const results = [];
    const errors = [];
    
    // Process each inventory record
    for (const inventory of inventoriesArray) {
      try {
        // Check if inventory with this merchant_name and date already exists
        const existingInventoryResult = await pool.query(
          "SELECT id FROM inventory WHERE merchant_name = $1 AND date = $2",
          [inventory.merchantName, inventory.date]
        );
        
        let result;
        if (existingInventoryResult.rows.length > 0) {
          // Update existing inventory
          result = await pool.query(
            "UPDATE inventory SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
            [JSON.stringify(inventory.rows), existingInventoryResult.rows[0].id]
          );
          console.log("Updated inventory with ID:", existingInventoryResult.rows[0].id);
        } else {
          // Insert new inventory
          result = await pool.query(
            "INSERT INTO inventory (merchant_name, date, data, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
            [inventory.merchantName, inventory.date, JSON.stringify(inventory.rows)]
          );
          console.log("Inserted new inventory with ID:", result.rows[0].id);
        }
        
        results.push(result.rows[0]);
      } catch (err) {
        console.error(`Error processing inventory for ${inventory.merchantName} on ${inventory.date}:`, err.message);
        errors.push({
          inventory: `${inventory.merchantName}-${inventory.date}`,
          error: err.message
        });
      }
    }
    
    res.json({
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (err) {
    console.error("Error in batch inventory sync:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
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

// Sync multiple supplies in batch
server.post("/sync/supplies", async (req, res) => {
  try {
    const { data } = req.body;
    let suppliesArray;
    
    try {
      suppliesArray = JSON.parse(data);
      if (!Array.isArray(suppliesArray)) {
        suppliesArray = [suppliesArray];
      }
    } catch (err) {
      // If data is already an object/array, use it directly
      suppliesArray = Array.isArray(data) ? data : [data];
    }
    
    const results = [];
    const errors = [];
    
    // Process each supply item
    for (const supply of suppliesArray) {
      try {
        // Check if supply with this name already exists
        const existingSupplyResult = await pool.query(
          "SELECT id FROM supply WHERE name = $1",
          [supply.name]
        );
        
        let result;
        if (existingSupplyResult.rows.length > 0) {
          // Supply already exists, skip insertion
          result = await pool.query(
            "SELECT * FROM supply WHERE id = $1",
            [existingSupplyResult.rows[0].id]
          );
          console.log("Supply already exists with ID:", existingSupplyResult.rows[0].id);
        } else {
          // Insert new supply
          result = await pool.query(
            "INSERT INTO supply (name, created_at) VALUES ($1, CURRENT_TIMESTAMP) RETURNING *",
            [supply.name]
          );
          console.log("Inserted new supply with ID:", result.rows[0].id);
        }
        
        results.push(result.rows[0]);
      } catch (err) {
        console.error(`Error processing supply ${supply.name}:`, err.message);
        errors.push({
          supply: supply.name,
          error: err.message
        });
      }
    }
    
    res.json({
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (err) {
    console.error("Error in batch supply sync:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Sync merchants table
server.get("/sync/merchants", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM merchants");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/merchants", async (req, res) => {
  try {
    const { data } = req.body;
    let merchantData;
    
    try {
      merchantData = JSON.parse(data);
    } catch (err) {
      // If data is already an object, no need to parse
      merchantData = data;
    }
    
    // Check if merchant with this name already exists
    const existingMerchantResult = await pool.query(
      "SELECT id FROM merchants WHERE name = $1",
      [merchantData.name]
    );
    
    let result;
    if (existingMerchantResult.rows.length > 0) {
      // Update existing merchant
      result = await pool.query(
        "UPDATE merchants SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
        [existingMerchantResult.rows[0].id]
      );
      console.log("Updated merchant with ID:", existingMerchantResult.rows[0].id);
    } else {
      // Insert new merchant
      result = await pool.query(
        "INSERT INTO merchants (name, created_at) VALUES ($1, CURRENT_TIMESTAMP) RETURNING *",
        [merchantData.name]
      );
      console.log("Inserted new merchant with ID:", result.rows[0].id);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error syncing merchant:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Sync multiple merchants in batch
server.post("/sync/merchants/batch", async (req, res) => {
  try {
    const { data } = req.body;
    let merchantsArray;
    
    try {
      merchantsArray = JSON.parse(data);
      if (!Array.isArray(merchantsArray)) {
        merchantsArray = [merchantsArray];
      }
    } catch (err) {
      // If data is already an object/array, use it directly
      merchantsArray = Array.isArray(data) ? data : [data];
    }
    
    const results = [];
    const errors = [];
    
    // Process each merchant
    for (const merchant of merchantsArray) {
      try {
        // Check if merchant with this name already exists
        const existingMerchantResult = await pool.query(
          "SELECT id FROM merchants WHERE name = $1",
          [merchant.name]
        );
        
        let result;
        if (existingMerchantResult.rows.length > 0) {
          // Update existing merchant
          result = await pool.query(
            "UPDATE merchants SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
            [existingMerchantResult.rows[0].id]
          );
          console.log("Updated merchant with ID:", existingMerchantResult.rows[0].id);
        } else {
          // Insert new merchant
          result = await pool.query(
            "INSERT INTO merchants (name, created_at) VALUES ($1, CURRENT_TIMESTAMP) RETURNING *",
            [merchant.name]
          );
          console.log("Inserted new merchant with ID:", result.rows[0].id);
        }
        
        results.push(result.rows[0]);
      } catch (err) {
        console.error(`Error processing merchant ${merchant.name}:`, err.message);
        errors.push({
          merchant: merchant.name,
          error: err.message
        });
      }
    }
    
    res.json({
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (err) {
    console.error("Error in batch merchant sync:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Production data endpoints
server.get("/sync/production", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM production ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/production", async (req, res) => {
  try {
    const { data } = req.body;
    
    // Parse the production data to extract the date
    let productionData;
    try {
      productionData = JSON.parse(data);
    } catch (err) {
      console.error("Failed to parse production data:", err);
      return res.status(400).json({ error: "Invalid production data format" });
    }
    
    // Check if a production record with this date already exists
    const existingResult = await pool.query(
      "SELECT id FROM production WHERE date = $1",
      [productionData.date]
    );
    
    let result;
    if (existingResult.rows.length > 0) {
      // Update existing production record
      result = await pool.query(
        "UPDATE production SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE date = $2 RETURNING *",
        [productionData, productionData.date]
      );
      console.log("Updated production record with date:", productionData.date);
    } else {
      // Insert new production record
      result = await pool.query(
        "INSERT INTO production (date, data, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *",
        [productionData.date, productionData]
      );
      console.log("Inserted new production record with date:", productionData.date);
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Error in production sync:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// 🔹 Mount json-server router last
server.use(router);

server.listen(process.env.PORT || 10000, () => {
  console.log("Server is running with JSON + Express routes");
});
