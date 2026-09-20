import { atomicallyVerifyAndConsumeCurrentTrust } from './approval-trust-atomic-gateway-v1.mjs';
import { verifyApprovalConsumptionReceipt } from './approval-consumption-v1.mjs';
import { verifyCryptographicApprovalReceipt } from './approval-envelope-v1.mjs';
import { publishTrustCurrentHead } from './approval-trust-current-head-v1.mjs';

export async function publishCurrentApprovalTrust(client, input) {
  return publishTrustCurrentHead(client, input);
}

export async function verifyAndConsumeCurrentApprovalTrust(client, input) {
  return atomicallyVerifyAndConsumeCurrentTrust(client, input);
}

export function verifyCurrentApprovalEvidence({ verificationReceipt, consumptionReceipt }) {
  return {
    verificationReceipt: verifyCryptographicApprovalReceipt(verificationReceipt),
    consumptionReceipt: verifyApprovalConsumptionReceipt(consumptionReceipt),
  };
}
