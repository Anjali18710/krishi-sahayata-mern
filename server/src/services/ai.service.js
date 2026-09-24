// Optional: writes a short summary of a claim for the reviewing officer using an LLM.
// Tries Groq (Llama 3.3 70B) first and falls back to Google Gemini, the same pattern as DocuMind AI.
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
function buildClaimFacts(claim) {
  const wc = claim.weatherCheck || {};
  return [
    `Claim number: ${claim.claimNumber}`,
    `Current status: ${claim.status}`,
    `Crop: ${claim.crop.name}, ${claim.crop.season} season, ${claim.crop.areaAcres} acres`,
    `Reported cause of loss: ${claim.causeOfLoss}`,
    `Date of loss: ${claim.lossDate.toISOString().slice(0, 10)}`,
    `Submitted: ${claim.submittedAt.toISOString().slice(0, 10)}`,
    `Location: ${[claim.location.village, claim.location.district, claim.location.state].filter(Boolean).join(', ')}`,
    `Amount claimed: Rs ${claim.amountClaimed}`,
    `Farmer's description: ${claim.description || '(none)'}`,
    `Number of photos: ${claim.photos.length}`,
    `Weather check verdict: ${wc.verdict || 'not run'}${wc.score != null ? ` (score ${wc.score}/100)` : ''}`,
    `Weather check details: ${(wc.reasons || []).join(' ') || '(none)'}`,
    `Officer remarks so far: ${claim.statusHistory.map((h) => h.remark).filter(Boolean).join(' | ') || '(none)'}`,
  ].join('\n');
}

async function callGroq(facts) {
  const { data } = await axios.post(
    GROQ_URL,
    {
      model: env.ai.groqModel,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: facts },
      ],
    },
    { headers: { Authorization: `Bearer ${env.ai.groqApiKey}` }, timeout: 20000 }
  );
  return { text: data.choices[0].message.content.trim(), provider: 'groq', model: env.ai.groqModel };
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

async function summarizeClaim(claim) {
  if (!aiEnabled()) {
    throw new ApiError(503, 'AI summaries are turned off. Add GROQ_API_KEY or GEMINI_API_KEY to the server .env file.', 'AI_DISABLED');
  }
  const facts = buildClaimFacts(claim);
  const errors = [];

  if (env.ai.groqApiKey) {
    try {
      return await callGroq(facts);
    } catch (err) {
      errors.push(`Groq: ${err.response?.status || ''} ${err.message}`);
    }
  }
  if (env.ai.geminiApiKey) {
    try {
      return await callGemini(facts);
    } catch (err) {
      errors.push(`Gemini: ${err.response?.status || ''} ${err.message}`);
    }
  }
  console.error('AI summary failed:', errors.join('; '));
  throw new ApiError(502, 'The AI service did not respond. Please try again later.', 'AI_FAILED');
}

module.exports = { summarizeClaim, buildClaimFacts, aiEnabled };
