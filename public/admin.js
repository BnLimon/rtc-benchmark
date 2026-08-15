// admin.js — Secret Admin Data Management Logic

const STORAGE_KEY = 'rtc_admin_password';

let allRecords = [];
let filteredRecords = [];
let currentAdminPassword = '';

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const adminTbody = document.getElementById('adminTbody');
const recordCount = document.getElementById('recordCount');
const adminStatusMsg = document.getElementById('adminStatusMsg');

const addRecordBtn = document.getElementById('addRecordBtn');
const refreshBtn = document.getElementById('refreshBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const csvFileInput = document.getElementById('csvFileInput');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

const recordModal = document.getElementById('recordModal');
const modalTitle = document.getElementById('modalTitle');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const recordForm = document.getElementById('recordForm');
const editRecordId = document.getElementById('editRecordId');

// Form Input Elements
const formProvider = document.getElementById('formProvider');
const formNetworkType = document.getElementById('formNetworkType');
const formLocation = document.getElementById('formLocation');
const formMessageSize = document.getElementById('formMessageSize');
const formLat = document.getElementById('formLat');
const formLng = document.getElementById('formLng');
const formAccuracy = document.getElementById('formAccuracy');
const formConnTime = document.getElementById('formConnTime');
const formAvgLatency = document.getElementById('formAvgLatency');
const formJitter = document.getElementById('formJitter');
const formThroughput = document.getElementById('formThroughput');
const formReconnTime = document.getElementById('formReconnTime');
const formDeliveryRate = document.getElementById('formDeliveryRate');
const formSampleCount = document.getElementById('formSampleCount');

// Column Filter Elements
const filterInputs = document.querySelectorAll('.col-filter');

// Check cached password on load
window.addEventListener('DOMContentLoaded', () => {
  if (recordModal) {
    recordModal.style.display = 'none';
    recordModal.classList.add('hidden');
  }
  const cachedPassword = sessionStorage.getItem(STORAGE_KEY);
  if (cachedPassword) {
    attemptLogin(cachedPassword, true);
  } else {
    loginSection.style.display = 'block';
    loginSection.classList.remove('hidden');
    dashboardSection.style.display = 'none';
    dashboardSection.classList.add('hidden');
  }
});

// ---------- Authentication ----------
const loginBtn = document.getElementById('loginBtn');

function handleLoginSubmit() {
  const password = adminPasswordInput.value.trim();
  if (!password) {
    loginError.textContent = 'Please enter password.';
    return;
  }
  attemptLogin(password, false);
}

if (loginBtn) {
  loginBtn.addEventListener('click', handleLoginSubmit);
}

if (adminPasswordInput) {
  adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoginSubmit();
    }
  });
}if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEY);
    currentAdminPassword = '';
    dashboardSection.style.display = 'none';
    dashboardSection.classList.add('hidden');
    loginSection.style.display = 'block';
    loginSection.classList.remove('hidden');
    recordModal.style.display = 'none';
    recordModal.classList.add('hidden');
    if (adminPasswordInput) adminPasswordInput.value = '';
    if (loginError) loginError.textContent = '';
  });
}

async function attemptLogin(password, isAutoLogin = false) {
  if (loginError) loginError.textContent = 'Verifying password...';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid password');

    // Auth succeeded
    currentAdminPassword = password;
    sessionStorage.setItem(STORAGE_KEY, password);
    if (loginError) loginError.textContent = '';
    
    if (loginSection) {
      loginSection.style.display = 'none';
      loginSection.classList.add('hidden');
    }
    if (dashboardSection) {
      dashboardSection.style.display = 'block';
      dashboardSection.classList.remove('hidden');
    }
    if (recordModal) {
      recordModal.style.display = 'none';
      recordModal.classList.add('hidden');
    }

    loadAdminData();
  } catch (err) {
    if (isAutoLogin) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    if (loginSection) {
      loginSection.style.display = 'block';
      loginSection.classList.remove('hidden');
    }
    if (dashboardSection) {
      dashboardSection.style.display = 'none';
      dashboardSection.classList.add('hidden');
    }
    if (recordModal) {
      recordModal.style.display = 'none';
      recordModal.classList.add('hidden');
    }
    if (loginError) loginError.textContent = err.message || 'Incorrect password';
  }
}

