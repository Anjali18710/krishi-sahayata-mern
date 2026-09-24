// SMS messages sent to the farmer whenever their claim changes status,
// in the farmer's chosen language (English or Hindi).
const { sendSms } = require('./sms.service');
const { STATUS } = require('./claimWorkflow');

const rupees = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

const TEMPLATES = {
  en: {
    [STATUS.SUBMITTED]: (c) =>
      `Krishi Sahayata: Your claim ${c.claimNumber} for ${c.crop.name} has been received. We will update you by SMS.`,
    [STATUS.UNDER_REVIEW]: (c) => `Krishi Sahayata: Your claim ${c.claimNumber} is now under review by an officer.`,
    [STATUS.FIELD_VERIFICATION]: (c) =>
      `Krishi Sahayata: A field officer will visit to verify the crop loss for claim ${c.claimNumber}.`,
    [STATUS.APPROVED]: (c) =>
      `Krishi Sahayata: Good news! Your claim ${c.claimNumber} has been APPROVED for ${rupees(c.amountApproved)}.`,
    [STATUS.REJECTED]: (c, remark) =>
      `Krishi Sahayata: Your claim ${c.claimNumber} was not approved. Reason: ${remark || 'see app for details'}.`,
    [STATUS.DISBURSED]: (c) =>
      `Krishi Sahayata: ${rupees(c.amountApproved)} for claim ${c.claimNumber} has been sent to your bank account ending ${c.bank.accountLast4}.`,
  },
  hi: {
    [STATUS.SUBMITTED]: (c) =>
      `कृषि सहायता: ${c.crop.name} के लिए आपका दावा ${c.claimNumber} प्राप्त हो गया है। हम आपको SMS से जानकारी देंगे।`,
    [STATUS.UNDER_REVIEW]: (c) => `कृषि सहायता: आपके दावे ${c.claimNumber} की अब अधिकारी द्वारा समीक्षा की जा रही है।`,
    [STATUS.FIELD_VERIFICATION]: (c) =>
      `कृषि सहायता: दावा ${c.claimNumber} के फसल नुकसान की जाँच के लिए क्षेत्र अधिकारी आपके खेत पर आएंगे।`,
    [STATUS.APPROVED]: (c) =>
      `कृषि सहायता: खुशखबरी! आपका दावा ${c.claimNumber} ${rupees(c.amountApproved)} के लिए स्वीकृत हो गया है।`,
    [STATUS.REJECTED]: (c, remark) =>
      `कृषि सहायता: आपका दावा ${c.claimNumber} स्वीकृत नहीं हुआ। कारण: ${remark || 'विवरण ऐप में देखें'}।`,
    [STATUS.DISBURSED]: (c) =>
      `कृषि सहायता: दावा ${c.claimNumber} की राशि ${rupees(c.amountApproved)} आपके बैंक खाते (अंतिम अंक ${c.bank.accountLast4}) में भेज दी गई है।`,
  },
};

function buildStatusMessage(claim, language = 'en', remark) {
  const templates = TEMPLATES[language] || TEMPLATES.en;
  return templates[claim.status](claim, remark);
}

/** Sends the SMS for the claim's current status. `farmer` needs phone, language and _id. */
async function notifyStatusChange(claim, farmer, remark) {
  return sendSms({
    to: claim.farmerPhone,
    body: buildStatusMessage(claim, farmer?.language, remark),
    type: 'status_update',
    userId: claim.farmer,
    claimId: claim._id,
  });
}

module.exports = { buildStatusMessage, notifyStatusChange };
