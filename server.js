require('dotenv').config();
const dns = require('dns');
// Bypasses local router/ISP DNS SRV query restriction (querySrv ECONNREFUSED)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // ignore fallback
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'rtc_benchmark';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '4444';
const COLLECTION_NAME = 'results';

// ---------- MongoDB ----------
let db;
let resultsCollection;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('MONGO_URI is not set. Set it in your environment variables (.env locally, or Render dashboard in production).');
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    resultsCollection = db.collection(COLLECTION_NAME);
    console.log(`Connected to MongoDB Atlas — db: ${DB_NAME}, collection: ${COLLECTION_NAME}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
}
connectDB();

// ---------- Middleware ----------
app.use(express.json({ limit: '10mb' })); // Increased headroom for CSV import payloads
app.use(express.static('public'));

// ---------- Health check ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', dbConnected: !!resultsCollection, time: new Date().toISOString() });
});

// ---------- Admin Auth Middleware ----------
function requireAdminAuth(req, res, next) {
  const currentPassword = process.env.ADMIN_PASSWORD || '4444';
  const providedPassword = req.headers['x-admin-password'] || req.query.admin_password || (req.body && req.body.admin_password);
  if (providedPassword === currentPassword) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Invalid admin password' });
}

// ---------- Secret Admin Login Route ----------
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const currentPassword = process.env.ADMIN_PASSWORD || '4444';
  if (password === currentPassword) {
    return res.json({ success: true, message: 'Authenticated successfully' });
  } else {
    return res.status(401).json({ error: 'Incorrect password' });
  }
});

// ---------- Admin API: Get all results ----------
app.get('/api/admin/results', requireAdminAuth, async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const results = await resultsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin results: ' + err.message });
  }
});

// ---------- Admin API: Add a result manually ----------
app.post('/api/admin/results', requireAdminAuth, async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const b = req.body;
    const doc = {
      provider: String(b.provider || '').trim(),
      networkType: b.networkType || 'mobile',
      location: b.location || null,
      gps: {
        latitude: parseFloat(b.gps?.latitude) || 0,
        longitude: parseFloat(b.gps?.longitude) || 0,
        accuracy: b.gps?.accuracy !== undefined && b.gps?.accuracy !== null ? parseFloat(b.gps.accuracy) : null,
      },
      messageSize: b.messageSize || 'small',
      metrics: {
        connectionEstablishmentTimeMs: parseFloat(b.metrics?.connectionEstablishmentTimeMs) || 0,
        avgLatencyMs: b.metrics?.avgLatencyMs !== undefined && b.metrics?.avgLatencyMs !== null ? parseFloat(b.metrics.avgLatencyMs) : null,
        jitterMs: b.metrics?.jitterMs !== undefined && b.metrics?.jitterMs !== null ? parseFloat(b.metrics.jitterMs) : null,
        throughputMsgsPerSec: parseFloat(b.metrics?.throughputMsgsPerSec) || 0,
        reconnectionTimeMs: b.metrics?.reconnectionTimeMs !== undefined && b.metrics?.reconnectionTimeMs !== null ? parseFloat(b.metrics.reconnectionTimeMs) : null,
        deliverySuccessRate: parseFloat(b.metrics?.deliverySuccessRate) || 0,
        sampleCount: parseInt(b.metrics?.sampleCount, 10) || 0,
        acknowledgedCount: b.metrics?.acknowledgedCount !== undefined ? parseInt(b.metrics.acknowledgedCount, 10) : 0,
      },
      clientInfo: b.clientInfo || { userAgent: 'Admin Entry', connection: null },
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
    };

    const result = await resultsCollection.insertOne(doc);
    res.status(201).json({ success: true, insertedId: result.insertedId, doc });
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert result: ' + err.message });
  }
});

// ---------- Admin API: Edit a result ----------
app.put('/api/admin/results/:id', requireAdminAuth, async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const id = req.params.id;
    const b = req.body;

    const updatedDoc = {
      provider: String(b.provider || '').trim(),
      networkType: b.networkType || 'mobile',
      location: b.location || null,
      gps: {
        latitude: parseFloat(b.gps?.latitude) || 0,
        longitude: parseFloat(b.gps?.longitude) || 0,
        accuracy: b.gps?.accuracy !== undefined && b.gps?.accuracy !== null ? parseFloat(b.gps.accuracy) : null,
      },
      messageSize: b.messageSize || 'small',
      metrics: {
        connectionEstablishmentTimeMs: parseFloat(b.metrics?.connectionEstablishmentTimeMs) || 0,
        avgLatencyMs: b.metrics?.avgLatencyMs !== undefined && b.metrics?.avgLatencyMs !== null ? parseFloat(b.metrics.avgLatencyMs) : null,
        jitterMs: b.metrics?.jitterMs !== undefined && b.metrics?.jitterMs !== null ? parseFloat(b.metrics.jitterMs) : null,
        throughputMsgsPerSec: parseFloat(b.metrics?.throughputMsgsPerSec) || 0,
        reconnectionTimeMs: b.metrics?.reconnectionTimeMs !== undefined && b.metrics?.reconnectionTimeMs !== null ? parseFloat(b.metrics.reconnectionTimeMs) : null,
        deliverySuccessRate: parseFloat(b.metrics?.deliverySuccessRate) || 0,
        sampleCount: parseInt(b.metrics?.sampleCount, 10) || 0,
        acknowledgedCount: b.metrics?.acknowledgedCount !== undefined ? parseInt(b.metrics.acknowledgedCount, 10) : 0,
      },
      clientInfo: b.clientInfo || { userAgent: 'Admin Edit', connection: null },
    };

    if (b.createdAt) {
      updatedDoc.createdAt = new Date(b.createdAt);
    }

    const result = await resultsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true, message: 'Record updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update result: ' + err.message });
  }
});

// ---------- Admin API: Delete a result ----------
app.delete('/api/admin/results/:id', requireAdminAuth, async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const id = req.params.id;
    const result = await resultsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete result: ' + err.message });
  }
});

// ---------- Admin API: Batch import CSV records ----------
app.post('/api/admin/import', requireAdminAuth, async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for import' });
    }

    const docs = items.map((b) => ({
      provider: String(b.provider || '').trim(),
      networkType: b.networkType || 'mobile',
      location: b.location || null,
      gps: {
        latitude: parseFloat(b.gps?.latitude) || 0,
        longitude: parseFloat(b.gps?.longitude) || 0,
        accuracy: b.gps?.accuracy !== undefined && b.gps?.accuracy !== null ? parseFloat(b.gps.accuracy) : null,
      },
      messageSize: b.messageSize || 'small',
      metrics: {
        connectionEstablishmentTimeMs: parseFloat(b.metrics?.connectionEstablishmentTimeMs) || 0,
        avgLatencyMs: b.metrics?.avgLatencyMs !== undefined && b.metrics?.avgLatencyMs !== null ? parseFloat(b.metrics.avgLatencyMs) : null,
        jitterMs: b.metrics?.jitterMs !== undefined && b.metrics?.jitterMs !== null ? parseFloat(b.metrics.jitterMs) : null,
        throughputMsgsPerSec: parseFloat(b.metrics?.throughputMsgsPerSec) || 0,
        reconnectionTimeMs: b.metrics?.reconnectionTimeMs !== undefined && b.metrics?.reconnectionTimeMs !== null ? parseFloat(b.metrics.reconnectionTimeMs) : null,
        deliverySuccessRate: parseFloat(b.metrics?.deliverySuccessRate) || 0,
        sampleCount: parseInt(b.metrics?.sampleCount, 10) || 0,
        acknowledgedCount: b.metrics?.acknowledgedCount !== undefined ? parseInt(b.metrics.acknowledgedCount, 10) : 0,
      },
      clientInfo: b.clientInfo || { userAgent: 'CSV Import', connection: null },
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
    }));

    const result = await resultsCollection.insertMany(docs);
    res.json({ success: true, insertedCount: result.insertedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import records: ' + err.message });
  }
});

// ---------- Save a benchmark result ----------
app.post('/api/results', async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected. Check server MONGO_URI configuration.' });
  }

  const body = req.body;

  // Basic validation — reject if required fields are missing
  const requiredFields = ['provider', 'networkType', 'metrics', 'gps'];
  for (const field of requiredFields) {
    if (!(field in body)) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const doc = {
    provider: String(body.provider).trim(),
    networkType: body.networkType, // e.g. "mobile" or "broadband"
    location: body.location || null, // optional human label, e.g. "Mirpur, Dhaka"
    gps: {
      latitude: body.gps.latitude,
      longitude: body.gps.longitude,
      accuracy: body.gps.accuracy ?? null,
    },
    messageSize: body.messageSize, // bytes label used for this run, e.g. "small" | "medium" | "large"
    metrics: body.metrics,
    clientInfo: body.clientInfo || null,
    createdAt: new Date(),
  };

  try {
    const result = await resultsCollection.insertOne(doc);
    res.status(201).json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('Insert failed:', err.message);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// ---------- Fetch past results (public table) ----------
app.get('/api/results', async (req, res) => {
  if (!resultsCollection) {
    return res.status(503).json({ error: 'Database not connected.' });
  }
  try {
    const results = await resultsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});


// ---------- WebSocket echo server (used by the client for benchmark measurements) ----------
const wss = new WebSocket.Server({ server, path: '/ws-echo' });

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    // Immediately echo back whatever was received, unmodified.
    // The client attaches its own send-timestamp inside the payload for RTT calculation.
    ws.send(data, { binary: isBinary });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket echo endpoint: ws://localhost:${PORT}/ws-echo`);
});
