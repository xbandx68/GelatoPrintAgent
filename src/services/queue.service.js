let queue = [];
let processing = false;
let jobCounter = 0;

/**
 * Enqueue a print job function. Jobs run one at a time (no parallel BLE writes).
 * @param {Function} jobFn  async function that performs the print
 * @returns {Promise<string>} jobId
 */
function enqueue(jobFn) {
  return new Promise((resolve, reject) => {
    const jobId = `job_${++jobCounter}`;
    queue.push({ jobId, jobFn, resolve, reject });
    console.log(`[Queue] Job ${jobId} enqueued (queue length: ${queue.length})`);
    processNext();
    resolve(jobId); // resolve immediately with jobId, job runs async
  });
}

async function processNext() {
  if (processing || queue.length === 0) return;

  processing = true;
  const { jobId, jobFn } = queue.shift();

  console.log(`[Queue] Starting ${jobId}...`);
  try {
    await jobFn();
    console.log(`[Queue] ${jobId} completed`);
  } catch (err) {
    console.error(`[Queue] ${jobId} failed:`, err.message);
  } finally {
    processing = false;
    processNext();
  }
}

function getQueueLength() {
  return queue.length;
}

module.exports = { enqueue, getQueueLength };
