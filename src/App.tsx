import { useCallback, useEffect, useState } from 'react';
import { AiTrackerWorkspace } from './components/AiTrackerWorkspace.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { GuardiansAndHistory } from './components/GuardiansAndHistory.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { Navbar } from './components/Navbar.tsx';
import { PlaybookSection } from './components/PlaybookSection.tsx';
import { SUPPORTED_LANGUAGES, UI_STRINGS } from './i18n/translations.ts';
import type {
  AlertRecord,
  LanguageCode,
  LanguageSelection,
  TrustedContact,
  UserProfile,
} from './types.ts';

export default function App() {
  const [uiLanguage, setUiLanguage] = useState<LanguageCode>('en-IN');
  const [aiLanguage, setAiLanguage] = useState<LanguageSelection>('auto');
  const [activeSection, setActiveSection] = useState<string>('overview');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);

  const strings = UI_STRINGS[uiLanguage];

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [meRes, alertsRes, contactsRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/alerts'),
        fetch('/api/contacts'),
      ]);
      if (meRes.ok) {
        const me = (await meRes.json()) as { user: UserProfile | null };
        setUser(me.user);
      }
      if (alertsRes.ok) {
        const al = (await alertsRes.json()) as { alerts: AlertRecord[] };
        setAlerts(al.alerts || []);
      }
      if (contactsRes.ok) {
        const ct = (await contactsRes.json()) as { contacts: TrustedContact[] };
        setContacts(ct.contacts || []);
      }
    } catch {
      // Keep UI interactive even if background fetch fails transiently
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  function scrollToSection(sectionId: string) {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleAddContact(input: { name: string; phone: string; relationship: string }) {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { contact?: TrustedContact; error?: string };
    if (!res.ok || !data.contact) {
      throw new Error(data.error || 'Could not save trusted contact.');
    }
    setContacts((prev) => [data.contact!, ...prev]);
  }

  async function handleDeleteContact(id: string) {
    const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
    }
  }

  async function handleCloseAlert(id: string) {
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}/close`, { method: 'POST' });
    if (res.ok) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, closed: true } : a)));
    }
  }

  async function handleDeleteAlert(id: string) {
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    loadWorkspaceData();
  }

  const latestHighAlert = alerts.find((a) => a.severity === 'critical' || a.severity === 'high');

  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#111C19]">
      <Navbar strings={strings} activeSection={activeSection} onNavigate={scrollToSection} />

      {/* Workspace Language & Account Strip (kept outside top navbar per Top Bar Contract) */}
      <div className="border-b border-[#E8EAE4] bg-[#F2F3EE]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Interface language">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = uiLanguage === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setUiLanguage(lang.code)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-[#111C19] shadow-xs border border-[#DCE0D8]'
                      : 'text-[#525E59] hover:text-[#111C19]'
                  }`}
                >
                  {lang.nativeName}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs">
            {user ? (
              <>
                <span className="font-medium text-[#111C19]">{user.name}</span>
                <span aria-hidden="true" className="text-[#9AA39E]">
                  ·
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="font-medium text-[#1B4332] hover:underline cursor-pointer"
                >
                  {strings.signOutBtn}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="font-medium text-[#1B4332] hover:underline whitespace-nowrap cursor-pointer"
              >
                {strings.signInBtn}
              </button>
            )}
          </div>
        </div>
      </div>

      <main>
        <HeroSection
          strings={strings}
          onStartCheck={() => scrollToSection('tracker')}
          onViewPlaybook={() => scrollToSection('playbook')}
        />

        <AiTrackerWorkspace
          strings={strings}
          selectedLanguage={aiLanguage}
          onSelectLanguage={setAiLanguage}
          onAlertCreated={(alert) => setAlerts((prev) => [alert, ...prev])}
        />

        <GuardiansAndHistory
          strings={strings}
          contacts={contacts}
          alerts={alerts}
          latestProblemSummary={latestHighAlert ? latestHighAlert.detectedProblem : null}
          onAddContact={handleAddContact}
          onDeleteContact={handleDeleteContact}
          onCloseAlert={handleCloseAlert}
          onDeleteAlert={handleDeleteAlert}
        />

        <PlaybookSection strings={strings} />
      </main>

      <footer className="border-t border-[#E3E5DF] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-[#525E59] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="space-y-1">
            <p className="font-display text-sm font-bold text-[#111C19]">Satark Live Guard</p>
            <p>
              AI safety second opinion for India · Never share OTPs, UPI PINs, or remote access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="tel:1930" className="font-semibold text-[#1B4332] hover:underline">
              National Cyber Helpline 1930
            </a>
            <a
              href="https://cybercrime.gov.in/"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              cybercrime.gov.in
            </a>
          </div>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(loggedInUser) => {
          setUser(loggedInUser);
          loadWorkspaceData();
        }}
      />
    </div>
  );
}