// ---------- Data Loading & Rendering ----------
async function loadAdminData() {
  showStatus('Loading all records from database...', 'info');
  try {
    const res = await fetch('/api/admin/results', {
      headers: { 'x-admin-password': currentAdminPassword },
    });

    if (res.status === 401) {
      if (logoutBtn) logoutBtn.click();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch data');

    allRecords = data;
    hideStatus();
    applyFiltersAndRender();
  } catch (err) {
    showStatus('Error loading data: ' + err.message, 'err');
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', loadAdminData);
}

// ---------- Filtering Per Field ----------
filterInputs.forEach((input) => {
  input.addEventListener('input', applyFiltersAndRender);
  input.addEventListener('change', applyFiltersAndRender);
});

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    filterInputs.forEach((input) => {
      input.value = '';
    });
  });
}

function applyFiltersAndRender() {
  const filters = {};
  filterInputs.forEach((input) => {
    const col = input.getAttribute('data-col');
    const val = input.value.toLowerCase().trim();
    if (val) filters[col] = val;
  });

  filteredRecords = allRecords.filter((r) => {
    // Column match checks
    if (filters.createdAt && !new Date(r.createdAt).toLocaleString().toLowerCase().includes(filters.createdAt)) return false;
    if (filters.provider && !(r.provider || '').toLowerCase().includes(filters.provider)) return false;
    if (filters.networkType && (r.networkType || '').toLowerCase() !== filters.networkType) return false;
    if (filters.location && !(r.location || '').toLowerCase().includes(filters.location)) return false;
    if (filters.gps) {
      const gpsStr = `${r.gps?.latitude || ''},${r.gps?.longitude || ''}`.toLowerCase();
      if (!gpsStr.includes(filters.gps)) return false;
    }
    if (filters.messageSize && (r.messageSize || '').toLowerCase() !== filters.messageSize) return false;
    if (filters.connTime && !String(r.metrics?.connectionEstablishmentTimeMs ?? '').includes(filters.connTime)) return false;
    if (filters.latency && !String(r.metrics?.avgLatencyMs ?? '').includes(filters.latency)) return false;
    if (filters.jitter && !String(r.metrics?.jitterMs ?? '').includes(filters.jitter)) return false;
    if (filters.throughput && !String(r.metrics?.throughputMsgsPerSec ?? '').includes(filters.throughput)) return false;
    if (filters.reconn && !String(r.metrics?.reconnectionTimeMs ?? '').includes(filters.reconn)) return false;
    if (filters.delivery && !String((r.metrics?.deliverySuccessRate ?? 0) * 100).includes(filters.delivery)) return false;

    return true;
  });

  renderTableRows(filteredRecords);
}

