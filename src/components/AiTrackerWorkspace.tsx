import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Check,
  Copy,
  ImagePlus,
  MessageSquare,
  Mic,
  PhoneCall,
  Send,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  getLanguageLabel,
  SAMPLE_SCENARIOS,
  SUPPORTED_LANGUAGES,
  type UIStrings,
} from '../i18n/translations.ts';
import type {
  AlertRecord,
  FollowUpReply,
  LanguageSelection,
  ScamAnalysis,
  SeverityLevel,
} from '../types.ts';

interface AiTrackerWorkspaceProps {
  strings: UIStrings;
  selectedLanguage: LanguageSelection;
  onSelectLanguage: (lang: LanguageSelection) => void;
  onAlertCreated: (alert: AlertRecord) => void;
}

type InputMode = 'text' | 'voice' | 'image';

interface FollowUpEntry {
  id: string;
  question: string;
  answer: string;
  audioUrl?: string;
}

function getSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded media.'));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function severityMeta(severity: SeverityLevel): { label: string; textClass: string; barClass: string } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical Threat', textClass: 'text-[#991B1B]', barClass: 'bg-[#DC2626]' };
    case 'high':
      return { label: 'High Risk', textClass: 'text-[#B91C1C]', barClass: 'bg-[#EF4444]' };
    case 'moderate':
      return { label: 'Caution Advised', textClass: 'text-[#B45309]', barClass: 'bg-[#D97706]' };
    case 'low':
      return { label: 'Low Risk / Routine', textClass: 'text-[#15803D]', barClass: 'bg-[#16A34A]' };
  }
}

