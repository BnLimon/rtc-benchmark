const els = {
  provider: document.getElementById('provider'),
  networkType: document.getElementById('networkType'),
  location: document.getElementById('location'),
  messageSize: document.getElementById('messageSize'),
  sampleCount: document.getElementById('sampleCount'),
  gpsStatus: document.getElementById('gpsStatus'),
  manualLat: document.getElementById('manualLat'),
  manualLng: document.getElementById('manualLng'),
  useGpsBtn: document.getElementById('useGpsBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  startError: document.getElementById('startError'),
  setupPanel: document.getElementById('setup-panel'),
  progressPanel: document.getElementById('progress-panel'),
  progressLog: document.getElementById('progressLog'),
  resultsPanel: document.getElementById('results-panel'),
  resultsGrid: document.getElementById('resultsGrid'),
  saveBtn: document.getElementById('saveBtn'),
  restartBtn: document.getElementById('restartBtn'),
  saveStatus: document.getElementById('saveStatus'),
  loadResultsBtn: document.getElementById('loadResultsBtn'),
  pastResultsTable: document.getElementById('pastResultsTable'),
};

let gpsCoords = null;
let lastMetrics = null;
let lastRunConfig = null;
let map = null;
let mapMarker = null;
let isBenchmarking = false;

// ---------- Interactive Map & Coordinates ----------
function updateSelectedCoords(lat, lng, accuracy = null, statusLabel = 'Selected') {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  gpsCoords = { latitude, longitude, accuracy: accuracy !== null ? parseFloat(accuracy) : null };

  if (els.manualLat) els.manualLat.value = latitude.toFixed(6);
  if (els.manualLng) els.manualLng.value = longitude.toFixed(6);

  if (mapMarker) mapMarker.setLatLng([latitude, longitude]);

  const accStr = accuracy ? ` (±${Math.round(accuracy)}m)` : '';
  els.gpsStatus.textContent = `${statusLabel}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accStr}`;
  els.gpsStatus.className = 'status-box ok';
}

function initMap() {
  const defaultLat = 23.8103; // Dhaka center
  const defaultLng = 90.4125;

  gpsCoords = { latitude: defaultLat, longitude: defaultLng, accuracy: null };

  if (typeof L !== 'undefined' && document.getElementById('map')) {
    map = L.map('map').setView([defaultLat, defaultLng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);

    // Drag marker event
    mapMarker.on('dragend', function () {
      const latlng = mapMarker.getLatLng();
      updateSelectedCoords(latlng.lat, latlng.lng, null, 'Pin Dragged');
    });

    // Map click event
    map.on('click', function (e) {
      mapMarker.setLatLng(e.latlng);
      updateSelectedCoords(e.latlng.lat, e.latlng.lng, null, 'Map Clicked');
    });
  }

  updateSelectedCoords(defaultLat, defaultLng, null, 'Default Location');
}

function captureGPS() {
  if (!navigator.geolocation) {
    els.gpsStatus.textContent = 'Geolocation not supported. Click on map to select location manually.';
    els.gpsStatus.className = 'status-box err';
    return;
  }
  els.gpsStatus.textContent = 'Requesting browser location permission...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      updateSelectedCoords(lat, lng, acc, 'Browser GPS Captured');
      if (map) map.setView([lat, lng], 14);
    },
    (err) => {
      els.gpsStatus.textContent = `GPS Notice (${err.message}). Select location manually on map.`;
      els.gpsStatus.className = 'status-box err';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Helper to auto-update GPS coordinates if permission is granted, or retain initial coor if not
function getUpdatedGpsCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(gpsCoords);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        updateSelectedCoords(lat, lng, acc, 'Browser GPS Auto-Updated');
        if (map) map.setView([lat, lng], 14);
        resolve(gpsCoords);
      },
      () => {
        // If permission denied or error: silently retain initial/current coords
        resolve(gpsCoords);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

// Bind Map Initialization & Controls
initMap();
captureGPS(); // Try auto GPS detection once

if (els.useGpsBtn) {
  els.useGpsBtn.addEventListener('click', captureGPS);
}

if (els.manualLat && els.manualLng) {
  const handleManualInput = () => {
    const lat = parseFloat(els.manualLat.value);
    const lng = parseFloat(els.manualLng.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateSelectedCoords(lat, lng, null, 'Manually Entered');
      if (map) map.panTo([lat, lng]);
    }
  };
  els.manualLat.addEventListener('input', handleManualInput);
  els.manualLng.addEventListener('input', handleManualInput);
}

// Helper to save benchmark result to Database
async function saveResultToDb(runConfig, metrics, coords) {
  const payload = {
    provider: runConfig.provider,
    networkType: runConfig.networkType,
    location: runConfig.locationLabel || null,
    gps: coords,
    messageSize: runConfig.messageSize,
    metrics: metrics,
    clientInfo: {
      userAgent: navigator.userAgent,
      connection: navigator.connection
        ? {
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink,
            rtt: navigator.connection.rtt,
          }
        : null,
    },
  };

  const res = await fetch('/api/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Save failed');
  return data;
}

// ---------- Stop benchmark handler ----------
if (els.stopBtn) {
  els.stopBtn.addEventListener('click', () => {
    if (isBenchmarking) {
      isBenchmarking = false;
      if (els.progressLog) {
        els.progressLog.textContent += '\n[USER ACTION] Stop Benchmark requested. Finishing current test and stopping loop...\n';
        els.progressLog.scrollTop = els.progressLog.scrollHeight;
      }
      els.stopBtn.disabled = true;
    }
  });
}

// ---------- Start benchmark ----------
els.startBtn.addEventListener('click', async () => {
  els.startError.textContent = '';

  const provider = els.provider.value.trim();
  if (!provider) {
    els.startError.textContent = 'Provider name entry is required.';
    return;
  }

  if (!gpsCoords) {
    els.startError.textContent = 'GPS coordinates not captured. Please allow location permission and try again.';
    captureGPS();
    return;
  }

  const sampleCount = Math.max(10, Math.min(500, parseInt(els.sampleCount.value, 10) || 50));
  const networkType = els.networkType.value;
  const locationLabel = els.location.value.trim();

  isBenchmarking = true;
  els.startBtn.disabled = true;
  if (els.stopBtn) {
    els.stopBtn.disabled = false;
  }

  els.setupPanel.classList.add('hidden');
  els.resultsPanel.classList.add('hidden');
  els.progressPanel.classList.remove('hidden');
  els.progressLog.textContent = '';

  const log = (line) => {
    els.progressLog.textContent += line + '\n';
    els.progressLog.scrollTop = els.progressLog.scrollHeight;
  };

  log('Waking up server (if idle)...');
  try {
    await fetch('/api/health');
  } catch (e) {
    log('Server health check notice: ' + e.message);
  }

  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${location.host}/ws-echo`;

  const sizeSequence = ['small', 'medium', 'large'];
  let sizeIdx = 0;
  let iteration = 0;
  let totalSavedCount = 0;

  while (isBenchmarking) {
    iteration++;
    const currentSize = sizeSequence[sizeIdx % sizeSequence.length];

    log(`\n========================================`);
    log(`--- Iteration #${iteration} [Size: ${currentSize.toUpperCase()}] ---`);

    // 1. Auto-update GPS coordinate if permission exists, otherwise keep initial/current
    log('Updating GPS coordinates (if permission granted)...');
    const currentCoords = await getUpdatedGpsCoords();
    log(`Location Coords: ${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}${currentCoords.accuracy ? ` (±${Math.round(currentCoords.accuracy)}m)` : ''}`);

    if (!isBenchmarking) break;

    if (els.messageSize) els.messageSize.value = currentSize;

    // 2. Run benchmark
    try {
      const metrics = await runBenchmark(wsUrl, { sampleCount, messageSize: currentSize, onProgress: log });
      lastMetrics = metrics;
      lastRunConfig = { provider, networkType, locationLabel, messageSize: currentSize, sampleCount };

      showResults(metrics);

      if (!isBenchmarking) break;

      // 3. Auto-save to Database
      log(`Sending iteration #${iteration} [${currentSize}] results to database...`);
      try {
        await saveResultToDb(lastRunConfig, metrics, currentCoords);
        totalSavedCount++;
        log(`✓ Iteration #${iteration} [${currentSize}] saved to database. (Total Saved: ${totalSavedCount})`);
        if (els.saveStatus) {
          els.saveStatus.textContent = `Auto-saved iteration #${iteration} (${currentSize}) to database.`;
          els.saveStatus.style.color = '#4fd1c5';
        }
      } catch (saveErr) {
        log(`❌ Database save failed: ${saveErr.message}`);
      }
    } catch (err) {
      log(`Error during iteration #${iteration}: ${err.message}`);
      if (isBenchmarking) {
        log('Waiting 3 seconds before next cycle attempt...');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!isBenchmarking) break;

    sizeIdx++;
    log('Waiting 2 seconds before starting next test iteration...');
    await new Promise((r) => setTimeout(r, 2000));
  }

  log(`\n========================================`);
  log(`Benchmark loop stopped. Total ${totalSavedCount} test runs completed & saved to database.`);
  els.startBtn.disabled = false;
  if (els.stopBtn) {
    els.stopBtn.disabled = true;
  }
});

// ---------- Show results ----------
function showResults(metrics) {
  els.resultsPanel.classList.remove('hidden');
  if (els.saveStatus) {
    els.saveStatus.textContent = 'Auto-saved to database.';
    els.saveStatus.style.color = '#4fd1c5';
  }

  const cards = [
    { label: 'Connection Time', value: `${metrics.connectionEstablishmentTimeMs} ms` },
    { label: 'Avg Latency (RTT)', value: metrics.avgLatencyMs !== null ? `${metrics.avgLatencyMs} ms` : 'N/A' },
    { label: 'Jitter', value: metrics.jitterMs !== null ? `${metrics.jitterMs} ms` : 'N/A' },
    { label: 'Throughput', value: `${metrics.throughputMsgsPerSec} msg/s` },
    { label: 'Reconnection Time', value: metrics.reconnectionTimeMs !== null ? `${metrics.reconnectionTimeMs} ms` : 'Failed' },
    { label: 'Delivery Success Rate', value: `${(metrics.deliverySuccessRate * 100).toFixed(1)}%` },
    { label: 'Messages Sent', value: metrics.sampleCount },
    { label: 'Messages Acknowledged', value: metrics.acknowledgedCount },
  ];

  els.resultsGrid.innerHTML = cards
    .map((c) => `<div class="result-card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`)
    .join('');
}

// ---------- Save to MongoDB ----------
els.saveBtn.addEventListener('click', async () => {
  if (!lastMetrics || !lastRunConfig || !gpsCoords) {
    els.saveStatus.textContent = 'Nothing to save.';
    return;
  }

  els.saveBtn.disabled = true;
  els.saveStatus.textContent = 'Saving...';

  try {
    await saveResultToDb(lastRunConfig, lastMetrics, gpsCoords);
    els.saveStatus.textContent = 'Saved to database successfully.';
    els.saveStatus.style.color = '#4fd1c5';
  } catch (err) {
    els.saveStatus.textContent = `Save failed: ${err.message}`;
    els.saveStatus.style.color = '#f56565';
  } finally {
    els.saveBtn.disabled = false;
  }
});

// ---------- Restart ----------
els.restartBtn.addEventListener('click', () => {
  if (isBenchmarking) {
    isBenchmarking = false;
  }
  els.resultsPanel.classList.add('hidden');
  els.progressPanel.classList.add('hidden');
  els.setupPanel.classList.remove('hidden');
  lastMetrics = null;
});


// ---------- Load past results ----------
els.loadResultsBtn.addEventListener('click', async () => {
  els.pastResultsTable.textContent = 'Loading...';
  try {
    const res = await fetch('/api/results');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Load failed');

    if (!data.length) {
      els.pastResultsTable.textContent = 'No results saved yet.';
      return;
    }

    const rows = data
      .map(
        (r) => `<tr>
          <td>${new Date(r.createdAt).toLocaleString()}</td>
          <td>${r.provider}</td>
          <td>${r.networkType}</td>
          <td>${r.messageSize}</td>
          <td>${r.metrics.avgLatencyMs ?? '-'} ms</td>
          <td>${r.metrics.jitterMs ?? '-'} ms</td>
          <td>${(r.metrics.deliverySuccessRate * 100).toFixed(1)}%</td>
        </tr>`
      )
      .join('');

    els.pastResultsTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Provider</th><th>Type</th><th>Size</th><th>Latency</th><th>Jitter</th><th>Delivery</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    els.pastResultsTable.textContent = `Error: ${err.message}`;
  }
});
