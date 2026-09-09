// Calls Gemini API to extract structured contact info from a business card photo.
// Requires internet. Caller should catch failures and fall back to manual entry.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const CARD_PROMPT = `You are reading a business card photo, which may be in Chinese, English, or both.
Extract the following fields and respond with ONLY a raw JSON object, no markdown fences, no preamble:
{
  "contactName": "person's full name",
  "companyName": "company name",
  "phones": ["each phone number as a separate array entry — split them apart, do not join with commas"],
  "email": "email address",
  "wechat": "WeChat ID if present on the card",
  "address": "company address if present"
}
If a field is not found on the card, use an empty string for it (or an empty array for phones). If the card is in Chinese, keep names/companies in Chinese characters (do not translate), but you may include pinyin in parentheses if helpful. Do not invent information that is not on the card.`;

const PRODUCT_PROMPT = `You are looking at a photo of a product, possibly with a label, tag, or spec sheet showing pricing.
Respond with ONLY a raw JSON object, no markdown fences:
{
  "productName": "short product name/description if visible",
  "notes": "any visible specs, model numbers, or pricing text found in the image"
}
If nothing relevant is visible, use empty strings.`;

async function callGemini(base64Image, prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse Gemini response as JSON:', text);
    throw new Error('Could not parse card details. Please enter manually.');
  }
}

export async function extractCardDetails(imageBlob) {
  const base64 = await blobToBase64(imageBlob);
  return callGemini(base64, CARD_PROMPT);
}

export async function extractProductDetails(imageBlob) {
  const base64 = await blobToBase64(imageBlob);
  return callGemini(base64, PRODUCT_PROMPT);
}