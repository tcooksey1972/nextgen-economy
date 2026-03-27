/**
 * @file sensorApi.js
 * @description REST API handler for Sensor Data operations.
 *
 * Endpoints:
 *   POST /sensors/register                    — Register a device DID
 *   POST /sensors/anchor                      — Anchor a data batch
 *   GET  /sensors/{deviceDID}/batches         — List device batches
 *   GET  /sensors/verify/{batchId}            — Verify a reading
 */
const { ethers } = require("ethers");
const { getSensorAnchor } = require("../../src/lib/contract");
const dynamo = require("../../src/lib/dynamo");
const config = require("../../src/lib/config");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json",
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

/** POST /sensors/register — Register a device DID on-chain. */
async function handleRegisterDevice(body) {
  const { deviceDID } = body;
  if (!deviceDID) return respond(400, { error: "Missing deviceDID" });

  const deviceHash = ethers.keccak256(ethers.toUtf8Bytes(deviceDID));
  const anchor = getSensorAnchor();
  const tx = await anchor.registerDevice(deviceHash);
  const receipt = await tx.wait();

  await dynamo.putItem(config.SENSOR_TABLE, {
    pk: `DEVICE#${deviceHash}`,
    sk: "PROFILE",
    deviceDID,
    deviceDIDHash: deviceHash,
    transactionHash: receipt.hash,
    registeredAt: new Date().toISOString(),
    status: "ACTIVE",
  });

  return respond(201, {
    deviceDIDHash: deviceHash,
    transactionHash: receipt.hash,
  });
}

/** POST /sensors/anchor — Anchor a sensor data batch. */
async function handleAnchorBatch(body) {
  const {
    batchId, deviceDID, merkleRoot, readingCount,
    startTimestamp, endTimestamp, metadataURI,
  } = body;

  if (!batchId || !deviceDID || !merkleRoot) {
    return respond(400, { error: "Missing required fields" });
  }

  const batchHash = ethers.keccak256(ethers.toUtf8Bytes(batchId));
  const deviceHash = ethers.keccak256(ethers.toUtf8Bytes(deviceDID));
  const anchor = getSensorAnchor();

  const tx = await anchor.anchorBatch(
    batchHash, deviceHash, merkleRoot,
    readingCount || 0, startTimestamp || 0, endTimestamp || 0,
    metadataURI || ""
  );
  const receipt = await tx.wait();

  await dynamo.putItem(config.SENSOR_TABLE, {
    pk: `DEVICE#${deviceHash}`,
    sk: `BATCH#${batchHash}`,
    batchId,
    batchHash,
    merkleRoot,
    readingCount,
    startTimestamp,
    endTimestamp,
    metadataURI: metadataURI || "",
    transactionHash: receipt.hash,
    anchoredAt: new Date().toISOString(),
  });

  return respond(201, {
    batchHash,
    merkleRoot,
    transactionHash: receipt.hash,
  });
}

/** GET /sensors/{deviceDID}/batches — List batches for a device. */
async function handleGetDeviceBatches(deviceDIDHash) {
  if (!deviceDIDHash) return respond(400, { error: "Missing device DID" });

  const batches = await dynamo.queryByPKAndSKPrefix(
    config.SENSOR_TABLE, `DEVICE#${deviceDIDHash}`, "BATCH#"
  );

  return respond(200, { count: batches.length, batches });
}

/** GET /sensors/verify/{batchId} — Verify a reading against batch root. */
async function handleVerifyReading(batchId, query) {
  const { leaf, proof } = query;
  if (!batchId || !leaf) {
    return respond(400, { error: "Missing batchId or leaf" });
  }

  const proofArray = proof ? proof.split(",") : [];
  const anchor = getSensorAnchor();
  const verified = await anchor.verifyReading(batchId, leaf, proofArray);

  return respond(200, { batchId, leaf, verified });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  try {
    if (path === "/sensors/register" && method === "POST") {
      return await handleRegisterDevice(body);
    }
    if (path === "/sensors/anchor" && method === "POST") {
      return await handleAnchorBatch(body);
    }
    if (path.match(/^\/sensors\/[^/]+\/batches$/) && method === "GET") {
      return await handleGetDeviceBatches(pathParams.deviceDID);
    }
    if (path.match(/^\/sensors\/verify\//) && method === "GET") {
      return await handleVerifyReading(pathParams.batchId, query);
    }

    return respond(404, { error: "Not found", path });
  } catch (err) {
    console.error(`Error handling ${method} ${path}:`, err);
    return respond(500, { error: "Internal server error", details: err.message });
  }
};
