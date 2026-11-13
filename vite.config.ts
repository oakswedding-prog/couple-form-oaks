import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'live-token-api-dev',
        configureServer(server) {
          server.middlewares.use('/api/live-token', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }));
              return;
            }
            try {
              const ai = new GoogleGenAI({
                apiKey,
                httpOptions: {
                  headers: {
                    'User-Agent': 'aistudio-build',
                  },
                },
              });
              const token = await ai.authTokens.create({ config: {} });
              res.statusCode = 200;
              res.end(JSON.stringify({ token: token.name }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to create token' }));
            }
          });

          // Shared server-side Gemini helper using @google/genai and gemini-4-hydrogen
          async function callGemini(systemInstruction: string, userPrompt: string): Promise<string> {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              throw new Error('GEMINI_API_KEY is not set');
            }
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            });

            const response = await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: userPrompt,
              config: {
                systemInstruction,
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.MEDIUM,
                },
              },
            });

            return (response.text || '').trim();
          }

          // 1. EDITORIAL CREATIVE BRIEF GENERATOR (Gemini)
          server.middlewares.use('/api/generate-brief', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            if (!process.env.GEMINI_API_KEY) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }));
              return;
            }

            try {
              let bodyStr = '';
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const { answers, systemPrompt } = JSON.parse(bodyStr || '{}');

              const userPrompt = `Here are the couple's responses to all 28 questions in the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

IMPORTANT INSTRUCTIONS FOR EDITORIAL CREATIVE BRIEF (ALL 28 QUESTIONS):
- Cover ALL 28 questions (Q01 through Q28) in their exact original order, grouped under the 6 chapters separated by \`==================================================\`:
  * CHAPTER 1 — YOUR STORY (Q1–Q9)
  * CHAPTER 2 — YOUR PEOPLE (Q10)
  * CHAPTER 3 — THE LOOK AND FEEL (Q11–Q15)
  * CHAPTER 4 — YOUR DAY (Q16–Q19)
  * CHAPTER 5 — WORKING TOGETHER (Q20–Q26)
  * CHAPTER 6 — ONE LAST THING (Q27–Q28)
- NEVER reproduce lengthy raw answers verbatim. Convert long responses into 2–4 concise, clear bullet points preserving key details, names, preferences, emotions, and expectations.
- Keep short answers equally short (1 concise bullet point; never pad or expand).
- If a question has no answer provided, output strictly: \`- Not provided\`.
- Do NOT invent details or add assumptions the couple has not stated.
- Write in simple, clear English so the photography and film team can understand all 28 responses in a few minutes.
- Output ONLY the finished brief starting with the couple's names.`;

              const text = await callGemini(
                systemPrompt || 'You are the Couple Brief Writer at OAKS WEDDING.',
                userPrompt
              );

              res.statusCode = 200;
              res.end(JSON.stringify({ brief: text }));
            } catch (err: any) {
              console.error('Error generating brief with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate brief' }));
            }
          });

          // 2. COUPLE INTERVIEW & TESTIMONIAL QUESTIONS (Gemini)
          server.middlewares.use('/api/generate-interview', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            if (!process.env.GEMINI_API_KEY) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }));
              return;
            }

            try {
              let bodyStr = '';
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const { answers, systemPrompt, eventType } = JSON.parse(bodyStr || '{}');

              const userPrompt = `Here are the couple's responses to the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

Event/Session Context: ${eventType || 'wedding'}

CRITICAL RULES FOR GENERATION:
1. NEVER copy or paste the couple's original questionnaire answers or paragraphs into the questions. Never put long answers inside brackets.
2. Write in simple, conversational English. Sound like a friendly, curious human sitting across from the couple.
3. Absolutely NO artificial movie melodrama or poetic drama (do not use "unspoken thought rushing through your chest", "eyes tell you that words never could", "mean to your souls").
4. Follow the exact quality, tone, and conversational phrasing of the Riya & Roshan 11 interview questions benchmark.
5. Provide exactly 11 numbered questions, each with title, Ask target, the question, and a short optional follow-up, followed by ### INTERVIEW DIRECTION.`;

              const text = await callGemini(
                systemPrompt || 'You are the Documentary Interviewer at OAKS WEDDING.',
                userPrompt
              );

              res.statusCode = 200;
              res.end(JSON.stringify({ interview: text }));
            } catch (err: any) {
              console.error('Error generating interview with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate interview' }));
            }
          });

          // 3. SHOOT DAY CHEAT SHEET GENERATOR (Gemini)
          server.middlewares.use('/api/generate-cheatsheet', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            if (!process.env.GEMINI_API_KEY) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }));
              return;
            }

            try {
              let bodyStr = '';
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const { answers, systemPrompt } = JSON.parse(bodyStr || '{}');

              const userPrompt = `Here are the couple's responses to the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

CRITICAL PRODUCTION RULES FOR SHOOT DAY CHEAT SHEET:
1. Target length: ~150–220 words. Total scan time for crew: 30–60 seconds.
2. The cheat sheet is NOT a summary of all 28 answers. It is an on-day quick production cue sheet.
3. NEVER copy long paragraphs or sentences directly from questionnaire answers.
4. Use simple, crisp, clear English. Prefer short bullet points over paragraphs.
5. Exactly follow the 6 uppercase numbered sections:
   01 — THE VIBE
   02 — TOP PRIORITIES
   03 — MUST-CAPTURE MOMENTS
   04 — IMPORTANT PEOPLE
   05 — PLEASE AVOID
   06 — WORKING WITH THE COUPLE (include Primary contact with name & phone if provided)
   (plus TECHNICAL NON-NEGOTIABLE if applicable).
6. Match the exact tone and structure of the Riya & Roshan reference model.
7. Return ONLY the finished cheat sheet text, starting with "OAKS WEDDING".`;

              const text = await callGemini(
                systemPrompt || 'You are the Lead Shoot Coordinator at OAKS WEDDING.',
                userPrompt
              );

              res.statusCode = 200;
              res.end(JSON.stringify({ cheatSheet: text }));
            } catch (err: any) {
              console.error('Error generating cheat sheet with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate cheat sheet' }));
            }
          });

          // 4. THE COUPLE LETTER GENERATOR (Gemini)
          server.middlewares.use('/api/generate-letter', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            if (!process.env.GEMINI_API_KEY) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }));
              return;
            }

            try {
              let bodyStr = '';
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const { answers, systemPrompt } = JSON.parse(bodyStr || '{}');

              const userPrompt = `Here are the couple's responses to all 28 questions in the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

MASTER GENERATION INSTRUCTIONS — THE COUPLE LETTER (VERSION 2.0):
1. TWO-STAGE PROCESS:
   - STAGE 1 (UNDERSTAND): First internally analyze all 28 answers. Understand their meeting story, personalities, work, what they love in each other, aesthetic vision, key family VIPs, camera comfort, and top values.
   - STAGE 2 (WRITE): Write a warm, personal letter from OAKS Wedding to the couple titled "OUR UNDERSTANDING OF YOUR WEDDING".
2. SECTION 1 — YOUR STORY & PERSONALITY (YASH & SAMARA BENCHMARK):
   - Communicate what our team has understood psychologically and personally about the couple.
   - Anchor your understanding in EMOTIONAL SAFETY, SHARED TRUST, AND CREATIVE BALANCE.
   - DO NOT retell their love story. DO NOT shorten their answers. DO NOT copy their sentences, timelines, or expressions.
   - The couple already knows their own story. Understand what makes their relationship special and express that understanding in our own words.
   - Write strictly from OAKS Wedding's perspective speaking TO the couple ("you", "your", "each other", and "we" ONLY for OAKS Wedding). NEVER switch perspectives or leak first-person client pronouns ("I", "my", "me", "we first met", "we were school friends").
   - NEVER use broken template bridges like "From what you've shared...", "You first met...", "with [Name] focused on...", or "engaged in...".
   - Structure strictly into THREE organic paragraphs (~180–220 words):
     * Paragraph 1 (Emotional Safety & Foundation): What makes their bond special (friendship, quiet trust, patience, emotional safety, mutual support)? Identify the meaningful connection behind the events instead of repeating the timeline.
     * Paragraph 2 (Individual Personalities & Creative Balance): Understand each partner's creative side, work, and passions (from Q2) in clean words. Explain how these two distinct creative worlds complement each other naturally.
     * Paragraph 3 (Connection as a Couple & Everyday Dynamic): Everyday conversations, shared humour, little nuances, nicknames, constant companionship, and building a marriage on friendship, shared trust, and emotional safety.
   - Writing style: Simple, natural, human language that even a 10-year-old can easily understand. Warm, personal, emotionally meaningful.
   - Reference benchmark:
     "What stands out about the two of you is that your relationship has always had friendship at its heart. Long before you became a couple, you had already built a bond that grew stronger with time, even when life kept you miles apart. You found ways to be part of each other's everyday lives, through different stages, places and experiences. And somewhere along the way, that friendship became something much deeper.

     There is something lovely about the way you seem to be both best friends and partners. You share a strong connection, but you also have your own worlds, interests and creative sides. Samara has always been drawn to design, art and making things, while Yash finds his creative space through music, mixing and discovering new sounds. Two different creative worlds that come together naturally.

     We also get the feeling that your relationship is full of little things that make it yours — the everyday conversations, the shared humour, the constant companionship and simply having each other around. More than anything, we see a couple who have built their relationship on friendship, trust and being there for each other. And that's a beautiful place for a marriage to begin."
3. STRICT RAW ANSWER INTERPRETATION:
   - NEVER copy or paste raw questionnaire answers into predefined sentences.
   - Silently interpret, rewrite, and clean first-person answers into natural third-person prose.
   - Clean out conversational fillers like "So we actually...", "Well...", "Basically...", "Honestly...".
4. ZERO EMPTY CONTENT:
   - NEVER write orphaned intro sentences like "You've mentioned several moments you're especially excited about:" if nothing follows.
   - NEVER produce empty bullet lists.
   - If a section or question was not answered, omit that section completely.
5. ACCURACY & COMMITMENT CONTROL:
   - Do not promise specific percentages, unconfirmed meetings, coffee sessions, or unconfirmed extra services.
6. LENGTH & SIGN-OFF:
   - 350–600 words total of warm, simple, human English.
   - End strictly with:
With love,
Team OAKS Wedding

Return ONLY the finished letter text starting with the couple's names.`;

              const text = await callGemini(
                systemPrompt || 'You are the Creative Director and Studio Owner at OAKS WEDDING.',
                userPrompt
              );

              res.statusCode = 200;
              res.end(JSON.stringify({ letter: text }));
            } catch (err: any) {
              console.error('Error generating couple letter with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate couple letter' }));
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/jspdf')) {
              return 'vendor-pdf';
            }
            if (id.includes('node_modules/docx')) {
              return 'vendor-docx';
            }
            if (id.includes('node_modules/canvas-confetti')) {
              return 'vendor-confetti';
            }
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
