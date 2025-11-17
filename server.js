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
    
    // Create products table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        name TEXT NOT NULL,
        mrp NUMERIC DEFAULT 0,
        wsp NUMERIC DEFAULT 0,
        sp NUMERIC DEFAULT 0,
        metrics TEXT DEFAULT 'unit',
        discount NUMERIC DEFAULT 0,
        gst NUMERIC DEFAULT 0,
        date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE(name, mid)
      )
    `);
    
    // Create register table if it doesn't exist with updated schema and serial ID
    await pool.query(`
      CREATE TABLE IF NOT EXISTS register (
        id SERIAL PRIMARY KEY,
        merchantName TEXT,
        hostName TEXT NOT NULL,
        registeredDate TEXT NOT NULL,
        phoneNumber TEXT,
        email TEXT,
        locationAddress TEXT,
        locationCity TEXT,
        locationState TEXT,
        locationCountry TEXT,
        locationZipCode TEXT,
        registered BOOLEAN DEFAULT FALSE,
        gstEnabled BOOLEAN DEFAULT FALSE,
        enableMrpPrice BOOLEAN DEFAULT TRUE,
        enableWspPrice BOOLEAN DEFAULT FALSE,
        enableSpPrice BOOLEAN DEFAULT FALSE,
        merchantId SERIAL,
        editPassword TEXT DEFAULT 'paybean',
        enableBillMenu BOOLEAN DEFAULT TRUE,
        enableInventoryMenu BOOLEAN DEFAULT TRUE,
        enableBomMenu BOOLEAN DEFAULT TRUE,
        enableReportsMenu BOOLEAN DEFAULT TRUE,
        enableRenewalMenu BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hostName)
      )
    `);
    
    // Create bill_of_material table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bill_of_material (
        id INTEGER NOT NULL,
        mid INTEGER DEFAULT 1 NOT NULL,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, mid),
        UNIQUE(name, mid)
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
    const merchantId = billData.mid ?? 1;
    
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
    const merchantId = inventoryData.mid ?? 1;
    
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
        const merchantId = inventory.mid ?? 1;
        
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
    const { name, mid } = req.body;
    const merchantId = mid ?? 1;
    const supplyId = Math.floor(Date.now() / 1000);

    // Check if supply with this name and mid already exists
    const existingSupplyResult = await pool.query(
      "SELECT id, mid FROM supply WHERE name = $1 AND mid = $2",
      [name, merchantId]
    );
    
    let result;
    if (existingSupplyResult.rows.length > 0) {
      // Update existing supply
      result = await pool.query(
        "UPDATE supply SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND mid = $2 RETURNING *",
        [existingSupplyResult.rows[0].id, merchantId]
      );
      console.log("Updated supply with ID:", existingSupplyResult.rows[0].id, "and MID:", merchantId);
    } else {
      // Insert new supply
      result = await pool.query(
        "INSERT INTO supply (id, mid, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
        [supplyId, merchantId, name]
      );
      console.log("Inserted new supply with ID:", supplyId, "and MID:", merchantId);
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
        const mid = supply.mid ?? 1;
        
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
    // const mid = merchantData.mid || 1;
    const mid = merchantData.mid ?? 1;
    
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
        const mid = merchant.mid ?? 1;
        
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
    const merchantId = productionData.mid ?? 1;
    
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

// Products data endpoints
server.get("/sync/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/products", async (req, res) => {
  try {
    const { data } = req.body;
    
    // Parse the product data
    let productData;
    try {
      productData = JSON.parse(data);
    } catch (err) {
      productData = data;
    }

    // Make sure we have an ID and merchant ID
    const productId = productData.id || Math.floor(Date.now() / 1000);
    const merchantId = productData.mid ?? 1;
    
    // Check if a product with this name and mid already exists
    const existingResult = await pool.query(
      "SELECT id, mid FROM products WHERE name = $1 AND mid = $2",
      [productData.name, merchantId]
    );
    
    let result;
    if (existingResult.rows.length > 0) {
      // Update existing product - now including GST
      result = await pool.query(
        "UPDATE products SET mrp = $1, wsp = $2, sp = $3, metrics = $4, discount = $5, gst = $6, date = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 AND mid = $9 RETURNING *",
        [
          productData.mrp || 0,
          productData.wsp || 0,
          productData.sp || 0,
          productData.metrics || 'unit',
          productData.discount || 0,
          productData.gst || 0, // Add GST field
          productData.date,
          existingResult.rows[0].id,
          merchantId
        ]
      );
      console.log("Updated product with ID:", existingResult.rows[0].id, "and MID:", merchantId);
    } else {
      // Insert new product - now including GST
      result = await pool.query(
        "INSERT INTO products (id, mid, name, mrp, wsp, sp, metrics, discount, gst, date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) RETURNING *",
        [
          productId,
          merchantId,
          productData.name,
          productData.mrp || 0,
          productData.wsp || 0,
          productData.sp || 0,
          productData.metrics || 'unit',
          productData.discount || 0,
          productData.gst || 0, // Add GST field
          productData.date
        ]
      );
      console.log("Inserted new product with ID:", productId, "and MID:", merchantId);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error syncing product:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Sync multiple products in batch - update to include GST
server.post("/sync/products/batch", async (req, res) => {
  try {
    const { data } = req.body;
    let productsArray;
    
    try {
      productsArray = JSON.parse(data);
      if (!Array.isArray(productsArray)) {
        productsArray = [productsArray];
      }
    } catch (err) {
      // If data is already an object/array, use it directly
      productsArray = Array.isArray(data) ? data : [data];
    }
    
    const results = [];
    const errors = [];
    
    // Process each product
    for (const product of productsArray) {
      try {
        const productId = product.id || Math.floor(Date.now() / 1000);
        const mid = product.mid ?? 1;
        
        // Check if product with this name and mid already exists
        const existingProductResult = await pool.query(
          "SELECT id, mid FROM products WHERE name = $1 AND mid = $2",
          [product.name, mid]
        );
        
        let result;
        if (existingProductResult.rows.length > 0) {
          // Update existing product - now including GST
          result = await pool.query(
            "UPDATE products SET mrp = $1, wsp = $2, sp = $3, metrics = $4, discount = $5, gst = $6, date = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 AND mid = $9 RETURNING *",
            [
              product.mrp || 0,
              product.wsp || 0,
              product.sp || 0,
              product.metrics || 'unit',
              product.discount || 0,
              product.gst || 0, // Add GST field
              product.date,
              existingProductResult.rows[0].id,
              mid
            ]
          );
          console.log("Updated product with ID:", existingProductResult.rows[0].id, "and MID:", mid);
        } else {
          // Insert new product - now including GST
          result = await pool.query(
            "INSERT INTO products (id, mid, name, mrp, wsp, sp, metrics, discount, gst, date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) RETURNING *",
            [
              productId,
              mid,
              product.name,
              product.mrp || 0,
              product.wsp || 0,
              product.sp || 0,
              product.metrics || 'unit',
              product.discount || 0,
              product.gst || 0, // Add GST field
              product.date
            ]
          );
          console.log("Inserted new product with ID:", productId, "and MID:", mid);
        }
        
        results.push(result.rows[0]);
      } catch (err) {
        console.error(`Error processing product ${product.name}:`, err.message);
        errors.push({
          product: product.name,
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
    console.error("Error in batch product sync:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Add register data endpoints
server.get("/sync/register", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM register ORDER BY updated_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Modified register endpoint to use sequential IDs from the database
server.post("/sync/register", async (req, res) => {
  try {
    const { data } = req.body;
    
    // Parse the registration data
    let registerData;
    try {
      registerData = JSON.parse(data);
    } catch (err) {
      registerData = data;
    }
    
    // Check if a registration with this hostname already exists
    const existingResult = await pool.query(
      "SELECT id, merchantId, editPassword FROM register WHERE hostName = $1",
      [registerData.hostName]
    );
    
    let result;
    if (existingResult.rows.length > 0) {
      // Update existing registration
      result = await pool.query(
        `UPDATE register SET 
          merchantName = $1, 
          phoneNumber = $2, 
          email = $3, 
          locationAddress = $4, 
          locationCity = $5, 
          locationState = $6, 
          locationCountry = $7, 
          locationZipCode = $8, 
          registered = $9,
          gstEnabled = $10,
          enableMrpPrice = $11,
          enableWspPrice = $12,
          enableSpPrice = $13,
          enableBillMenu = $14,
          enableInventoryMenu = $15,
          enableBomMenu = $16,
          enableReportsMenu = $17,
          enableRenewalMenu = $18,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $19 RETURNING id, merchantId, hostName, merchantName, registered, gstEnabled, 
          enableMrpPrice, enableWspPrice, enableSpPrice,
          enableBillMenu, enableInventoryMenu, enableBomMenu, enableReportsMenu, enableRenewalMenu, 
          editPassword, updated_at`,
        [
          registerData.merchantName,
          registerData.phoneNumber,
          registerData.email,
          registerData.location?.address,
          registerData.location?.city,
          registerData.location?.state,
          registerData.location?.country,
          registerData.location?.zipCode,
          registerData.registered,
          registerData.gstEnabled || false,
          registerData.enableMrpPrice !== undefined ? registerData.enableMrpPrice : true,
          registerData.enableWspPrice !== undefined ? registerData.enableWspPrice : false,
          registerData.enableSpPrice !== undefined ? registerData.enableSpPrice : false,
          registerData.enableBillMenu !== undefined ? registerData.enableBillMenu : true,
          registerData.enableInventoryMenu !== undefined ? registerData.enableInventoryMenu : true,
          registerData.enableBomMenu !== undefined ? registerData.enableBomMenu : true,
          registerData.enableReportsMenu !== undefined ? registerData.enableReportsMenu : true,
          registerData.enableRenewalMenu !== undefined ? registerData.enableRenewalMenu : true,
          existingResult.rows[0].id
        ]
      );
      console.log("Updated registration with ID:", existingResult.rows[0].id);

      // Return the merchantId instead of id with success status
      return res.json({ 
        success: true, 
        merchantId: result.rows[0].merchantid, // Change to merchantId (lowercase due to PostgreSQL)
        editPassword: result.rows[0].editpassword, // Include the editPassword in the response
        isNew: false,
        data: result.rows[0]
      });
    } else {
      // Insert new registration and let PostgreSQL generate sequential ID
      result = await pool.query(
        `INSERT INTO register (
          merchantName, hostName, registeredDate,
          phoneNumber, email, locationAddress, locationCity,
          locationState, locationCountry, locationZipCode, registered, gstEnabled,
          enableMrpPrice, enableWspPrice, enableSpPrice,
          enableBillMenu, enableInventoryMenu, enableBomMenu, enableReportsMenu, enableRenewalMenu,
          editPassword, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP) 
        RETURNING id, merchantId, hostName, merchantName, registered, gstEnabled,
          enableMrpPrice, enableWspPrice, enableSpPrice,
          enableBillMenu, enableInventoryMenu, enableBomMenu, enableReportsMenu, enableRenewalMenu, 
          editPassword, created_at`,
        [
          registerData.merchantName,
          registerData.hostName,
          registerData.registeredDate,
          registerData.phoneNumber,
          registerData.email,
          registerData.location?.address,
          registerData.location?.city,
          registerData.location?.state,
          registerData.location?.country,
          registerData.location?.zipCode,
          registerData.registered,
          registerData.gstEnabled || false,
          registerData.enableMrpPrice !== undefined ? registerData.enableMrpPrice : true,
          registerData.enableWspPrice !== undefined ? registerData.enableWspPrice : false,
          registerData.enableSpPrice !== undefined ? registerData.enableSpPrice : false,
          registerData.enableBillMenu !== undefined ? registerData.enableBillMenu : true,
          registerData.enableInventoryMenu !== undefined ? registerData.enableInventoryMenu : true,
          registerData.enableBomMenu !== undefined ? registerData.enableBomMenu : true,
          registerData.enableReportsMenu !== undefined ? registerData.enableReportsMenu : true,
          registerData.enableRenewalMenu !== undefined ? registerData.enableRenewalMenu : true,
          'paybean' // Default edit password
        ]
      );
      
      // Return the merchantId instead of id with success status
      return res.json({ 
        success: true, 
        merchantId: result.rows[0].merchantid, // Change to merchantId (lowercase due to PostgreSQL)
        editPassword: result.rows[0].editpassword, // Include the editPassword in the response
        isNew: true,
        data: result.rows[0]
      });
    }
  } catch (err) {
    console.error("Error saving registration data:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ 
      success: false, 
      error: "Database error", 
      message: err.message 
    });
  }
});

// Add a new endpoint to get register data by hostname
server.get("/sync/register/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;
    
    if (!hostname) {
      return res.status(400).json({ error: "Hostname parameter is required" });
    }
    
    const result = await pool.query(
      "SELECT * FROM register WHERE hostName = $1",
      [hostname]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Registration not found for this hostname" 
      });
    }
    
    // Return the registration data including editPassword
    res.json({ 
      success: true, 
      data: result.rows[0] 
    });
  } catch (err) {
    console.error("Error fetching registration by hostname:", err);
    res.status(500).json({ 
      success: false, 
      error: "Database error", 
      message: err.message 
    });
  }
});

// Bill of Material data endpoints
server.get("/sync/bom", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bill_of_material ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

server.post("/sync/bom", async (req, res) => {
  try {
    const { data } = req.body;
    
    // Parse the BOM data
    let bomData;
    try {
      bomData = JSON.parse(data);
    } catch (err) {
      bomData = data;
    }

    // Make sure we have an ID and merchant ID
    const bomId = bomData.id || Math.floor(Date.now() / 1000);
    const merchantId = bomData.mid ?? 1;
    
    // Check if a BOM with this name and mid already exists
    const existingResult = await pool.query(
      "SELECT id, mid FROM bill_of_material WHERE name = $1 AND mid = $2",
      [bomData.name, merchantId]
    );
    
    let result;
    if (existingResult.rows.length > 0) {
      // Update existing BOM
      result = await pool.query(
        "UPDATE bill_of_material SET data = $1, date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND mid = $4 RETURNING *",
        [
          bomData.data, // This should be the items array
          bomData.date,
          existingResult.rows[0].id,
          merchantId
        ]
      );
      console.log("Updated BOM with ID:", existingResult.rows[0].id, "and MID:", merchantId);
    } else {
      // Insert new BOM
      result = await pool.query(
        "INSERT INTO bill_of_material (id, mid, name, date, data, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *",
        [
          bomId,
          merchantId,
          bomData.name,
          bomData.date,
          bomData.data // This should be the items array
        ]
      );
      console.log("Inserted new BOM with ID:", bomId, "and MID:", merchantId);
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Error syncing BOM:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Sync multiple BOMs in batch
server.post("/sync/bom/batch", async (req, res) => {
  try {
    const { data } = req.body;
    let bomsArray;
    
    try {
      bomsArray = JSON.parse(data);
      if (!Array.isArray(bomsArray)) {
        bomsArray = [bomsArray];
      }
    } catch (err) {
      // If data is already an object/array, use it directly
      bomsArray = Array.isArray(data) ? data : [data];
    }
    
    const results = [];
    const errors = [];
    
    // Process each BOM
    for (const bom of bomsArray) {
      try {
        const bomId = bom.id || Math.floor(Date.now() / 1000);
        const mid = bom.mid ?? 1;
        
        // Check if BOM with this name and mid already exists
        const existingBomResult = await pool.query(
          "SELECT id, mid FROM bill_of_material WHERE name = $1 AND mid = $2",
          [bom.name, mid]
        );
        
        let result;
        if (existingBomResult.rows.length > 0) {
          // Update existing BOM
          result = await pool.query(
            "UPDATE bill_of_material SET data = $1, date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND mid = $4 RETURNING *",
            [
              bom.data,
              bom.date,
              existingBomResult.rows[0].id,
              mid
            ]
          );
          console.log("Updated BOM with ID:", existingBomResult.rows[0].id, "and MID:", mid);
        } else {
          // Insert new BOM
          result = await pool.query(
            "INSERT INTO bill_of_material (id, mid, name, date, data, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *",
            [
              bomId,
              mid,
              bom.name,
              bom.date,
              bom.data
            ]
          );
          console.log("Inserted new BOM with ID:", bomId, "and MID:", mid);
        }
        
        results.push(result.rows[0]);
      } catch (err) {
        console.error(`Error processing BOM ${bom.name}:`, err.message);
        errors.push({
          bom: bom.name,
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
    console.error("Error in batch BOM sync:", err.message);
    console.error("Error details:", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// 🔹 Mount json-server router last
server.use(router);

server.listen(process.env.PORT || 10000, () => {
  console.log("Server is running with JSON + Express routes");
});
