/**
 * @file alerts.js
 * @description SNS alert publisher for the Asset Tokenization Lambda functions.
 *
 * Sends alerts for critical events: inspection discrepancies, large disposals,
 * unauthorized access attempts. Uses AWS SDK v3 (provided by Lambda runtime).
 */
const config = require("./config");

let _sns = null;

function getSns() {
  if (!_sns) {
    const { SNSClient } = require("@aws-sdk/client-sns");
    _sns = new SNSClient({});
  }
  return _sns;
}

/**
 * Sends an alert via SNS.
 * @param {{ severity: string, title: string, message: string, data?: object }} opts
 */
async function sendAlert({ severity, title, message, data }) {
  if (!config.alertTopicArn) {
    console.log(`[ALERT][${severity}] ${title}: ${message}`);
    return;
  }

  const { PublishCommand } = require("@aws-sdk/client-sns");
  const body = [
    `[${severity}] ${title}`,
    "",
    message,
    "",
    `Contract: ${config.contractAddress}`,
    `Chain: ${config.chainId}`,
    `Time: ${new Date().toISOString()}`,
  ];

  if (data) {
    body.push("", "Data:", JSON.stringify(data, null, 2));
  }

  await getSns().send(new PublishCommand({
    TopicArn: config.alertTopicArn,
    Subject: `[NGE Assets] ${severity}: ${title}`.slice(0, 100),
    Message: body.join("\n"),
    MessageAttributes: {
      severity: { DataType: "String", StringValue: severity },
    },
  }));
}

module.exports = {
  info: (title, message, data) => sendAlert({ severity: "INFO", title, message, data }),
  warning: (title, message, data) => sendAlert({ severity: "WARNING", title, message, data }),
  critical: (title, message, data) => sendAlert({ severity: "CRITICAL", title, message, data }),
};
