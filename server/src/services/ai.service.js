// Optional: writes a short summary of a claim for the reviewing officer using an LLM.
// Tries Groq (GPT-OSS 120B; Llama 3.3 70B was retired by Groq in Aug 2026) first and falls back to Google Gemini, the same pattern as DocuMind AI.
// The summary only helps the officer read faster - it never approves or rejects anything.
const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = [
  'You help crop-insurance officers in India review farmer claims.',
  'Summarise the claim in 4 to 6 short bullet points using only the facts given.',
  'Mention whether the weather check supports the reported cause, and list anything missing or worth verifying in the field.',
  'Do not recommend approving or rejecting the claim. Do not invent facts.',
].join(' ');

const aiEnabled = () => Boolean(env.ai.groqApiKey || env.ai.geminiApiKey);

// Only non-personal facts are sent to the AI provider (no phone or bank details).
function buildClaimFacts(claim, amountCheck) {
  const wc = claim.weatherCheck || {};
  let amountLine = 'Amount check: no per-acre limit set for this crop';
  if (amountCheck?.limit) {
    amountLine =
      `Amount check: Rs ${amountCheck.perAcre} per acre claimed; the limit for this crop is Rs ${amountCheck.limit} per acre ` +
      `(${amountCheck.overLimit ? `ABOVE the limit, ${amountCheck.ratio}x` : 'within the limit'})`;
  }
  return [
    `Claim number: ${claim.claimNumber}`,
    `Current status: ${claim.status}`,
    `Crop: ${claim.crop.name}, ${claim.crop.season} season, ${claim.crop.areaAcres} acres`,
    `Reported cause of loss: ${claim.causeOfLoss}`,
    `Date of loss: ${claim.lossDate.toISOString().slice(0, 10)}`,
    `Submitted: ${claim.submittedAt.toISOString().slice(0, 10)}`,
    `Location: ${[claim.location.village, claim.location.district, claim.location.state].filter(Boolean).join(', ')}`,
    `Amount claimed: Rs ${claim.amountClaimed}`,
    amountLine,
    `IFSC code checked against the bank directory: ${claim.bank?.ifscVerified ? 'yes, found' : 'no'}`,
    `Farmer's description: ${claim.description || '(none)'}`,
    `Number of photos: ${claim.photos.length}`,
    `Weather check verdict: ${wc.verdict || 'not run'}${wc.score != null ? ` (score ${wc.score}/100)` : ''}`,
    `Weather check details: ${(wc.reasons || []).join(' ') || '(none)'}`,
    `Officer remarks so far: ${
      claim.statusHistory
        .map((h) => h.remark)
        .filter(Boolean)
        .join(' | ') || '(none)'
    }`,
  ].join('\n');
}

// The provider's own error text (e.g. "Invalid API Key") is much more useful in the logs than "status 401"
function describeError(err) {
  const detail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
  return `${err.response?.status || ''} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.trim();
}

async function callGroq(facts) {
  const { data } = await axios.post(
    GROQ_URL,
    {
      model: env.ai.groqModel,
      temperature: 0.2,
      // GPT-OSS models "think" before answering; the thinking also uses tokens, so allow room for both
      max_completion_tokens: 1200,
      ...(env.ai.groqModel.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: facts },
      ],
    },
    { headers: { Authorization: `Bearer ${env.ai.groqApiKey}` }, timeout: 20000 }
  );
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty response');
  return { text, provider: 'groq', model: env.ai.groqModel };
}

async function callGemini(facts) {
  const { data } = await axios.post(
    geminiUrl(env.ai.geminiModel),
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: facts }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    },
    { headers: { 'x-goog-api-key': env.ai.geminiApiKey }, timeout: 20000 }
  );
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Gemini returned an empty response');
  return { text: text.trim(), provider: 'gemini', model: env.ai.geminiModel };
}

async function summarizeClaim(claim, amountCheck) {
  if (!aiEnabled()) {
    throw new ApiError(
      503,
      'AI summaries are turned off. Add GROQ_API_KEY or GEMINI_API_KEY to the server .env file.',
      'AI_DISABLED'
    );
  }
  const facts = buildClaimFacts(claim, amountCheck);
  const errors = [];

  if (env.ai.groqApiKey) {
    try {
      return await callGroq(facts);
    } catch (err) {
      errors.push(`Groq: ${describeError(err)}`);
    }
  }
  if (env.ai.geminiApiKey) {
    try {
      return await callGemini(facts);
    } catch (err) {
      errors.push(`Gemini: ${describeError(err)}`);
    }
  }
  console.error('AI summary failed:', errors.join('; '));
  throw new ApiError(502, 'The AI service did not respond. Please try again later.', 'AI_FAILED');
}

module.exports = { summarizeClaim, buildClaimFacts, aiEnabled };
