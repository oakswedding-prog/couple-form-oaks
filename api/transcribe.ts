import { GoogleGenAI } from "@google/genai";

async function readRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: any) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error: "GEMINI_API_KEY is not configured on the server.",
      })
    );
  }

  try {
    const body = await readRequestBody(req);
    const { audio, mimeType = "audio/webm", language = "English" } = body || {};

    if (!audio || typeof audio !== "string") {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({ error: "Missing required 'audio' base64 data" })
      );
    }

    // Clean any data URL prefix (e.g. data:audio/webm;base64,...)
    const base64Data = audio.replace(/^data:audio\/[a-zA-Z0-9.+_-]+;base64,/, "");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType.split(";")[0] || "audio/webm",
              },
            },
            {
              text: `You are an accurate, verbatim audio speech-to-text transcriber. Transcribe the spoken audio verbatim in the original spoken language.
Language clue: ${language}.
Rules:
- Output ONLY the transcribed words spoken in the audio.
- Do NOT add any introductory text, quotation marks, formatting headers, conversational filler, or commentary.
- If there is no audible speech or only silence/static, output nothing (empty string).`,
            },
          ],
        },
      ],
    });

    const text = (response.text || "").trim();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ text }));
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: error?.message || "Failed to transcribe audio",
      })
    );
  }
}
