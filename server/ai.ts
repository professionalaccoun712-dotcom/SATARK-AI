import { GoogleGenAI, Type } from '@google/genai';
import type {
  FollowUpReply,
  LanguageCode,
  LanguageSelection,
  ScamAnalysis,
  ScamCategory,
  SeverityLevel,
} from '../src/types.ts';

const VALID_LANGUAGES: LanguageCode[] = ['en-IN', 'hi', 'bn', 'mr', 'te', 'ta'];

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  'en-IN': 'Indian English',
  hi: 'Hindi (Devanagari script, natural everyday Hindi)',
  bn: 'Bengali (Bengali script, natural everyday Bangla)',
  mr: 'Marathi (Devanagari script, natural everyday Marathi)',
  te: 'Telugu (Telugu script, natural everyday Telugu)',
  ta: 'Tamil (Tamil script, natural everyday Tamil)',
};

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in Settings > Secrets to enable AI statement and voice analysis.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function redactPII(input: string): string {
  return input
    // Mask 12-digit Aadhaar-like numbers
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED_ID]')
    // Mask PAN numbers
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[REDACTED_PAN]')
    // Mask Indian 10-digit mobile numbers (with optional +91 / 0)
    .replace(/(?:\+91[\s-]?|0)?\b[6-9]\d{9}\b/g, '[REDACTED_PHONE]')
    // Mask 4-8 digit OTPs when near OTP/PIN/code words
    .replace(/\b(otp|pin|code|cvv|passcode)\s*(?:is|:|=|-)?\s*(\d{4,8})\b/gi, '$1 [REDACTED_CODE]')
    // Mask 9-18 digit bank account numbers
    .replace(/\b\d{9,18}\b/g, '[REDACTED_NUMBER]');
}

function normalizeLanguage(code: string | undefined, fallback: LanguageCode = 'en-IN'): LanguageCode {
  if (!code) return fallback;
  const cleaned = code.trim();
  if (VALID_LANGUAGES.includes(cleaned as LanguageCode)) {
    return cleaned as LanguageCode;
  }
  const lower = cleaned.toLowerCase();
  if (lower.startsWith('hi')) return 'hi';
  if (lower.startsWith('bn') || lower.includes('bengali') || lower.includes('bangla')) return 'bn';
  if (lower.startsWith('mr') || lower.includes('marathi')) return 'mr';
  if (lower.startsWith('te') || lower.includes('telugu')) return 'te';
  if (lower.startsWith('ta') || lower.includes('tamil')) return 'ta';
  if (lower.startsWith('en')) return 'en-IN';
  return fallback;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedLanguage: {
      type: Type.STRING,
      description:
        "Detected or requested language code. MUST be exactly one of: 'en-IN', 'hi', 'bn', 'mr', 'te', 'ta'.",
    },
    detectedProblem: {
      type: Type.STRING,
      description:
        'Concise, plain-language diagnosis of the specific problem or scam pattern detected directly from the statement, written in the target language.',
    },
    category: {
      type: Type.STRING,
      description:
        "Category identifier. MUST be one of: 'authority_impersonation', 'otp_kyc_phishing', 'upi_payment_trap', 'parcel_customs_extortion', 'job_investment_scam', 'tech_support_remote_access', 'romance_social_engineering', 'safe_or_routine'.",
    },
    riskScore: {
      type: Type.INTEGER,
      description: 'Risk score from 0 (completely safe routine communication) to 100 (unmistakable active scam coercion).',
    },
    severity: {
      type: Type.STRING,
      description: "Severity level. MUST be one of: 'critical', 'high', 'moderate', 'low'.",
    },
    summary: {
      type: Type.STRING,
      description:
        'Calm, clear 2-3 sentence explanation in the target language telling the person what is actually happening and why.',
    },
    tactics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tactic: {
            type: Type.STRING,
            description: 'Name of the psychological or technical tactic spotted, in the target language.',
          },
          evidence: {
            type: Type.STRING,
            description: 'Short exact quote or paraphrase from the user statement showing this tactic.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Brief plain-language explanation of why this is a red flag (or safe cue), in the target language.',
          },
        },
        required: ['tactic', 'evidence', 'explanation'],
      },
      description: 'Up to 4 specific tactics or verification signals found in the statement.',
    },
    immediateSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 4 concrete, ordered actions the user should take right now, in the target language.',
    },
    whatToSayScript: {
      type: Type.STRING,
      description:
        'A calm, firm 1-2 sentence reply the person can read out loud or send to disengage safely, in the target language.',
    },
    verificationQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 3 independent checks the person can do themselves (never using caller-provided numbers), in the target language.',
    },
    spokenReplyScript: {
      type: Type.STRING,
      description:
        'A warm, steady, natural 3-sentence spoken response designed to be read aloud as voice guidance in the exact target language. Clear, calm, reassuring tone; avoid markdown, bullet symbols, or URLs.',
    },
  },
  required: [
    'detectedLanguage',
    'detectedProblem',
    'category',
    'riskScore',
    'severity',
    'summary',
    'tactics',
    'immediateSteps',
    'whatToSayScript',
    'verificationQuestions',
    'spokenReplyScript',
  ],
};

