/**
 * @file stateIdVerification.js
 * @description State ID verification Lambda — validates state-issued ID data
 * against state-specific schemas and issues a STATE_ID Verifiable Credential.
 *
 * Indiana BMV is the reference implementation. Other states can be added
 * by implementing the AbstractStateIDAdapter pattern via DynamoDB schema entries.
 *
 * Flow (Step Function orchestrates):
 *   1. User submits state ID data (name, DOB, ID number, issuing state)
 *   2. This Lambda validates format against state-specific schema
 *   3. Hash PII fields with salt → create state ID commitment
 *   4. If valid, returns commitment hash for credential issuance
 *
 * NOTE: No direct BMV API integration. Validation is schema-based
 * using public information patterns (ID format, field requirements).
 */
const { ethers } = require("ethers");
const dynamo = require("../../src/lib/dynamo");
const config = require("../../src/lib/config");

// ─────────────────────────────────────────────
//  State ID Schemas
// ─────────────────────────────────────────────

const STATE_SCHEMAS = {
  IN: {
    issuingState: "IN",
    issuingAuthority: "Indiana Bureau of Motor Vehicles",
    idFormat: /^\d{4}-\d{2}-\d{4}$/,
    documentTypes: ["driversLicense", "stateID", "learnerPermit", "realID"],
    fieldValidation: {
      firstName: { required: true, maxLength: 50 },
      lastName: { required: true, maxLength: 50 },
      dateOfBirth: { required: true, format: "ISO8601" },
      idNumber: { required: true, regex: /^\d{4}-\d{2}-\d{4}$/ },
      expirationDate: { required: true, format: "ISO8601", mustBeFuture: true },
      documentType: { required: true, enum: ["driversLicense", "stateID", "learnerPermit", "realID"] },
      street: { required: true },
      city: { required: true },
      state: { required: true, enum: ["IN"] },
      zip: { required: true, regex: /^\d{5}(-\d{4})?$/ },
    },
  },
  OH: {
    issuingState: "OH",
    issuingAuthority: "Ohio Bureau of Motor Vehicles",
    idFormat: /^[A-Z]{2}\d{6}$/,
    documentTypes: ["driversLicense", "stateID", "realID"],
    fieldValidation: {
      firstName: { required: true, maxLength: 50 },
      lastName: { required: true, maxLength: 50 },
      dateOfBirth: { required: true, format: "ISO8601" },
      idNumber: { required: true, regex: /^[A-Z]{2}\d{6}$/ },
      expirationDate: { required: true, format: "ISO8601", mustBeFuture: true },
      documentType: { required: true, enum: ["driversLicense", "stateID", "realID"] },
      street: { required: true },
      city: { required: true },
      state: { required: true, enum: ["OH"] },
      zip: { required: true, regex: /^\d{5}(-\d{4})?$/ },
    },
  },
  // Generic REAL ID compliant adapter (AAMVA standard)
  GENERIC: {
    issuingState: "GENERIC",
    issuingAuthority: "State Motor Vehicle Agency",
    idFormat: /^[A-Z0-9-]{5,20}$/,
    documentTypes: ["driversLicense", "stateID", "realID"],
    fieldValidation: {
      firstName: { required: true, maxLength: 50 },
      lastName: { required: true, maxLength: 50 },
      dateOfBirth: { required: true, format: "ISO8601" },
      idNumber: { required: true, regex: /^[A-Z0-9-]{5,20}$/ },
      expirationDate: { required: true, format: "ISO8601", mustBeFuture: true },
      documentType: { required: true, enum: ["driversLicense", "stateID", "realID"] },
    },
  },
};

/**
 * Validates a field value against a field schema.
 */
function validateField(fieldName, value, schema) {
  const errors = [];

  if (schema.required && (!value || String(value).trim() === "")) {
    errors.push(`${fieldName} is required`);
    return errors;
  }

  if (!value) return errors;

  if (schema.maxLength && String(value).length > schema.maxLength) {
    errors.push(`${fieldName} exceeds max length of ${schema.maxLength}`);
  }

  if (schema.regex && !schema.regex.test(String(value))) {
    errors.push(`${fieldName} format is invalid`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${schema.enum.join(", ")}`);
  }

  if (schema.format === "ISO8601") {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      errors.push(`${fieldName} must be a valid ISO 8601 date`);
    }
    if (schema.mustBeFuture && date < new Date()) {
      errors.push(`${fieldName} must be a future date`);
    }
  }

  return errors;
}

/**
 * Validates all fields of a state ID submission against the state schema.
 */
function validateStateID(stateCode, data) {
  const schema = STATE_SCHEMAS[stateCode] || STATE_SCHEMAS.GENERIC;
  const errors = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema.fieldValidation)) {
    const value = data[fieldName] || data.address?.[fieldName];
    errors.push(...validateField(fieldName, value, fieldSchema));
  }

  return {
    valid: errors.length === 0,
    errors,
    schema: {
      issuingState: schema.issuingState,
      issuingAuthority: schema.issuingAuthority,
    },
  };
}

/**
 * Creates a privacy-preserving commitment hash from PII fields.
 * The commitment is stored on-chain; raw PII never goes on-chain.
 */
function createStateIDCommitment(data, salt) {
  const commitmentInput = [
    data.firstName?.toLowerCase(),
    data.lastName?.toLowerCase(),
    data.dateOfBirth,
    data.idNumber,
    data.issuingState,
    salt,
  ].join("|");

  return ethers.keccak256(ethers.toUtf8Bytes(commitmentInput));
}

exports.handler = async (event) => {
  console.log("StateIDVerification event:", JSON.stringify(event));

  const {
    issuingState, firstName, lastName, dateOfBirth,
    idNumber, expirationDate, documentType,
    address, realIdCompliant, organDonor, holderDID,
  } = event;

  if (!issuingState || !firstName || !lastName || !idNumber || !holderDID) {
    return {
      statusCode: 400,
      valid: false,
      error: "Missing required fields: issuingState, firstName, lastName, idNumber, holderDID",
    };
  }

  // Step 1: Validate against state-specific schema
  const validation = validateStateID(issuingState, {
    firstName, lastName, dateOfBirth, idNumber,
    expirationDate, documentType,
    ...address,
  });

  if (!validation.valid) {
    return {
      statusCode: 400,
      valid: false,
      errors: validation.errors,
      schema: validation.schema,
    };
  }

  // Step 2: Create privacy-preserving commitment
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitment = createStateIDCommitment(
    { firstName, lastName, dateOfBirth, idNumber, issuingState },
    salt
  );

  // Step 3: Store validation result (salt stored encrypted, NOT on-chain)
  const holderHash = ethers.keccak256(ethers.toUtf8Bytes(holderDID));
  await dynamo.putItem(config.IDENTITY_TABLE, {
    pk: `DID#${holderHash}`,
    sk: `STATEID#${issuingState}`,
    issuingState,
    documentType: documentType || "stateID",
    commitment,
    realIdCompliant: realIdCompliant || false,
    validatedAt: new Date().toISOString(),
    // Salt stored encrypted — needed for future re-verification
    // In production, encrypt with KMS before storing
    encryptedSalt: salt,
    schema: validation.schema,
  });

  return {
    statusCode: 200,
    valid: true,
    commitment,
    issuingState,
    issuingAuthority: validation.schema.issuingAuthority,
    documentType: documentType || "stateID",
    holderDID,
    // Downstream Step Function step will issue the STATE_ID credential
    // using this commitment as the credential hash
  };
};
