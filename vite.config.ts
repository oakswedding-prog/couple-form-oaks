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

Please write an emotionally intelligent, concise, beautifully written Editorial Creative Brief (~500–750 words, 3–5 min read) with 7 to 9 dynamically tailored sections strictly grounded in their answers, following your instructions.`;

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

Please generate exactly 11 deeply personalised, open-ended interview/testimonial questions for the couple following the 11-question emotional storytelling journey, along with the INTERVIEW DIRECTION and THE CREATIVE OBJECTIVE. Strictly adhere to your instructions.`;

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
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
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