function renderTableRows(records) {
  recordCount.textContent = `${records.length} / ${allRecords.length} Records`;

  if (records.length === 0) {
    adminTbody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#9aa5b1; padding:20px;">No matching records found.</td></tr>`;
    return;
  }

  adminTbody.innerHTML = records.map((r) => {
    const gpsDisplay = r.gps ? `${r.gps.latitude.toFixed(4)}, ${r.gps.longitude.toFixed(4)}` : 'N/A';
    const dateDisplay = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'N/A';
    const delPercent = r.metrics?.deliverySuccessRate !== undefined ? `${(r.metrics.deliverySuccessRate * 100).toFixed(1)}%` : 'N/A';

    return `<tr data-id="${r._id}">
      <td>${dateDisplay}</td>
      <td><strong>${escapeHtml(r.provider || '')}</strong></td>
      <td><span class="type-tag">${escapeHtml(r.networkType || '')}</span></td>
      <td>${escapeHtml(r.location || '-')}</td>
      <td>${gpsDisplay}</td>
      <td>${escapeHtml(r.messageSize || '')}</td>
      <td>${r.metrics?.connectionEstablishmentTimeMs ?? '-'}</td>
      <td>${r.metrics?.avgLatencyMs ?? '-'}</td>
      <td>${r.metrics?.jitterMs ?? '-'}</td>
      <td>${r.metrics?.throughputMsgsPerSec ?? '-'}</td>
      <td>${r.metrics?.reconnectionTimeMs ?? '-'}</td>
      <td>${delPercent}</td>
      <td>
        <div class="action-btns">
          <button class="edit-btn" onclick="openEditModal('${r._id}')">✏️ Edit</button>
          <button class="del-btn" onclick="deleteRecord('${r._id}')">🗑️ Del</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ---------- Add / Edit Modal Controls ----------
addRecordBtn.addEventListener('click', () => {
  modalTitle.textContent = '➕ Add New Benchmark Record';
  editRecordId.value = '';
  recordForm.reset();
  formSampleCount.value = '50';
  recordModal.style.display = 'flex';
  recordModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

function closeModal() {
  recordModal.style.display = 'none';
  recordModal.classList.add('hidden');
}

window.openEditModal = function(id) {
  const r = allRecords.find((rec) => rec._id === id);
  if (!r) return;

  modalTitle.textContent = '✏️ Edit Benchmark Record';
  editRecordId.value = r._id;

  formProvider.value = r.provider || '';
  formNetworkType.value = r.networkType || 'mobile';
  formLocation.value = r.location || '';
  formMessageSize.value = r.messageSize || 'small';

  formLat.value = r.gps?.latitude ?? '';
  formLng.value = r.gps?.longitude ?? '';
  formAccuracy.value = r.gps?.accuracy ?? '';

  formConnTime.value = r.metrics?.connectionEstablishmentTimeMs ?? '';
  formAvgLatency.value = r.metrics?.avgLatencyMs ?? '';
  formJitter.value = r.metrics?.jitterMs ?? '';
  formThroughput.value = r.metrics?.throughputMsgsPerSec ?? '';
  formReconnTime.value = r.metrics?.reconnectionTimeMs ?? '';
  formDeliveryRate.value = r.metrics?.deliverySuccessRate ?? '1.0';
  formSampleCount.value = r.metrics?.sampleCount ?? '50';

  recordModal.style.display = 'flex';
  recordModal.classList.remove('hidden');
};


if (recordForm) {
  recordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = editRecordId ? editRecordId.value : '';
    const isEdit = !!id;

    const payload = {
      provider: formProvider ? formProvider.value.trim() : '',
      networkType: formNetworkType ? formNetworkType.value : 'mobile',
      location: formLocation ? formLocation.value.trim() || null : null,
      messageSize: formMessageSize ? formMessageSize.value : 'small',
      gps: {
        latitude: parseFloat(formLat ? formLat.value : 0) || 0,
        longitude: parseFloat(formLng ? formLng.value : 0) || 0,
        accuracy: formAccuracy && formAccuracy.value ? parseFloat(formAccuracy.value) : null,
      },
      metrics: {
        connectionEstablishmentTimeMs: parseFloat(formConnTime ? formConnTime.value : 0) || 0,
        avgLatencyMs: formAvgLatency && formAvgLatency.value !== '' ? parseFloat(formAvgLatency.value) : null,
        jitterMs: formJitter && formJitter.value !== '' ? parseFloat(formJitter.value) : null,
        throughputMsgsPerSec: parseFloat(formThroughput ? formThroughput.value : 0) || 0,
        reconnectionTimeMs: formReconnTime && formReconnTime.value !== '' ? parseFloat(formReconnTime.value) : null,
        deliverySuccessRate: parseFloat(formDeliveryRate ? formDeliveryRate.value : 1.0) || 1.0,
        sampleCount: parseInt(formSampleCount ? formSampleCount.value : 50, 10) || 50,
        acknowledgedCount: parseInt(formSampleCount ? formSampleCount.value : 50, 10) || 50,
      },
      clientInfo: { userAgent: isEdit ? 'Admin Edit' : 'Admin Entry', connection: null },
    };

    showStatus(isEdit ? 'Updating record...' : 'Creating new record...', 'info');

    try {
      const url = isEdit ? `/api/admin/results/${id}` : '/api/admin/results';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': currentAdminPassword,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      closeModal();
      showStatus(isEdit ? 'Record updated successfully!' : 'Record created successfully!', 'ok');
      loadAdminData();
    } catch (err) {
      showStatus('Save error: ' + err.message, 'err');
    }
  });
}

// ---------- Delete Record ----------
window.deleteRecord = async function(id) {
  const r = allRecords.find((rec) => rec._id === id);
  const name = r ? `${r.provider} (${r.networkType})` : 'this record';
  
  if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
    return;
  }

  showStatus('Deleting record...', 'info');
  try {
    const res = await fetch(`/api/admin/results/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': currentAdminPassword },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    showStatus('Record deleted successfully.', 'ok');
    loadAdminData();
  } catch (err) {
    showStatus('Delete error: ' + err.message, 'err');
  }
};

// ---------- CSV Export ----------
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    if (filteredRecords.length === 0) {
      alert('No records available to export.');
      return;
    }

    const headers = [
      'ID', 'CreatedAt', 'Provider', 'NetworkType', 'Location',
      'Latitude', 'Longitude', 'Accuracy', 'MessageSize',
      'ConnectionTimeMs', 'AvgLatencyMs', 'JitterMs',
      'ThroughputMsgsPerSec', 'ReconnectionTimeMs',
      'DeliverySuccessRate', 'SampleCount'
    ];

    const csvRows = [headers.join(',')];

    filteredRecords.forEach((r) => {
      const row = [
        escapeCsv(r._id || ''),
        escapeCsv(r.createdAt ? new Date(r.createdAt).toISOString() : ''),
        escapeCsv(r.provider || ''),
        escapeCsv(r.networkType || ''),
        escapeCsv(r.location || ''),
        r.gps?.latitude ?? '',
        r.gps?.longitude ?? '',
        r.gps?.accuracy ?? '',
        escapeCsv(r.messageSize || ''),
        r.metrics?.connectionEstablishmentTimeMs ?? '',
        r.metrics?.avgLatencyMs ?? '',
        r.metrics?.jitterMs ?? '',
        r.metrics?.throughputMsgsPerSec ?? '',
        r.metrics?.reconnectionTimeMs ?? '',
        r.metrics?.deliverySuccessRate ?? '',
        r.metrics?.sampleCount ?? '',
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rtc_benchmark_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showStatus(`Exported ${filteredRecords.length} records to CSV.`, 'ok');
  });
}

// ---------- CSV Import ----------
if (csvFileInput) {
  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      try {
        const items = parseCsvToRecords(text);
        if (items.length === 0) {
          alert('No valid records found in CSV file.');
          return;
        }

        if (!confirm(`Found ${items.length} records in CSV. Import into database now?`)) {
          csvFileInput.value = '';
          return;
        }

        showStatus(`Importing ${items.length} records into database...`, 'info');

        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': currentAdminPassword,
          },
          body: JSON.stringify({ items }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Import failed');

        showStatus(`Successfully imported ${data.insertedCount} records!`, 'ok');
        csvFileInput.value = '';
        loadAdminData();
      } catch (err) {
        showStatus('CSV Import failed: ' + err.message, 'err');
        csvFileInput.value = '';
      }
    };
    reader.readAsText(file);
  });
}

