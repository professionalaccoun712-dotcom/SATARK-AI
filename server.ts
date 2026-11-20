import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  analyzeImageNotice,
  analyzeTextStatement,
  answerFollowUp,
  redactPII,
  synthesizeGuidanceAudio,
  transcribeAudioStatement,
} from './server/ai.ts';
import {
  addAlert,
  addContact,
  closeAlert,
  createSessionToken,
  deleteAlert,
  deleteContact,
  getUserById,
  listAlerts,
  listContacts,
  loginUser,
  signupUser,
  verifySessionToken,
} from './server/store.ts';
import type { AlertRecord, LanguageCode, LanguageSelection } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

// Security headers (avoid blocking iframe preview in AI Studio while securing MIME/referrer/mic)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  next();
});

// Simple sliding-window rate limiter for AI and auth routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests right now. Please pause for a moment and try again.',
      });
    }
    bucket.count += 1;
    return next();
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function setSessionCookie(res: Response, name: string, value: string, maxAgeSec: number): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    IS_PROD ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.append('Set-Cookie', parts.join('; '));
}

function resolveOwnerId(req: Request, res: Response): { ownerId: string; user: ReturnType<typeof getUserById> } {
  const cookies = parseCookies(req.headers.cookie);
  const tokenUid = verifySessionToken(cookies.satark_session);
  if (tokenUid) {
    const user = getUserById(tokenUid);
    if (user) {
      return { ownerId: user.id, user };
    }
  }

  let guestId = cookies.satark_guest;
  if (!guestId || !/^[a-zA-Z0-9_-]{8,40}$/.test(guestId)) {
    guestId = `guest_${randomBytes(10).toString('hex')}`;
    setSessionCookie(res, 'satark_guest', guestId, 60 * 60 * 24 * 30);
  }
  return { ownerId: guestId, user: null };
}

function parseLanguageHint(value: unknown): LanguageSelection {
  const allowed: LanguageSelection[] = ['auto', 'en-IN', 'hi', 'bn', 'mr', 'te', 'ta'];
  if (typeof value === 'string' && allowed.includes(value as LanguageSelection)) {
    return value as LanguageSelection;
  }
  return 'auto';
}

function makeExcerpt(raw: string): string {
  const masked = redactPII(raw.replace(/\s+/g, ' ').trim());
  return masked.length > 160 ? `${masked.slice(0, 157)}...` : masked;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong while processing your request.';
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

// Session / Auth
app.get('/api/me', (req, res) => {
  const { user } = resolveOwnerId(req, res);
  res.json({ user });
});

app.post('/api/auth/signup', rateLimit(15, 60_000), (req, res) => {
  try {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const user = signupUser(name, email, password);
    const token = createSessionToken(user.id);
    setSessionCookie(res, 'satark_session', token, 60 * 60 * 24 * 14);
    return res.status(201).json({ user });
  } catch (err) {
    return res.status(400).json({ error: extractErrorMessage(err) });
  }
});

app.post('/api/auth/login', rateLimit(20, 60_000), (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const user = loginUser(email, password);
    const token = createSessionToken(user.id);
    setSessionCookie(res, 'satark_session', token, 60 * 60 * 24 * 14);
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: extractErrorMessage(err) });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  setSessionCookie(res, 'satark_session', '', 0);
  res.json({ ok: true });
});

// Text Statement AI Analysis (Text in -> Text out)
app.post('/api/analyze-text', rateLimit(30, 60_000), async (req, res) => {
  try {
    const { ownerId } = resolveOwnerId(req, res);
    const { text, languageHint } = req.body as { text?: string; languageHint?: unknown };
    if (!text || text.trim().length < 6) {
      return res.status(400).json({ error: 'Please enter at least a few words from the call or message.' });
    }
    if (text.length > 3000) {
      return res.status(400).json({ error: 'Statement is too long. Please keep it under 3,000 characters.' });
    }

    const analysis = await analyzeTextStatement({
      text,
      languageHint: parseLanguageHint(languageHint),
    });

    const record: AlertRecord = {
      id: `alt_${randomBytes(6).toString('hex')}`,
      inputMode: 'text',
      redactedExcerpt: makeExcerpt(text),
      detectedLanguage: analysis.detectedLanguage,
      detectedProblem: analysis.detectedProblem,
      category: analysis.category,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      summary: analysis.summary,
      immediateSteps: analysis.immediateSteps,
      whatToSayScript: analysis.whatToSayScript,
      tactics: analysis.tactics,
      verificationQuestions: analysis.verificationQuestions,
      closed: false,
      createdAt: new Date().toISOString(),
    };

    addAlert(ownerId, record);
    return res.json({ analysis, alert: record });
  } catch (err) {
    return res.status(500).json({ error: extractErrorMessage(err) });
  }
});