function sanitizeAnalysis(raw: Partial<ScamAnalysis>, fallbackLang: LanguageCode): ScamAnalysis {
  const validCategories: ScamCategory[] = [
    'authority_impersonation',
    'otp_kyc_phishing',
    'upi_payment_trap',
    'parcel_customs_extortion',
    'job_investment_scam',
    'tech_support_remote_access',
    'romance_social_engineering',
    'safe_or_routine',
  ];
  const validSeverities: SeverityLevel[] = ['critical', 'high', 'moderate', 'low'];

  const detectedLanguage = normalizeLanguage(raw.detectedLanguage, fallbackLang);
  const riskScore = Math.max(0, Math.min(100, Math.round(Number(raw.riskScore ?? 50))));
  const category = validCategories.includes(raw.category as ScamCategory)
    ? (raw.category as ScamCategory)
    : 'safe_or_routine';
  const severity = validSeverities.includes(raw.severity as SeverityLevel)
    ? (raw.severity as SeverityLevel)
    : riskScore >= 75
      ? 'critical'
      : riskScore >= 55
        ? 'high'
        : riskScore >= 30
          ? 'moderate'
          : 'low';

  return {
    detectedLanguage,
    detectedProblem: raw.detectedProblem || 'Statement review complete',
    category,
    riskScore,
    severity,
    summary: raw.summary || 'Review the warning signs carefully and verify independently before acting.',
    tactics: Array.isArray(raw.tactics) ? raw.tactics.slice(0, 4) : [],
    immediateSteps: Array.isArray(raw.immediateSteps) ? raw.immediateSteps.slice(0, 5) : [],
    whatToSayScript: raw.whatToSayScript || '',
    verificationQuestions: Array.isArray(raw.verificationQuestions) ? raw.verificationQuestions.slice(0, 4) : [],
    spokenReplyScript: raw.spokenReplyScript || raw.summary || '',
  };
}

function buildAnalysisInstruction(languageHint: LanguageSelection): string {
  const languageRule =
    languageHint === 'auto'
      ? `Detect the primary language of the user's statement from these 6 supported Indian languages:
- 'hi' (Hindi, including Hinglish / Romanized Hindi)
- 'en-IN' (Indian English)
- 'bn' (Bengali, including Romanized Bangla)
- 'mr' (Marathi, including Romanized Marathi)
- 'te' (Telugu, including Romanized Telugu)
- 'ta' (Tamil, including Romanized Tamil)
Set 'detectedLanguage' to the exact matching code and write ALL text fields in that language using its natural native script (or natural Indian English for 'en-IN').`
      : `The user selected output language '${languageHint}' (${LANGUAGE_LABELS[languageHint]}). Set 'detectedLanguage' to '${languageHint}' and write ALL text fields naturally in ${LANGUAGE_LABELS[languageHint]}.`;

  return `You are Satark Live Guard, an expert Indian anti-fraud and personal safety advisor.
Your job is to diagnose the exact problem from the user's statement ALONE — even if the caller never uses obvious scam keywords, speaks politely, uses code-mixed Indian languages (Hinglish, Tanglish, Benglish, etc.), or describes the situation indirectly ("my father just got a call saying his parcel has drugs and he must stay on Skype").

${languageRule}

Indian scam intelligence you understand deeply:
- "Digital Arrest" / CBI / ED / NCB / Mumbai Police / Cyber Crime / TRAI SIM disconnection / Aadhaar misuse threats demanding Skype/WhatsApp video stay-on-line or "verification" transfers.
- FedEx / DHL / India Post customs parcel extortion scams.
- Bank KYC expiry / PAN update / APK download / screen-sharing (AnyDesk, TeamViewer, QuickSupport) / OTP or CVV requests.
- UPI "receive money by entering PIN" / QR scan / OLX buyer trap / electricity bill disconnection threats.
- Part-time YouTube/Telegram rating task scams, stock-tip VIP groups, fake loan apps.
- Genuine/safe communications (e.g., official bank alert reminding you NOT to share OTP, asking you to verify in the official app yourself, normal delivery OTP when you ordered a package). Never falsely label clearly safe advice as critical scam!

Guidance rules:
1. Be calm, reassuring, grounded, and practical — someone reading this may be panicked.
2. Never tell the user to transfer money, share an OTP, or call a number provided inside the suspicious message.
3. For critical/high scams in India, mention calling National Cyber Helpline 1930 or reporting on cybercrime.gov.in as part of immediateSteps when money/credentials are at risk.
4. Make 'spokenReplyScript' sound like a calm human advisor speaking directly to the listener in 2-4 clear sentences in the target language.`;
}

