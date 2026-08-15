// benchmark.js — Core WebSocket RTC measurement logic

const MESSAGE_SIZE_BYTES = {
  small: 50,
  medium: 500,
  large: 5000,
};

function buildPayload(sizeBytes, seq, sendTime) {
  // Header carries seq + sendTime for RTT matching; padding fills to target size.
  const header = JSON.stringify({ seq, t: sendTime });
  const paddingLength = Math.max(0, sizeBytes - header.length);
  const padding = 'x'.repeat(paddingLength);
  return JSON.stringify({ seq, t: sendTime, pad: padding });
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Runs a full benchmark cycle against the given WS URL.
 * onProgress(logLine) is called for live UI updates.
 * Returns a metrics object.
 */
async function runBenchmark(wsUrl, { sampleCount = 50, messageSize = 'medium', onProgress = () => {} }) {
  const sizeBytes = MESSAGE_SIZE_BYTES[messageSize] || MESSAGE_SIZE_BYTES.medium;

  // ---------- 1. Connection establishment time ----------
  onProgress('Connecting to WebSocket server...');
  const connectStart = performance.now();
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 10000);
    socket.onopen = () => {
      clearTimeout(timeout);
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
    };
  });
  const connectionEstablishmentTimeMs = performance.now() - connectStart;
  onProgress(`Connected in ${connectionEstablishmentTimeMs.toFixed(1)} ms`);

  // ---------- 2. Round-trip latency samples ----------
  const rttSamples = [];
  let sent = 0;
  let acknowledged = 0;

  onProgress(`Sending ${sampleCount} messages (size: ${messageSize}, ~${sizeBytes} bytes)...`);

  await new Promise((resolve) => {
    let seq = 0;
    const pending = new Map();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const receiveTime = performance.now();
        const originalSendTime = pending.get(data.seq);
        if (originalSendTime !== undefined) {
          const rtt = receiveTime - originalSendTime;
          rttSamples.push(rtt);
          acknowledged++;
          pending.delete(data.seq);
        }
      } catch (e) {
        // ignore malformed echoes
      }
      checkDone();
    };

    function sendNext() {
      if (seq >= sampleCount) return;
      const sendTime = performance.now();
      pending.set(seq, sendTime);
      const payload = buildPayload(sizeBytes, seq, sendTime);
      ws.send(payload);
      sent++;
      seq++;
      // Small stagger between sends so we measure steady-state RTT, not queuing artifacts
      setTimeout(sendNext, 40);
    }

    function checkDone() {
      if (seq >= sampleCount && acknowledged + (sent - acknowledged) >= sent && pending.size === 0) {
        finish();
      }
    }

    function finish() {
      resolve();
    }

    // Also resolve after a max wait in case some messages never come back (delivery failures)
    const maxWait = sampleCount * 40 + 5000;
    setTimeout(() => {
      resolve();
    }, maxWait);

    sendNext();
  });

  const deliverySuccessRate = sent > 0 ? acknowledged / sent : 0;
  const avgLatencyMs = rttSamples.length ? mean(rttSamples) : null;
  const jitterMs = rttSamples.length ? stdDev(rttSamples) : null;

  onProgress(`Latency samples collected: ${rttSamples.length}/${sent} (delivery rate: ${(deliverySuccessRate * 100).toFixed(1)}%)`);

  // ---------- 3. Throughput ----------
  // Messages successfully round-tripped per second, based on total time spent sending+receiving this batch.
  const totalBatchTimeSec = (rttSamples.length ? Math.max(...rttSamples, sent * 40) : sent * 40) / 1000;
  const throughputMsgsPerSec = totalBatchTimeSec > 0 ? acknowledged / totalBatchTimeSec : 0;

  // ---------- 4. Reconnection time ----------
  onProgress('Testing reconnection time...');
  ws.close();
  await new Promise((r) => setTimeout(r, 300)); // allow clean close before reconnecting

  const reconnectStart = performance.now();
  let reconnectionTimeMs = null;
  try {
    await new Promise((resolve, reject) => {
      const socket2 = new WebSocket(wsUrl);
      const timeout = setTimeout(() => reject(new Error('Reconnect timed out')), 10000);
      socket2.onopen = () => {
        clearTimeout(timeout);
        reconnectionTimeMs = performance.now() - reconnectStart;
        socket2.close();
        resolve();
      };
      socket2.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Reconnect failed'));
      };
    });
    onProgress(`Reconnected in ${reconnectionTimeMs.toFixed(1)} ms`);
  } catch (e) {
    onProgress(`Reconnection failed: ${e.message}`);
  }

  return {
    connectionEstablishmentTimeMs: Number(connectionEstablishmentTimeMs.toFixed(2)),
    avgLatencyMs: avgLatencyMs !== null ? Number(avgLatencyMs.toFixed(2)) : null,
    jitterMs: jitterMs !== null ? Number(jitterMs.toFixed(2)) : null,
    throughputMsgsPerSec: Number(throughputMsgsPerSec.toFixed(2)),
    reconnectionTimeMs: reconnectionTimeMs !== null ? Number(reconnectionTimeMs.toFixed(2)) : null,
    deliverySuccessRate: Number(deliverySuccessRate.toFixed(4)),
    sampleCount: sent,
    acknowledgedCount: acknowledged,
    rawSamples: rttSamples.map((v) => Number(v.toFixed(2))),
  };
}
