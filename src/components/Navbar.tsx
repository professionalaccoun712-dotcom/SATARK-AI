import type { UIStrings } from '../i18n/translations.ts';

interface NavbarProps {
  strings: UIStrings;
  activeSection: string;
  onNavigate: (sectionId: string) => void;
}

export function Navbar({ strings, activeSection, onNavigate }: NavbarProps) {
  const links = [
    { id: 'overview', label: strings.navOverview },
    { id: 'tracker', label: strings.navTracker },
    { id: 'guardians', label: strings.navGuardians },
    { id: 'playbook', label: strings.navPlaybook },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#E3E5DF] bg-[#F7F7F4]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('overview');
          }}
          className="font-display text-lg font-extrabold tracking-tight text-[#111C19] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B4332]"
        >
          Satark
        </a>

        <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
          {links.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(link.id);
                }}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 hover:text-[#111C19] ${
                  isActive
                    ? 'text-[#111C19] underline decoration-[#1B4332] decoration-2 underline-offset-8'
                    : 'text-[#525E59]'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <a
            href="tel:1930"
            className="inline-flex items-center justify-center rounded-lg bg-[#1B4332] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#143326] whitespace-nowrap shrink-0"
          >
            {strings.ctaHelpline}
          </a>
        </div>
      </div>
    </header>
  );
}