// Simple CSV parser
function parseCsvToRecords(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    if (values.length === 0) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });

    // Map rowObj fields to target schema
    const provider = rowObj['provider'] || rowObj['provider name'] || 'Imported Provider';
    const networkType = (rowObj['networktype'] || rowObj['type'] || 'mobile').toLowerCase();
    const location = rowObj['location'] || rowObj['area'] || null;
    const messageSize = (rowObj['messagesize'] || rowObj['size'] || 'small').toLowerCase();

    const lat = parseFloat(rowObj['latitude'] || rowObj['lat']) || 23.8103;
    const lng = parseFloat(rowObj['longitude'] || rowObj['lng']) || 90.4125;
    const accuracy = rowObj['accuracy'] ? parseFloat(rowObj['accuracy']) : null;

    const connTime = parseFloat(rowObj['connectiontimems'] || rowObj['connection time']) || 0;
    const latency = rowObj['avglatencyms'] || rowObj['latency'] ? parseFloat(rowObj['avglatencyms'] || rowObj['latency']) : null;
    const jitter = rowObj['jitterms'] || rowObj['jitter'] ? parseFloat(rowObj['jitterms'] || rowObj['jitter']) : null;
    const throughput = parseFloat(rowObj['throughputmsgspersec'] || rowObj['throughput']) || 0;
    const reconn = rowObj['reconnectiontimems'] || rowObj['reconn'] ? parseFloat(rowObj['reconnectiontimems'] || rowObj['reconn']) : null;
    const delivery = rowObj['deliverysuccessrate'] || rowObj['delivery'] ? parseFloat(rowObj['deliverysuccessrate'] || rowObj['delivery']) : 1.0;
    const samples = parseInt(rowObj['samplecount'] || rowObj['samples'], 10) || 50;

    const createdAt = rowObj['createdat'] ? new Date(rowObj['createdat']) : new Date();

    records.push({
      provider,
      networkType,
      location,
      messageSize,
      gps: { latitude: lat, longitude: lng, accuracy },
      metrics: {
        connectionEstablishmentTimeMs: connTime,
        avgLatencyMs: latency,
        jitterMs: jitter,
        throughputMsgsPerSec: throughput,
        reconnectionTimeMs: reconn,
        deliverySuccessRate: delivery,
        sampleCount: samples,
        acknowledgedCount: samples,
      },
      clientInfo: { userAgent: 'CSV Import File', connection: null },
      createdAt,
    });
  }

  return records;
}

function parseCsvRow(rowText) {
  const result = [];
  let insideQuote = false;
  let currentVal = '';

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];
    if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === ',' && !insideQuote) {
      result.push(currentVal);
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  result.push(currentVal);
  return result;
}

// Helpers
function showStatus(msg, type = 'info') {
  adminStatusMsg.textContent = msg;
  adminStatusMsg.className = `status-box ${type === 'ok' ? 'ok' : type === 'err' ? 'err' : ''}`;
  adminStatusMsg.classList.remove('hidden');
}

function hideStatus() {
  adminStatusMsg.classList.add('hidden');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeCsv(str) {
  const val = String(str).replace(/"/g, '""');
  return `"${val}"`;
}
