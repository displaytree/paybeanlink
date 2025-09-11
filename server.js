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
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE (name, mid)
      )
    `);
    
    // Create bills table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid)
      )
    `);
    
    // Create inventory table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        merchant_name TEXT NOT NULL,
        date TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE(merchant_name, date, mid)
      )
    `);
    
    // Create supply table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supply (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE (name, mid)
      )
    `);
    
    // Create production table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        date TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE(date, mid)
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
    let billData;
    try {
      billData = JSON.parse(data);
    } catch (err) {
      billData = data;
    }
    
    // Make sure we have an ID and merchant ID
    const billId = billData.id || parseInt(billData.billNumber) || Math.floor(Date.now() / 1000);
    const merchantId = billData.mid || 1;
    
    // Check if a bill with this bill number and merchant id already exists
    const existingBillResult = await pool.query(
      "SELECT id, mid FROM bills WHERE id = $1 AND mid = $2",
      [billId, merchantId]
    );
    
    let result;
    if (existingBillResult.rows.length > 0) {
      // Update existing bill
      result = await pool.query(
        "UPDATE bills SET data = $1, created_at = CURRENT_TIMESTAMP WHERE id = $2 AND mid = $3 RETURNING *",
        [data, billId, merchantId]
      );
      console.log("Updated bill with ID:", billId, "and MID:", merchantId);
    } else {
      // Insert new bill
      result = await pool.query(
        "INSERT INTO bills (id, mid, data) VALUES ($1, $2, $3) RETURNING *",
        [billId, merchantId, data]
      );
      console.log("Inserted new bill with ID:", billId, "and MID:", merchantId);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error syncing bill:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

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
      inventoryData = data;
    }
    
    // Make sure we have an ID and merchant ID
    const inventoryId = inventoryData.id || Math.floor(Date.now() / 1000);
    const merchantId = inventoryData.mid || 1;
    
    // Check if inventory with this merchant_name, date, and mid already exists
    const existingInventoryResult = await pool.query(
      "SELECT id, mid FROM inventory WHERE merchant_name = $1 AND date = $2 AND mid = $3",
      [inventoryData.merchantName, inventoryData.date, merchantId]
    );
    
    let result;
    if (existingInventoryResult.rows.length > 0) {
      // Update existing inventory
      result = await pool.query(
        "UPDATE inventory SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND mid = $3 RETURNING *",
        [JSON.stringify(inventoryData.rows), existingInventoryResult.rows[0].id, merchantId]
      );
      console.log("Updated inventory with ID:", existingInventoryResult.rows[0].id, "and MID:", merchantId);
    } else {
      // Insert new inventory
      result = await pool.query(
        "INSERT INTO inventory (id, mid, merchant_name, date, data, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *",
        [inventoryId, merchantId, inventoryData.merchantName, inventoryData.date, JSON.stringify(inventoryData.rows)]
      );
      console.log("Inserted new inventory with ID:", inventoryId, "and MID:", merchantId);
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
        // Make sure we have an ID and merchant ID
        const inventoryId = inventory.id || Math.floor(Date.now() / 1000);
        const merchantId = inventory.mid || 1;
        
        // Check if inventory with this merchant_name, date, and mid already exists
        const existingInventoryResult = await pool.query(
          "SELECT id, mid FROM inventory WHERE merchant_name = $1 AND date = $2 AND mid = $3",
          [inventory.merchantName, inventory.date, merchantId]
        );
        
        let result;
        if (existingInventoryResult.rows.length > 0) {
          // Update existing inventory
          result = await pool.query(
            "UPDATE inventory SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND mid = $3 RETURNING *",
            [JSON.stringify(inventory.rows), existingInventoryResult.rows[0].id, merchantId]
          );
          console.log("Updated inventory with ID:", existingInventoryResult.rows[0].id, "and MID:", merchantId);
        } else {
          // Insert new inventory
          result = await pool.query(
            "INSERT INTO inventory (id, mid, merchant_name, date, data, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *",
            [inventoryId, merchantId, inventory.merchantName, inventory.date, JSON.stringify(inventory.rows)]
          );
          console.log("Inserted new inventory with ID:", inventoryId, "and MID:", merchantId);
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
    const { name, mid = 1 } = req.body;
    const supplyId = Math.floor(Date.now() / 1000);

    // Check if supply with this name and mid already exists
    const existingSupplyResult = await pool.query(
      "SELECT id, mid FROM supply WHERE name = $1 AND mid = $2",
      [name, mid]
    );
    
    let result;
    if (existingSupplyResult.rows.length > 0) {
      // Update existing supply
      result = await pool.query(
        "UPDATE supply SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND mid = $2 RETURNING *",
        [existingSupplyResult.rows[0].id, mid]
      );
      console.log("Updated supply with ID:", existingSupplyResult.rows[0].id, "and MID:", mid);
    } else {
      // Insert new supply
      result = await pool.query(
        "INSERT INTO supply (id, mid, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
        [supplyId, mid, name]
      );
      console.log("Inserted new supply with ID:", supplyId, "and MID:", mid);
    }
    
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
        const supplyId = supply.id || Math.floor(Date.now() / 1000);
        const mid = supply.mid || 1;
        
        // Check if supply with this name and mid already exists
        const existingSupplyResult = await pool.query(
          "SELECT id, mid FROM supply WHERE name = $1 AND mid = $2",
          [supply.name, mid]
        );
        
        let result;
        if (existingSupplyResult.rows.length > 0) {
          // Update existing supply
          result = await pool.query(
            "UPDATE supply SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND mid = $2 RETURNING *",
            [existingSupplyResult.rows[0].id, mid]
          );
          console.log("Updated supply with ID:", existingSupplyResult.rows[0].id, "and MID:", mid);
        } else {
          // Insert new supply
          result = await pool.query(
            "INSERT INTO supply (id, mid, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
            [supplyId, mid, supply.name]
          );
          console.log("Inserted new supply with ID:", supplyId, "and MID:", mid);
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
      merchantData = data;
    }
    
    // Make sure we have an ID and merchant ID
    const merchantId = merchantData.id || Math.floor(Date.now() / 1000);
    const mid = merchantData.mid || 1;
    
    // Check if merchant with this name and mid already exists
    const existingMerchantResult = await pool.query(
      "SELECT id, mid FROM merchants WHERE name = $1 AND mid = $2",
      [merchantData.name, mid]
    );
    
    let result;
    if (existingMerchantResult.rows.length > 0) {
      // Update existing merchant
      result = await pool.query(
        "UPDATE merchants SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND mid = $2 RETURNING *",
        [existingMerchantResult.rows[0].id, mid]
      );
      console.log("Updated merchant with ID:", existingMerchantResult.rows[0].id, "and MID:", mid);
    } else {
      // Insert new merchant
      result = await pool.query(
        "INSERT INTO merchants (id, mid, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
        [merchantId, mid, merchantData.name]
      );
      console.log("Inserted new merchant with ID:", merchantId, "and MID:", mid);
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
        // Make sure we have an ID and merchant ID
        const merchantId = merchant.id || Math.floor(Date.now() / 1000);
        const mid = merchant.mid || 1;
        
        // Check if merchant with this name and mid already exists
        const existingMerchantResult = await pool.query(
          "SELECT id, mid FROM merchants WHERE name = $1 AND mid = $2",
          [merchant.name, mid]
        );
        
        let result;
        if (existingMerchantResult.rows.length > 0) {
          // Update existing merchant
          result = await pool.query(
            "UPDATE merchants SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND mid = $2 RETURNING *",
            [existingMerchantResult.rows[0].id, mid]
          );
          console.log("Updated merchant with ID:", existingMerchantResult.rows[0].id, "and MID:", mid);
        } else {
          // Insert new merchant
          result = await pool.query(
            "INSERT INTO merchants (id, mid, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
            [merchantId, mid, merchant.name]
          );
          console.log("Inserted new merchant with ID:", merchantId, "and MID:", mid);
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
      productionData = data;
    }

    // Make sure we have an ID and merchant ID
    const productionId = productionData.id || Math.floor(Date.now() / 1000);
    const merchantId = productionData.mid || 1;
    
    // Check if a production record with this date and mid already exists
    const existingResult = await pool.query(
      "SELECT id, mid FROM production WHERE date = $1 AND mid = $2",
      [productionData.date, merchantId]
    );
    
    let result;
    if (existingResult.rows.length > 0) {
      // Update existing production record
      result = await pool.query(
        "UPDATE production SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND mid = $3 RETURNING *",
        [productionData, existingResult.rows[0].id, merchantId]
      );
      console.log("Updated production record with ID:", existingResult.rows[0].id, "and MID:", merchantId);
    } else {
      // Insert new production record
      result = await pool.query(
        "INSERT INTO production (id, mid, date, data, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *",
        [productionId, merchantId, productionData.date, productionData]
      );
      console.log("Inserted new production record with ID:", productionId, "and MID:", merchantId);
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
