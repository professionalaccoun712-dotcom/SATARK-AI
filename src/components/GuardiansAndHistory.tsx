import { useState, type FormEvent } from 'react';
import { PhoneCall, Search, Share2, Trash2 } from 'lucide-react';
import { getLanguageLabel, type UIStrings } from '../i18n/translations.ts';
import type { AlertRecord, TrustedContact } from '../types.ts';

interface GuardiansAndHistoryProps {
  strings: UIStrings;
  contacts: TrustedContact[];
  alerts: AlertRecord[];
  latestProblemSummary: string | null;
  onAddContact: (input: { name: string; phone: string; relationship: string }) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onCloseAlert: (id: string) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
}

export function GuardiansAndHistory({
  strings,
  contacts,
  alerts,
  latestProblemSummary,
  onAddContact,
  onDeleteContact,
  onCloseAlert,
  onDeleteAlert,
}: GuardiansAndHistoryProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [saving, setSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high'>('all');

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setContactError(null);
    setSaving(true);
    try {
      await onAddContact({ name, phone, relationship });
      setName('');
      setPhone('');
      setRelationship('');
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  }

  function buildWhatsAppHref(contactPhone: string): string {
    const digits = contactPhone.replace(/[^\d]/g, '');
    const context = latestProblemSummary
      ? `Satark flagged a suspicious call/message: "${latestProblemSummary}". I am pausing before taking action and calling you to verify.`
      : 'I received a suspicious call or message and want to check with you before taking any action.';
    return `https://wa.me/${digits}?text=${encodeURIComponent(context)}`;
  }

  const filteredAlerts = alerts.filter((a) => {
    const matchesSeverity =
      severityFilter === 'all' || a.severity === 'critical' || a.severity === 'high';
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      a.detectedProblem.toLowerCase().includes(q) ||
      a.redactedExcerpt.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q);
    return matchesSeverity && matchesQuery;
  });

  return (
    <section id="guardians" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 border-t border-[#E3E5DF]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left: Trusted Guardians */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#111C19]">
              {strings.guardiansTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#525E59]">
              {strings.guardiansSubtitle}
            </p>
          </div>

          <div className="rounded-xl border border-[#E3E5DF] bg-white p-5 space-y-5">
            {contacts.length === 0 ? (
              <p className="text-xs leading-relaxed text-[#525E59]">
                No trusted contacts saved yet. Add a family member or close friend below so you can
                call or message them in one tap during a suspicious call.
              </p>
            ) : (
              <div className="divide-y divide-[#EFF1EC]">
                {contacts.map((c) => (
                  <div key={c.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#111C19]">{c.name}</p>
                      <p className="truncate text-xs text-[#525E59] tabular-nums">
                        {c.relationship} · {c.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D4D8D0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111C19] hover:bg-[#F3F4F0]"
                      >
                        <PhoneCall className="h-3 w-3" aria-hidden="true" />
                        <span>{strings.callBtn}</span>
                      </a>
                      <a
                        href={buildWhatsAppHref(c.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-[#1B4332] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#143326]"
                      >
                        <Share2 className="h-3 w-3" aria-hidden="true" />
                        <span>{strings.whatsappAlertBtn}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onDeleteContact(c.id)}
                        aria-label={`Remove ${c.name}`}
                        className="rounded-md p-1.5 text-[#6B7772] hover:bg-[#FEF2F2] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleContactSubmit} className="border-t border-[#E8EAE4] pt-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-[#111C19]">
                {strings.addGuardianTitle}
              </h3>

              {contactError && (
                <p className="text-xs text-[#B91C1C]">{contactError}</p>
              )}

              <div>
                <label htmlFor="guardian-name" className="block text-xs font-medium text-[#34403B]">
                  {strings.nameLabel}
                </label>
                <input
                  id="guardian-name"
                  type="text"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rajesh Verma"
                  className="mt-1 w-full rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="guardian-phone" className="block text-xs font-medium text-[#34403B]">
                    {strings.phoneLabel}
                  </label>
                  <input
                    id="guardian-phone"
                    type="tel"
                    required
                    maxLength={24}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98..."
                    className="mt-1 w-full rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="guardian-rel" className="block text-xs font-medium text-[#34403B]">
                    {strings.relationLabel}
                  </label>
                  <input
                    id="guardian-rel"
                    type="text"
                    maxLength={40}
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    placeholder="Daughter, brother..."
                    className="mt-1 w-full rounded-lg border border-[#D4D8D0] bg-[#FAFBF9] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-[#111C19] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1B4332] disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : strings.saveContactBtn}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Recent Statement Checks */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#111C19]">
                {strings.historyTitle}
              </h2>
              <p className="mt-1 text-xs text-[#525E59] tabular-nums">
                {alerts.length} saved · PII auto-masked
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B7772]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search checks..."
                  className="w-44 rounded-lg border border-[#D4D8D0] bg-white py-1.5 pr-3 pl-8 text-xs text-[#111C19] focus:border-[#1B4332] focus:outline-none"
                />
              </div>

              <div className="flex rounded-lg bg-[#EAECE6] p-0.5">
                <button
                  type="button"
                  onClick={() => setSeverityFilter('all')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                    severityFilter === 'all' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityFilter('high')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                    severityFilter === 'high' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59]'
                  }`}
                >
                  High Risk
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E3E5DF] bg-white p-5">
            {filteredAlerts.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#525E59]">{strings.historyEmpty}</p>
            ) : (
              <div className="divide-y divide-[#EFF1EC]">
                {filteredAlerts.map((alert) => {
                  const isHigh = alert.severity === 'critical' || alert.severity === 'high';
                  return (
                    <div key={alert.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className={`font-semibold ${isHigh ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>
                          {isHigh ? 'High Signal' : 'Reviewed'} · Risk {alert.riskScore}/100 ·{' '}
                          {getLanguageLabel(alert.detectedLanguage)} · {alert.inputMode}
                        </span>
                        <span className="font-mono text-[11px] text-[#6B7772] tabular-nums">
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#111C19]">
                            {alert.detectedProblem}
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-[#525E59]">
                            {alert.redactedExcerpt}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!alert.closed ? (
                            <button
                              type="button"
                              onClick={() => onCloseAlert(alert.id)}
                              className="rounded-md border border-[#D4D8D0] px-2.5 py-1 text-xs font-medium text-[#111C19] hover:bg-[#F3F4F0] cursor-pointer"
                            >
                              Resolve
                            </button>
                          ) : (
                            <span className="text-xs text-[#6B7772]">Resolved</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteAlert(alert.id)}
                            aria-label="Delete check"
                            className="rounded-md p-1 text-[#6B7772] hover:bg-[#FEF2F2] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