// Voice Statement AI Analysis (Voice in -> Transcribe + Analyze + Voice & Text out)
app.post('/api/analyze-voice', rateLimit(20, 60_000), async (req, res) => {
  try {
    const { ownerId } = resolveOwnerId(req, res);
    const { audioBase64, mimeType, languageHint } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      languageHint?: unknown;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'No audio recording was received.' });
    }
    if (audioBase64.length > 6_000_000) {
      return res.status(400).json({ error: 'Audio recording is too large. Please keep clips under 90 seconds.' });
    }

    const safeMime = mimeType && mimeType.startsWith('audio/') ? mimeType.split(';')[0] : 'audio/webm';
    const hint = parseLanguageHint(languageHint);

    const transcript = await transcribeAudioStatement({
      audioBase64,
      mimeType: safeMime,
      languageHint: hint,
    });

    const analysis = await analyzeTextStatement({
      text: transcript,
      languageHint: hint,
    });

    let audioReplyBase64: string | undefined;
    let audioReplyMime: string | undefined;
    let ttsError: string | undefined;

    try {
      const tts = await synthesizeGuidanceAudio({
        text: analysis.spokenReplyScript || analysis.summary,
        language: analysis.detectedLanguage,
      });
      audioReplyBase64 = tts.audioBase64;
      audioReplyMime = tts.mimeType;
    } catch (err) {
      ttsError = extractErrorMessage(err);
    }

    const record: AlertRecord = {
      id: `alt_${randomBytes(6).toString('hex')}`,
      inputMode: 'voice',
      redactedExcerpt: makeExcerpt(transcript),
      detectedLanguage: analysis.detectedLanguage,
      detectedProblem: analysis.detectedProblem,
      category: analysis.category,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      summary: analysis.summary,
      immediateSteps: analysis.immediateSteps,
      whatToSayScript: analysis.whatToSayScript,
      tactics: analysis.tactics,
      verificationQuestions: analysis.verificationQuestions,
      closed: false,
      createdAt: new Date().toISOString(),
    };

    addAlert(ownerId, record);
    return res.json({
      transcript: redactPII(transcript),
      analysis,
      audioBase64: audioReplyBase64,
      audioMimeType: audioReplyMime,
      ttsError,
      alert: record,
    });
  } catch (err) {
    return res.status(500).json({ error: extractErrorMessage(err) });
  }
});

// Screenshot / Notice Image AI Analysis
app.post('/api/analyze-image', rateLimit(20, 60_000), async (req, res) => {
  try {
    const { ownerId } = resolveOwnerId(req, res);
    const { imageBase64, mimeType, note, languageHint } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      note?: string;
      languageHint?: unknown;
    };

    if (!imageBase64 || !mimeType || !mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Please upload a valid PNG, JPG, or WebP screenshot.' });
    }
    if (imageBase64.length > 7_000_000) {
      return res.status(400).json({ error: 'Image is too large. Please upload a file under 5 MB.' });
    }

    const analysis = await analyzeImageNotice({
      imageBase64,
      mimeType,
      note: note || '',
      languageHint: parseLanguageHint(languageHint),
    });

    const record: AlertRecord = {
      id: `alt_${randomBytes(6).toString('hex')}`,
      inputMode: 'image',
      redactedExcerpt: makeExcerpt(note ? `Image check: ${note}` : analysis.detectedProblem),
      detectedLanguage: analysis.detectedLanguage,
      detectedProblem: analysis.detectedProblem,
      category: analysis.category,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      summary: analysis.summary,
      immediateSteps: analysis.immediateSteps,
      whatToSayScript: analysis.whatToSayScript,
      tactics: analysis.tactics,
      verificationQuestions: analysis.verificationQuestions,
      closed: false,
      createdAt: new Date().toISOString(),
    };

    addAlert(ownerId, record);
    return res.json({ analysis, alert: record });
  } catch (err) {
    return res.status(500).json({ error: extractErrorMessage(err) });
  }
});

