/**
 * @file alerts.js
 * @description SNS alert publisher. Formats and sends alert notifications
 * to the configured SNS topic (email subscribers receive these).
 *
 * Alert severity levels determine the SNS message attributes, allowing
 * subscribers to filter by severity if needed.
 */
const config = require("./config");

/**
 * Lazily loaded AWS SDK modules (provided by Lambda runtime, not installed locally).
 * @type {Object|null}
 */
let _sdk = null;

/** @type {Object|null} */
let _client = null;

/**
 * Returns the AWS SNS SDK module, loading it lazily.
 *
 * @returns {Object} The @aws-sdk/client-sns module.
 */
function getSdk() {
  if (!_sdk) {
    _sdk = require("@aws-sdk/client-sns");
  }
  return _sdk;
}

/**
 * Returns a cached SNS client.
 *
 * @returns {Object} SNSClient instance.
 */
function getClient() {
  if (!_client) {
    const { SNSClient } = getSdk();
    _client = new SNSClient({});
  }
  return _client;
}

/**
 * Sends an alert notification via SNS.
 *
 * @param {Object} alert - Alert details.
 * @param {"INFO"|"WARNING"|"CRITICAL"} alert.severity - Alert severity.
 * @param {string} alert.title - Short alert title.
 * @param {string} alert.message - Detailed alert message.
 * @param {Object} [alert.data] - Optional structured data to include.
 * @returns {Promise<void>}
 */
async function sendAlert({ severity, title, message, data }) {
  if (!config.alertTopicArn) {
    console.log(`[ALERT][${severity}] ${title}: ${message}`);
    if (data) console.log("  Data:", JSON.stringify(data));
    return; // No SNS topic configured — log only
  }

  const { PublishCommand } = getSdk();
  const client = getClient();
  const fullMessage = [
    `🚨 NGE Sentinel Alert — ${severity}`,
    ``,
    `${title}`,
    ``,
    message,
    ``,
    `Contract: ${config.contractAddress}`,
    `Chain: Sepolia (${config.chainId})`,
    `Time: ${new Date().toISOString()}`,
    data ? `\nDetails:\n${JSON.stringify(data, null, 2)}` : "",
  ].join("\n");

  await client.send(
    new PublishCommand({
      TopicArn: config.alertTopicArn,
      Subject: `[${severity}] NGE Sentinel: ${title}`.substring(0, 100),
      Message: fullMessage,
      MessageAttributes: {
        severity: {
          DataType: "String",
          StringValue: severity,
        },
      },
    })
  );
}

/**
 * Convenience methods for each severity level.
 */
const alerts = {
  info: (title, message, data) =>
    sendAlert({ severity: "INFO", title, message, data }),

  warning: (title, message, data) =>
    sendAlert({ severity: "WARNING", title, message, data }),

  critical: (title, message, data) =>
    sendAlert({ severity: "CRITICAL", title, message, data }),
};

module.exports = { sendAlert, ...alerts };