export async function analyzeTextStatement(params: {
  text: string;
  languageHint: LanguageSelection;
}): Promise<ScamAnalysis> {
  const ai = getClient();
  const fallbackLang: LanguageCode = params.languageHint === 'auto' ? 'en-IN' : params.languageHint;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this statement described by the user:\n\n"""\n${params.text.trim()}\n"""`,
    config: {
      systemInstruction: buildAnalysisInstruction(params.languageHint),
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA,
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('The AI analyzer returned an empty response. Please try again.');
  }
  const parsed = JSON.parse(rawText) as Partial<ScamAnalysis>;
  return sanitizeAnalysis(parsed, fallbackLang);
}

export async function transcribeAudioStatement(params: {
  audioBase64: string;
  mimeType: string;
  languageHint: LanguageSelection;
}): Promise<string> {
  const ai = getClient();
  const hintNote =
    params.languageHint === 'auto'
      ? 'The speaker may speak in Hindi, Indian English, Bengali, Marathi, Telugu, Tamil, or code-mixed speech (such as Hinglish).'
      : `The speaker is likely speaking in ${LANGUAGE_LABELS[params.languageHint]}.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.audioBase64,
          },
        },
        {
          text: `Transcribe the spoken audio accurately verbatim. ${hintNote} Preserve the natural language spoken (use native script for Hindi/Bengali/Marathi/Telugu/Tamil when clearly spoken in that language, or English for English words). Return ONLY the transcript text with no commentary.`,
        },
      ],
    },
  });

  const transcript = (response.text ?? '').trim();
  if (!transcript) {
    throw new Error(
      'Could not hear clear speech in the recording. Please speak closer to the microphone and try again.'
    );
  }
  return transcript;
}

export async function synthesizeGuidanceAudio(params: {
  text: string;
  language: LanguageCode;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: `Calm, warm, reassuring safety advisor speaking clearly in ${LANGUAGE_LABELS[params.language]}`,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    throw new Error('Speech synthesis did not return audio data.');
  }

  return {
    audioBase64: inlineData.data,
    mimeType: inlineData.mimeType || 'audio/wav',
  };
}

export async function analyzeImageNotice(params: {
  imageBase64: string;
  mimeType: string;
  note: string;
  languageHint: LanguageSelection;
}): Promise<ScamAnalysis> {
  const ai = getClient();
  const fallbackLang: LanguageCode = params.languageHint === 'auto' ? 'en-IN' : params.languageHint;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.imageBase64,
          },
        },
        {
          text: `Inspect this screenshot, notice, QR payment request, or message image for scam pressure tactics, impersonation, fake legal stamps/letterheads, phishing links, or credential traps.${
            params.note.trim() ? `\n\nUser note: "${params.note.trim()}"` : ''
          }`,
        },
      ],
    },
    config: {
      systemInstruction: buildAnalysisInstruction(params.languageHint),
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA,
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Image analysis returned an empty response. Please try again.');
  }
  const parsed = JSON.parse(rawText) as Partial<ScamAnalysis>;
  return sanitizeAnalysis(parsed, fallbackLang);
}

export async function answerFollowUp(params: {
  statementSummary: string;
  detectedProblem: string;
  language: LanguageCode;
  question: string;
  includeAudio: boolean;
}): Promise<FollowUpReply> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Original situation: ${params.detectedProblem} — ${params.statementSummary}

User follow-up question: "${params.question.trim()}"`,
    config: {
      systemInstruction: `You are Satark Live Guard, a calm Indian anti-scam advisor.
Answer the user's follow-up question directly, calmly, and practically in ${LANGUAGE_LABELS[params.language]}.
Keep the answer concise (3-5 sentences max), actionable, and never suggest sharing OTPs, PINs, or transferring money to "verify" anything. Do not use markdown formatting.`,
    },
  });

  const answer = (response.text ?? '').trim();
  if (!answer) {
    throw new Error('Could not generate a follow-up answer. Please try again.');
  }

  if (!params.includeAudio) {
    return {
      answer,
      detectedLanguage: params.language,
    };
  }

  const audio = await synthesizeGuidanceAudio({
    text: answer,
    language: params.language,
  });

  return {
    answer,
    detectedLanguage: params.language,
    audioBase64: audio.audioBase64,
    audioMimeType: audio.mimeType,
  };
}
