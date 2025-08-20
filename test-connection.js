const http = require('http');
const https = require('https');

// Test connection to paybeanlink.onrender.com
console.log('Testing connection to server...');

// Function to make an HTTP request
function testConnection() {
  const options = {
    hostname: 'paybeanlink.onrender.com',
    port: 443,
    path: '/',
    method: 'GET',
  };

  const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`RESPONSE BODY (truncated): ${data.substring(0, 200)}...`);
      console.log('Connection test completed successfully');
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
}

// Run the test
testConnection();
