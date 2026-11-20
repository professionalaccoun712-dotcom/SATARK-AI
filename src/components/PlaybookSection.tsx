import type { UIStrings } from '../i18n/translations.ts';

interface PlaybookSectionProps {
  strings: UIStrings;
}

export function PlaybookSection({ strings }: PlaybookSectionProps) {
  return (
    <section
      id="playbook"
      className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 border-t border-[#E3E5DF]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#111C19] sm:text-3xl">
            {strings.playbookTitle}
          </h2>
          <p className="mt-1.5 text-sm text-[#525E59]">{strings.playbookSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#1B4332]">
          <a href="tel:1930" className="hover:underline">
            Helpline 1930
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://cybercrime.gov.in/"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            cybercrime.gov.in
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://sancharsaathi.gov.in/sfc/"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Sanchar Saathi Chakshu
          </a>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {strings.playbookStages.map((stage) => (
          <article
            key={stage.num}
            className="rounded-xl border border-[#E3E5DF] bg-white p-6 flex flex-col justify-between"
          >
            <div>
              <span className="font-mono text-xs font-semibold text-[#1B4332] tabular-nums">
                {stage.num}
              </span>
              <h3 className="mt-2 font-display text-lg font-semibold text-[#111C19]">
                {stage.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#434E4A]">{stage.tactic}</p>
            </div>

            <p className="mt-5 border-t border-[#EFF1EC] pt-3.5 text-xs font-medium leading-relaxed text-[#1B4332]">
              {stage.defense}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
