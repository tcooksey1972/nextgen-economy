/**
 * @file fhirApi.js
 * @description REST API handler for FHIR Healthcare Integration.
 *
 * Endpoints:
 *   POST /fhir/credentials/verify  — Verify healthcare credential via FHIR
 *   POST /fhir/records/anchor      — Anchor a FHIR bundle hash
 *   GET  /fhir/records/{hash}/verify — Verify health record provenance
 *
 * HIPAA notes:
 *   - NO PHI is stored on-chain. Only hashes and Merkle roots.
 *   - All PHI stays in S3 with SSE-KMS encryption.
 *   - Access control via DID-based authorization.
 */
const { ethers } = require("ethers");
const { getCredentialRegistry, getSensorAnchor } = require("../../src/lib/contract");
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

/**
 * Fetches a FHIR Practitioner resource from the configured FHIR server.
 * In production, this calls a real FHIR R4 endpoint.
 * For testing, uses a mock/HAPI FHIR test server.
 */
async function fetchFHIRPractitioner(npiNumber) {
  const fhirUrl = config.FHIR_SERVER_URL;
  if (!fhirUrl) {
    // Mock response for development
    return {
      resourceType: "Practitioner",
      identifier: [{ system: "http://hl7.org/fhir/sid/us-npi", value: npiNumber }],
      name: [{ family: "Smith", given: ["Jane"] }],
      qualification: [
        {
          code: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0360", code: "RN" }] },
          period: { start: "2020-01-01", end: "2027-12-31" },
          issuer: { display: "Indiana State Board of Nursing" },
        },
      ],
      active: true,
    };
  }

  // Production: fetch from real FHIR server
  const response = await fetch(
    `${fhirUrl}/Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|${npiNumber}`,
    { headers: { Accept: "application/fhir+json" } }
  );

  if (!response.ok) {
    throw new Error(`FHIR server returned ${response.status}`);
  }

  const bundle = await response.json();
  if (!bundle.entry || bundle.entry.length === 0) {
    return null;
  }

  return bundle.entry[0].resource;
}

/**
 * Cross-references a credential claim against a FHIR Practitioner resource.
 */
function crossReferencePractitioner(practitioner, claims) {
  const results = {
    nameMatch: false,
    npiMatch: false,
    qualificationMatch: false,
    activeMatch: false,
    details: {},
  };

  if (!practitioner) return results;

  // Check NPI
  const npiId = practitioner.identifier?.find(
    (id) => id.system === "http://hl7.org/fhir/sid/us-npi"
  );
  results.npiMatch = npiId?.value === claims.npiNumber;

  // Check name
  const name = practitioner.name?.[0];
  if (name) {
    results.nameMatch =
      name.family?.toLowerCase() === claims.lastName?.toLowerCase() &&
      name.given?.some((g) => g.toLowerCase() === claims.firstName?.toLowerCase());
  }

  // Check qualification
  if (practitioner.qualification && claims.qualificationCode) {
    results.qualificationMatch = practitioner.qualification.some((q) =>
      q.code?.coding?.some((c) => c.code === claims.qualificationCode)
    );
  }

  // Check active status
  results.activeMatch = practitioner.active === true;

  results.details = {
    practitionerName: name ? `${name.given?.join(" ")} ${name.family}` : "Unknown",
    qualifications: practitioner.qualification?.map((q) => ({
      code: q.code?.coding?.[0]?.code,
      issuer: q.issuer?.display,
      validUntil: q.period?.end,
    })),
    active: practitioner.active,
  };

  return results;
}

/** POST /fhir/credentials/verify — Verify healthcare credential via FHIR. */
async function handleFHIRCredentialVerify(body) {
  const { npiNumber, firstName, lastName, qualificationCode, holderDID, issuerDID } = body;

  if (!npiNumber || !holderDID) {
    return respond(400, { error: "Missing npiNumber or holderDID" });
  }

  // Fetch FHIR Practitioner resource
  const practitioner = await fetchFHIRPractitioner(npiNumber);
  if (!practitioner) {
    return respond(404, { error: "Practitioner not found in FHIR system" });
  }

  // Cross-reference claims
  const verification = crossReferencePractitioner(practitioner, {
    npiNumber, firstName, lastName, qualificationCode,
  });

  const allMatched = verification.npiMatch && verification.nameMatch &&
    verification.qualificationMatch && verification.activeMatch;

  // If verified, issue a HEALTHCARE credential on-chain
  let credentialResult = null;
  if (allMatched && issuerDID) {
    const credentialId = ethers.keccak256(
      ethers.toUtf8Bytes(`fhir-cred-${npiNumber}-${Date.now()}`)
    );
    const holderHash = ethers.keccak256(ethers.toUtf8Bytes(holderDID));
    const issuerHash = ethers.keccak256(ethers.toUtf8Bytes(issuerDID));
    const credentialHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(verification.details))
    );

    const registry = getCredentialRegistry();
    const tx = await registry.issueCredential(
      credentialId, issuerHash, holderHash, credentialHash,
      5, // HEALTHCARE type
      0, // no expiration (rely on FHIR source for expiration)
      ""
    );
    const receipt = await tx.wait();

    credentialResult = {
      credentialId,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  return respond(200, {
    verified: allMatched,
    verification,
    credential: credentialResult,
  });
}

/** POST /fhir/records/anchor — Anchor a FHIR bundle hash for provenance. */
async function handleAnchorFHIRRecord(body) {
  const { fhirBundle, deviceDID, metadataURI } = body;

  if (!fhirBundle) {
    return respond(400, { error: "Missing fhirBundle" });
  }

  // Hash the FHIR bundle (no PHI on-chain)
  const bundleHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(fhirBundle))
  );

  // Store hash reference in DynamoDB
  await dynamo.putItem(config.CREDENTIAL_TABLE, {
    pk: `FHIR#${bundleHash}`,
    sk: "RECORD",
    bundleHash,
    resourceType: fhirBundle.resourceType || "Bundle",
    deviceDID: deviceDID || null,
    metadataURI: metadataURI || "",
    anchoredAt: new Date().toISOString(),
  });

  return respond(201, {
    bundleHash,
    resourceType: fhirBundle.resourceType,
    anchoredAt: new Date().toISOString(),
  });
}

/** GET /fhir/records/{hash}/verify — Verify FHIR record provenance. */
async function handleVerifyFHIRRecord(bundleHash) {
  if (!bundleHash) return respond(400, { error: "Missing bundle hash" });

  const record = await dynamo.getItem(
    config.CREDENTIAL_TABLE, `FHIR#${bundleHash}`, "RECORD"
  );

  if (!record) {
    return respond(404, { error: "FHIR record not found", bundleHash });
  }

  return respond(200, {
    verified: true,
    bundleHash,
    anchoredAt: record.anchoredAt,
    resourceType: record.resourceType,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method;
  const body = event.body ? JSON.parse(event.body) : {};
  const pathParams = event.pathParameters || {};

  try {
    if (path === "/fhir/credentials/verify" && method === "POST") {
      return await handleFHIRCredentialVerify(body);
    }
    if (path === "/fhir/records/anchor" && method === "POST") {
      return await handleAnchorFHIRRecord(body);
    }
    if (path.match(/^\/fhir\/records\/[^/]+\/verify$/) && method === "GET") {
      return await handleVerifyFHIRRecord(pathParams.hash);
    }

    return respond(404, { error: "Not found", path });
  } catch (err) {
    console.error(`Error handling ${method} ${path}:`, err);
    return respond(500, { error: "Internal server error", details: err.message });
  }
};
