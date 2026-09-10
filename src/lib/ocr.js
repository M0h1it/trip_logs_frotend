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

// Note: there is intentionally no extractProductDetails/product OCR call —
// product photos are saved as-is. Only business card photos trigger a
// Gemini call; price and remarks for products are always entered manually.