export function AiTrackerWorkspace({
  strings,
  selectedLanguage,
  onSelectLanguage,
  onAlertCreated,
}: AiTrackerWorkspaceProps) {
  const [mode, setMode] = useState<InputMode>('text');
  const [statement, setStatement] = useState('');
  const [imageNote, setImageNote] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<ScamAnalysis | null>(null);
  const [lastMode, setLastMode] = useState<InputMode | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [replyAudioUrl, setReplyAudioUrl] = useState<string | null>(null);
  const [ttsWarning, setTtsWarning] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(18).fill(12));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Follow-up state
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpRecording, setFollowUpRecording] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpEntry[]>([]);
  const followUpRecorderRef = useRef<MediaRecorder | null>(null);
  const followUpChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (replyAudioUrl) URL.revokeObjectURL(replyAudioUrl);
      stopMediaTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMediaTracks() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function resetPreviousReplyAudio(nextUrl: string | null) {
    setReplyAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }

  async function handleTextAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!statement.trim()) return;
    setError(null);
    setTtsWarning(null);
    setLoading(true);
    setFollowUps([]);
    resetPreviousReplyAudio(null);

    try {
      const res = await fetch('/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: statement,
          languageHint: selectedLanguage,
        }),
      });
      const data = (await res.json()) as {
        analysis?: ScamAnalysis;
        alert?: AlertRecord;
        error?: string;
      };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Could not analyze statement.');
      }
      setAnalysis(data.analysis);
      setLastMode('text');
      setVoiceTranscript(null);
      if (data.alert) onAlertCreated(data.alert);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze text right now.');
    } finally {
      setLoading(false);
    }
  }

  async function startVoiceRecording() {
    setError(null);
    setTtsWarning(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars = Array.from({ length: 18 }, (_, i) => {
          const val = dataArray[i % dataArray.length] || 0;
          return Math.max(12, Math.min(100, Math.round((val / 255) * 100)));
        });
        setLevels(bars);
        rafRef.current = window.requestAnimationFrame(updateBars);
      };
      rafRef.current = window.requestAnimationFrame(updateBars);

      const mime = getSupportedAudioMime();
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }
      );
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        stopMediaTracks();
        setIsRecording(false);
        setLevels(Array(18).fill(12));

        if (blob.size < 600) {
          setError('Recording was too short. Please hold or speak for at least 2 seconds.');
          return;
        }
        await submitVoiceBlob(blob, finalMime);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 89) {
            recorder.stop();
            return 90;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      stopMediaTracks();
      setIsRecording(false);
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow microphone permission in your browser bar and try again.'
          : 'Could not access microphone.'
      );
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  async function submitVoiceBlob(blob: Blob, mimeType: string) {
    setLoading(true);
    setError(null);
    setTtsWarning(null);
    setFollowUps([]);
    resetPreviousReplyAudio(null);

    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch('/api/analyze-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          languageHint: selectedLanguage,
        }),
      });
      const data = (await res.json()) as {
        transcript?: string;
        analysis?: ScamAnalysis;
        audioBase64?: string;
        audioMimeType?: string;
        ttsError?: string;
        alert?: AlertRecord;
        error?: string;
      };

      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Voice analysis failed.');
      }

      setVoiceTranscript(data.transcript || null);
      setAnalysis(data.analysis);
      setLastMode('voice');
      if (data.audioBase64) {
        const url = base64ToBlobUrl(data.audioBase64, data.audioMimeType || 'audio/wav');
        resetPreviousReplyAudio(url);
      }
      if (data.ttsError) {
        setTtsWarning(data.ttsError);
      }
      if (data.alert) onAlertCreated(data.alert);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process voice recording.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImagePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select a PNG, JPG, or WebP screenshot.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is larger than 5 MB. Please choose a smaller screenshot.');
      return;
    }
    const base64 = await blobToBase64(file);
    setImagePayload({ base64, mimeType: file.type, name: file.name });
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleImageAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!imagePayload) return;
    setLoading(true);
    setError(null);
    setTtsWarning(null);
    setFollowUps([]);
    resetPreviousReplyAudio(null);

    try {
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePayload.base64,
          mimeType: imagePayload.mimeType,
          note: imageNote,
          languageHint: selectedLanguage,
        }),
      });
      const data = (await res.json()) as {
        analysis?: ScamAnalysis;
        alert?: AlertRecord;
        error?: string;
      };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Could not inspect screenshot.');
      }
      setAnalysis(data.analysis);
      setLastMode('image');
      setVoiceTranscript(null);
      if (data.alert) onAlertCreated(data.alert);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screenshot inspection failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleListenOnDemand() {
    if (!analysis) return;
    setTtsLoading(true);
    setTtsWarning(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysis.spokenReplyScript || analysis.summary,
          language: analysis.detectedLanguage,
        }),
      });
      const data = (await res.json()) as { audioBase64?: string; mimeType?: string; error?: string };
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Unable to generate speech.');
      }
      const url = base64ToBlobUrl(data.audioBase64, data.mimeType || 'audio/wav');
      resetPreviousReplyAudio(url);
    } catch (err) {
      setTtsWarning(err instanceof Error ? err.message : 'Speech synthesis unavailable.');
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleTextFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!analysis || !followUpInput.trim()) return;
    const question = followUpInput.trim();
    setFollowUpInput('');
    setFollowUpLoading(true);

    try {
      const res = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementSummary: analysis.summary,
          detectedProblem: analysis.detectedProblem,
          language: analysis.detectedLanguage,
          question,
        }),
      });
      const data = (await res.json()) as FollowUpReply & { error?: string };
      if (!res.ok || !data.answer) {
        throw new Error(data.error || 'Failed to answer follow-up.');
      }
      setFollowUps((prev) => [
        ...prev,
        { id: `${Date.now()}`, question, answer: data.answer },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send follow-up.');
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function toggleFollowUpVoice() {
    if (!analysis) return;

    if (followUpRecording) {
      followUpRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getSupportedAudioMime();
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }
      );
      followUpChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) followUpChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setFollowUpRecording(false);
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(followUpChunksRef.current, { type: finalMime });
        if (blob.size < 500) return;
        setFollowUpLoading(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch('/api/followup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              statementSummary: analysis.summary,
              detectedProblem: analysis.detectedProblem,
              language: analysis.detectedLanguage,
              audioBase64,
              mimeType: finalMime,
            }),
          });
          const data = (await res.json()) as FollowUpReply & {
            questionTranscript?: string;
            error?: string;
          };
          if (!res.ok || !data.answer) {
            throw new Error(data.error || 'Voice follow-up failed.');
          }
          const audioUrl = data.audioBase64
            ? base64ToBlobUrl(data.audioBase64, data.audioMimeType || 'audio/wav')
            : undefined;
          setFollowUps((prev) => [
            ...prev,
            {
              id: `${Date.now()}`,
              question: data.questionTranscript || 'Voice follow-up',
              answer: data.answer,
              audioUrl,
            },
          ]);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Voice follow-up failed.');
        } finally {
          setFollowUpLoading(false);
        }
      };

      followUpRecorderRef.current = recorder;
      recorder.start();
      setFollowUpRecording(true);
    } catch {
      setError('Allow microphone permission to ask a follow-up by voice.');
    }
  }

  function handleCopyScript(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2000);
    });
  }

  const meta = analysis ? severityMeta(analysis.severity) : null;

  return (
    <section id="tracker" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-[#E3E5DF] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#111C19] sm:text-3xl">
            {strings.trackerTitle}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#525E59]">
            {strings.trackerSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="tracker-lang-select" className="text-xs font-medium text-[#525E59]">
            {strings.responseLangLabel}
          </label>
          <select
            id="tracker-lang-select"
            value={selectedLanguage}
            onChange={(e) => onSelectLanguage(e.target.value as LanguageSelection)}
            className="rounded-lg border border-[#D4D8D0] bg-white px-3 py-2 text-xs font-medium text-[#111C19] focus:border-[#1B4332] focus:outline-none"
          >
            <option value="auto">{strings.autoDetectLabel}</option>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} — {lang.englishName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Input Workbench */}
        <div className="lg:col-span-5 space-y-6">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#EAECE6] p-1">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'text' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59] hover:text-[#111C19]'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{strings.modeText}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('voice')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'voice' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59] hover:text-[#111C19]'
              }`}
            >
              <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{strings.modeVoice}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('image')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'image' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59] hover:text-[#111C19]'
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{strings.modeImage}</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#E3E5DF] bg-white p-5 sm:p-6">
            {mode === 'text' && (
              <form onSubmit={handleTextAnalyze} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="statement-input" className="text-xs font-semibold text-[#34403B]">
                      {strings.modeText}
                    </label>
                    <span className="font-mono text-[11px] text-[#6B7772] tabular-nums">
                      {statement.length}/3000
                    </span>
                  </div>
                  <textarea
                    id="statement-input"
                    rows={6}
                    maxLength={3000}
                    required
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    placeholder={strings.textPlaceholder}
                    className="mt-2 w-full rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] p-3.5 text-sm leading-relaxed text-[#111C19] placeholder:text-[#7D8782] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || statement.trim().length < 6}
                  className="w-full rounded-lg bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#143326] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? strings.analyzingBtn : strings.analyzeTextBtn}
                </button>

                <div className="border-t border-[#E8EAE4] pt-4">
                  <p className="text-xs font-medium text-[#525E59]">{strings.samplesHeading}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {SAMPLE_SCENARIOS.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          setStatement(sample.statement);
                          setError(null);
                        }}
                        className="rounded-md border border-[#DCE0D8] bg-[#F7F8F5] px-2.5 py-1.5 text-xs font-medium text-[#2A3732] transition-colors hover:border-[#1B4332] hover:bg-white cursor-pointer"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            )}

            {mode === 'voice' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-base font-semibold text-[#111C19]">
                    {strings.voicePromptTitle}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#525E59]">
                    {strings.voicePromptHint}
                  </p>
                </div>

                <div className="rounded-lg border border-[#E3E5DF] bg-[#F7F8F5] p-5 text-center">
                  <div className="mx-auto flex h-14 items-end justify-center gap-1" aria-hidden="true">
                    {levels.map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${isRecording ? lvl : 14}%` }}
                        className={`w-1.5 rounded-sm transition-all duration-75 ${
                          isRecording ? 'bg-[#1B4332]' : 'bg-[#C9D0C8]'
                        }`}
                      />
                    ))}
                  </div>

                  <p className="mt-4 font-mono text-sm font-medium text-[#111C19] tabular-nums">
                    {formatTimer(recordSeconds)} / 01:30
                  </p>

                  <div className="mt-4 flex justify-center">
                    {!isRecording ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={startVoiceRecording}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#1B4332] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#143326] disabled:opacity-50 cursor-pointer"
                      >
                        <Mic className="h-4 w-4" aria-hidden="true" />
                        <span>{loading ? strings.processingVoice : strings.startRecordingBtn}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopVoiceRecording}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#991B1B] cursor-pointer"
                      >
                        <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                        <span>{strings.stopRecordingBtn}</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-[#525E59]">
                  Hindi · Indian English · Bengali · Marathi · Telugu · Tamil
                </p>
              </div>
            )}

            {mode === 'image' && (
              <form onSubmit={handleImageAnalyze} className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#34403B]">{strings.imagePromptTitle}</p>
                  <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#BFC6BD] bg-[#FAFBF9] p-6 text-center transition-colors hover:border-[#1B4332] hover:bg-white">
                    <Upload className="h-6 w-6 text-[#1B4332]" aria-hidden="true" />
                    <span className="mt-2 text-xs font-medium text-[#111C19]">
                      {imagePayload ? imagePayload.name : 'Choose PNG, JPG, or WebP (max 5 MB)'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImagePick}
                      className="sr-only"
                    />
                  </label>
                </div>

                {imagePreview && (
                  <div className="overflow-hidden rounded-lg border border-[#E3E5DF] bg-[#F3F4F0]">
                    <img
                      src={imagePreview}
                      alt="Uploaded notice or screenshot preview"
                      className="max-h-56 w-full object-contain"
                    />
                  </div>
                )}

                <input
                  type="text"
                  maxLength={400}
                  value={imageNote}
                  onChange={(e) => setImageNote(e.target.value)}
                  placeholder={strings.imageNotePlaceholder}
                  className="w-full rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] px-3.5 py-2.5 text-sm text-[#111C19] placeholder:text-[#7D8782] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={loading || !imagePayload}
                  className="w-full rounded-lg bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#143326] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? strings.analyzingBtn : strings.analyzeImageBtn}
                </button>
              </form>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-xs leading-relaxed text-[#991B1B]"
              >
                {error}
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-[#6B7772]">{strings.privacyNote}</p>
          </div>
        </div>

        {/* Right AI Diagnosis & Guidance Panel */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="rounded-xl border border-[#E3E5DF] bg-white p-8">
              <div className="h-4 w-40 animate-pulse rounded bg-[#E6E9E2]" />
              <div className="mt-4 h-8 w-3/4 animate-pulse rounded bg-[#ECEEE8]" />
              <div className="mt-3 h-20 w-full animate-pulse rounded bg-[#F3F5F0]" />
              <p className="mt-4 text-xs text-[#525E59]">
                {mode === 'voice' ? strings.processingVoice : strings.analyzingBtn}
              </p>
            </div>
          ) : !analysis ? (
            <div className="flex h-full min-h-[380px] flex-col justify-between rounded-xl border border-[#E3E5DF] bg-white p-6 sm:p-8">
              <div>
                <p className="text-xs font-medium text-[#525E59]">
                  6 Languages · Voice & Text Matched Response
                </p>
                <h3 className="mt-2 font-display text-xl font-bold text-[#111C19]">
                  Real statement diagnosis, not just keyword matching.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#434E4A]">
                  Explain what the caller is asking — even in mixed Hindi-English, Bengali, Marathi,
                  Telugu, or Tamil. Satark identifies the exact scam pattern from the context and
                  gives clear next steps in the same language.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 border-t border-[#E8EAE4] pt-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-[#111C19]">Voice Input → Voice + Text</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#525E59]">
                    Record your voice in any supported language to receive spoken audio advice plus a
                    written action plan.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#111C19]">Text Input → Text Plan</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#525E59]">
                    Paste a message or statement to receive immediate written analysis in the exact
                    language used.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#E3E5DF] bg-white p-6 sm:p-8 space-y-6">
              {/* Header & Metadata (No pills) */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${meta?.textClass}`}>
                    {meta?.label} · Risk {analysis.riskScore}/100
                  </span>
                  <span className="text-[#525E59] tabular-nums">
                    {getLanguageLabel(analysis.detectedLanguage)} ·{' '}
                    {lastMode === 'voice'
                      ? 'Voice Reply'
                      : lastMode === 'image'
                        ? 'Image Check'
                        : 'Text Reply'}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#111C19]">
                  {analysis.detectedProblem}
                </h3>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#ECEEE8]">
                  <div
                    className={`h-full transition-all duration-300 ${meta?.barClass}`}
                    style={{ width: `${Math.max(6, analysis.riskScore)}%` }}
                  />
                </div>

                <p className="mt-4 text-sm leading-relaxed text-[#2A3732]">{analysis.summary}</p>
              </div>

              {/* Voice Transcript + Audio Player */}
              {voiceTranscript && (
                <div className="border-t border-[#E8EAE4] pt-5">
                  <p className="text-xs font-semibold text-[#525E59]">{strings.transcriptTitle}</p>
                  <p className="mt-1.5 text-sm italic leading-relaxed text-[#2A3732]">
                    “{voiceTranscript}”
                  </p>
                </div>
              )}

              {replyAudioUrl ? (
                <div className="rounded-lg border border-[#D4DDD4] bg-[#F3F7F4] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[#1B4332]">
                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                      <span>{strings.spokenReplyTitle}</span>
                    </span>
                    <span className="text-[11px] text-[#525E59]">
                      {getLanguageLabel(analysis.detectedLanguage)}
                    </span>
                  </div>
                  <audio controls autoPlay src={replyAudioUrl} className="mt-3 w-full" />
                  <p className="mt-2 text-xs leading-relaxed text-[#434E4A]">
                    {analysis.spokenReplyScript}
                  </p>
                </div>
              ) : (
                lastMode === 'text' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EAE4] pt-4">
                    <button
                      type="button"
                      disabled={ttsLoading}
                      onClick={handleListenOnDemand}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#D4D8D0] bg-white px-3.5 py-2 text-xs font-medium text-[#111C19] hover:bg-[#F3F4F0] disabled:opacity-50 cursor-pointer"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-[#1B4332]" aria-hidden="true" />
                      <span>{ttsLoading ? 'Preparing audio...' : strings.listenBtn}</span>
                    </button>
                    {analysis.riskScore >= 55 && (
                      <a
                        href="tel:1930"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] hover:underline"
                      >
                        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{strings.ctaHelpline}</span>
                      </a>
                    )}
                  </div>
                )
              )}

              {ttsWarning && (
                <p className="text-xs text-[#B45309]">Audio playback unavailable: {ttsWarning}</p>
              )}

              {/* Tactics Spotted */}
              {analysis.tactics.length > 0 && (
                <div className="border-t border-[#E8EAE4] pt-5">
                  <h4 className="font-display text-sm font-semibold text-[#111C19]">
                    {strings.resultTacticsTitle}
                  </h4>
                  <div className="mt-3 divide-y divide-[#EFF1EC]">
                    {analysis.tactics.map((item, idx) => (
                      <div key={idx} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-xs font-semibold text-[#111C19]">{item.tactic}</p>
                        {item.evidence && (
                          <p className="mt-1 text-xs italic text-[#525E59]">“{item.evidence}”</p>
                        )}
                        <p className="mt-1 text-xs leading-relaxed text-[#434E4A]">
                          {item.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Immediate Steps */}
              {analysis.immediateSteps.length > 0 && (
                <div className="border-t border-[#E8EAE4] pt-5">
                  <h4 className="font-display text-sm font-semibold text-[#111C19]">
                    {strings.resultStepsTitle}
                  </h4>
                  <ol className="mt-3 space-y-2.5">
                    {analysis.immediateSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed text-[#2A3732]">
                        <span className="font-mono text-xs font-semibold text-[#1B4332] pt-0.5 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* What to Say Script */}
              {analysis.whatToSayScript && (
                <div className="border-t border-[#E8EAE4] pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold text-[#111C19]">
                      {strings.resultSayTitle}
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleCopyScript(analysis.whatToSayScript)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B4332] hover:underline cursor-pointer"
                    >
                      {copiedScript ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{strings.copiedBtn}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{strings.copyBtn}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-2 rounded-lg bg-[#F7F8F5] px-4 py-3 text-sm font-medium leading-relaxed text-[#111C19]">
                    “{analysis.whatToSayScript}”
                  </p>
                </div>
              )}

              {/* Contextual Follow-Up Q&A */}
              <div className="border-t border-[#E8EAE4] pt-5">
                <h4 className="font-display text-sm font-semibold text-[#111C19]">
                  {strings.followUpTitle}
                </h4>

                {followUps.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {followUps.map((f) => (
                      <div key={f.id} className="rounded-lg bg-[#F7F8F5] p-3.5 space-y-2">
                        <p className="text-xs font-semibold text-[#525E59]">Q: {f.question}</p>
                        <p className="text-sm leading-relaxed text-[#111C19]">{f.answer}</p>
                        {f.audioUrl && <audio controls autoPlay src={f.audioUrl} className="mt-2 w-full" />}
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleTextFollowUp} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    placeholder={strings.followUpPlaceholder}
                    className="flex-1 rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] px-3.5 py-2.5 text-sm text-[#111C19] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="submit"
                      disabled={followUpLoading || !followUpInput.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4332] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#143326] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{strings.followUpSendBtn}</span>
                    </button>
                    <button
                      type="button"
                      disabled={followUpLoading}
                      onClick={toggleFollowUpVoice}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        followUpRecording
                          ? 'bg-[#B91C1C] text-white'
                          : 'border border-[#D4D8D0] bg-white text-[#111C19] hover:bg-[#F3F4F0]'
                      }`}
                    >
                      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{followUpRecording ? 'Stop' : strings.followUpVoiceBtn}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