// Contextual Follow-up Question (supports Text-in -> Text-out AND Voice-in -> Voice+Text-out)
app.post('/api/followup', rateLimit(30, 60_000), async (req, res) => {
  try {
    const {
      statementSummary,
      detectedProblem,
      language,
      question,
      audioBase64,
      mimeType,
    } = req.body as {
      statementSummary?: string;
      detectedProblem?: string;
      language?: LanguageCode;
      question?: string;
      audioBase64?: string;
      mimeType?: string;
    };

    const targetLanguage: LanguageCode =
      language && ['en-IN', 'hi', 'bn', 'mr', 'te', 'ta'].includes(language) ? language : 'en-IN';

    let finalQuestion = (question || '').trim();
    let isVoice = false;

    if (audioBase64) {
      isVoice = true;
      const safeMime = mimeType && mimeType.startsWith('audio/') ? mimeType.split(';')[0] : 'audio/webm';
      finalQuestion = await transcribeAudioStatement({
        audioBase64,
        mimeType: safeMime,
        languageHint: targetLanguage,
      });
    }

    if (!finalQuestion) {
      return res.status(400).json({ error: 'Please enter or speak a follow-up question.' });
    }

    const reply = await answerFollowUp({
      statementSummary: statementSummary || '',
      detectedProblem: detectedProblem || 'Suspicious call or message',
      language: targetLanguage,
      question: finalQuestion,
      includeAudio: isVoice,
    });

    return res.json({
      questionTranscript: isVoice ? redactPII(finalQuestion) : finalQuestion,
      ...reply,
    });
  } catch (err) {
    return res.status(500).json({ error: extractErrorMessage(err) });
  }
});

// On-demand TTS for text cards
app.post('/api/tts', rateLimit(25, 60_000), async (req, res) => {
  try {
    const { text, language } = req.body as { text?: string; language?: LanguageCode };
    if (!text || text.trim().length < 2) {
      return res.status(400).json({ error: 'No text provided for speech synthesis.' });
    }
    const targetLanguage: LanguageCode =
      language && ['en-IN', 'hi', 'bn', 'mr', 'te', 'ta'].includes(language) ? language : 'en-IN';
    const audio = await synthesizeGuidanceAudio({ text: text.slice(0, 1200), language: targetLanguage });
    return res.json(audio);
  } catch (err) {
    return res.status(500).json({ error: extractErrorMessage(err) });
  }
});

// Alert History
app.get('/api/alerts', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  res.json({ alerts: listAlerts(ownerId) });
});

app.post('/api/alerts/:id/close', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  const updated = closeAlert(ownerId, req.params.id);
  if (!updated) return res.status(404).json({ error: 'Check record not found.' });
  return res.json({ alert: updated });
});

app.delete('/api/alerts/:id', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  const removed = deleteAlert(ownerId, req.params.id);
  if (!removed) return res.status(404).json({ error: 'Check record not found.' });
  return res.json({ ok: true });
});

// Trusted Guardians
app.get('/api/contacts', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  res.json({ contacts: listContacts(ownerId) });
});

app.post('/api/contacts', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  const { name, phone, relationship } = req.body as {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter the contact name.' });
  }
  if (!phone || phone.replace(/[^+\d]/g, '').length < 6) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }
  const contact = addContact(ownerId, { name, phone, relationship: relationship || '' });
  return res.status(201).json({ contact });
});

app.delete('/api/contacts/:id', (req, res) => {
  const { ownerId } = resolveOwnerId(req, res);
  const removed = deleteContact(ownerId, req.params.id);
  if (!removed) return res.status(404).json({ error: 'Contact not found.' });
  return res.json({ ok: true });
});

// Frontend hosting (Vite in dev, dist/ in production)
async function setupFrontend() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { maxAge: '1y', index: false }));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Satark Live Guard server running on http://0.0.0.0:${PORT}`);
  });
}

setupFrontend();
