import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { GoogleGenAI } from '@google/genai';

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
              const ai = new GoogleGenAI({ apiKey });
              const token = await ai.authTokens.create({ config: {} });
              res.statusCode = 200;
              res.end(JSON.stringify({ token: token.name }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to create token' }));
            }
          });
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

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
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

              const ai = new GoogleGenAI({ apiKey });
              const prompt = `Here are the couple's responses to the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

IMPORTANT INSTRUCTIONS:
- Write a short, simple and beautiful wedding brief (~350–500 words, 2–3 min read for the photography and cinema team).
- NEVER copy long answers or paragraphs directly from the questionnaire. Understand and rewrite them in your own words.
- Write in simple English with a six-year-old reading-ease target (short sentences, simple common words, no fancy jargon).
- Follow the exact Riya & Roshan benchmark structure and divider lines (==================================================).
- Produce ONLY the finished couple brief starting with the couple's names.`;

              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                  systemInstruction: systemPrompt || undefined,
                  temperature: 0.6,
                },
              });

              const text = response.text || '';
              res.statusCode = 200;
              res.end(JSON.stringify({ brief: text }));
            } catch (err: any) {
              console.error('Error generating brief with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate brief' }));
            }
          });

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

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
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

              const ai = new GoogleGenAI({ apiKey });
              const prompt = `Here are the couple's responses to the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

Event/Session Context: ${eventType || 'wedding'}

CRITICAL RULES FOR GENERATION:
1. NEVER copy or paste the couple's original questionnaire answers or paragraphs into the questions. Never put long answers inside brackets.
2. Write in simple, conversational English. Sound like a friendly, curious human sitting across from the couple.
3. Absolutely NO artificial movie melodrama or poetic drama (do not use "unspoken thought rushing through your chest", "eyes tell you that words never could", "mean to your souls").
4. Follow the exact quality, tone, and conversational phrasing of the Riya & Roshan 11 interview questions benchmark.
5. Provide exactly 11 numbered questions, each with title, Ask target, the question, and a short optional follow-up, followed by ### INTERVIEW DIRECTION.`;

              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                  systemInstruction: systemPrompt || undefined,
                  temperature: 0.7,
                },
              });

              const text = response.text || '';
              res.statusCode = 200;
              res.end(JSON.stringify({ interview: text }));
            } catch (err: any) {
              console.error('Error generating interview with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate interview' }));
            }
          });

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

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
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

              const ai = new GoogleGenAI({ apiKey });
              const prompt = `Here are the couple's responses to the OAKS Wedding Questionnaire:
${JSON.stringify(answers, null, 2)}

CRITICAL PRODUCTION RULES FOR SHOOT DAY CHEAT SHEET:
1. Target length: ~150–220 words. Total scan time for crew: 30–60 seconds.
2. The cheat sheet is NOT a summary of all 23 answers. It is an on-day quick production cue sheet.
3. NEVER copy long paragraphs or sentences directly from questionnaire answers.
4. Use simple, crisp, clear English. Prefer short bullet points over paragraphs.
5. Exactly follow the 6 uppercase numbered sections:
   01 — THE VIBE
   02 — TOP PRIORITIES
   03 — MUST-CAPTURE MOMENTS
   04 — IMPORTANT PEOPLE
   05 — PLEASE AVOID
   06 — WORKING WITH THE COUPLE
   (plus TECHNICAL NON-NEGOTIABLE if applicable).
6. Match the exact tone and structure of the Riya & Roshan reference model.
7. Return ONLY the finished cheat sheet text, starting with "OAKS WEDDING".`;

              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                  systemInstruction: systemPrompt || undefined,
                  temperature: 0.5,
                },
              });

              const text = response.text || '';
              res.statusCode = 200;
              res.end(JSON.stringify({ cheatSheet: text }));
            } catch (err: any) {
              console.error('Error generating cheat sheet with Gemini:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err?.message || 'Failed to generate cheat sheet' }));
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
