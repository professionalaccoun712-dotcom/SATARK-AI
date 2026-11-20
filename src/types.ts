export type LanguageCode = 'en-IN' | 'hi' | 'bn' | 'mr' | 'te' | 'ta';

export type LanguageSelection = 'auto' | LanguageCode;

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';

export type ScamCategory =
  | 'authority_impersonation'
  | 'otp_kyc_phishing'
  | 'upi_payment_trap'
  | 'parcel_customs_extortion'
  | 'job_investment_scam'
  | 'tech_support_remote_access'
  | 'romance_social_engineering'
  | 'safe_or_routine';

export interface TacticMatch {
  tactic: string;
  evidence: string;
  explanation: string;
}

export interface ScamAnalysis {
  detectedLanguage: LanguageCode;
  detectedProblem: string;
  category: ScamCategory;
  riskScore: number;
  severity: SeverityLevel;
  summary: string;
  tactics: TacticMatch[];
  immediateSteps: string[];
  whatToSayScript: string;
  verificationQuestions: string[];
  spokenReplyScript: string;
}

export interface AlertRecord {
  id: string;
  inputMode: 'text' | 'voice' | 'image';
  redactedExcerpt: string;
  detectedLanguage: LanguageCode;
  detectedProblem: string;
  category: ScamCategory;
  riskScore: number;
  severity: SeverityLevel;
  summary: string;
  immediateSteps: string[];
  whatToSayScript: string;
  tactics: TacticMatch[];
  verificationQuestions: string[];
  closed: boolean;
  createdAt: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export interface FollowUpReply {
  answer: string;
  detectedLanguage: LanguageCode;
  audioBase64?: string;
  audioMimeType?: string;
}
