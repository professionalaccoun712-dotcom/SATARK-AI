import { useState } from 'react';
import { ArrowDownRight, ShieldCheck } from 'lucide-react';
import type { UIStrings } from '../i18n/translations.ts';

interface HeroSectionProps {
  strings: UIStrings;
  onStartCheck: () => void;
  onViewPlaybook: () => void;
}

export function HeroSection({ strings, onStartCheck, onViewPlaybook }: HeroSectionProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <section id="overview" className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 lg:px-8 lg:pt-12">
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col justify-between lg:col-span-7 py-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-[#525E59]">
              Satark Live Guard · India Cyber Helpline 1930
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.08] tracking-tight text-[#111C19] text-balance">
              {strings.heroHeadline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#434E4A] sm:text-[17px]">
              {strings.heroBody}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onStartCheck}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1B4332] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#143326] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{strings.heroPrimaryBtn}</span>
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onViewPlaybook}
              className="inline-flex items-center rounded-lg border border-[#D4D8D0] bg-white px-5 py-3 text-sm font-medium text-[#111C19] transition-colors hover:bg-[#F0F2ED] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {strings.heroSecondaryBtn}
            </button>
          </div>
        </div>

        <figure className="lg:col-span-5 flex flex-col">
          <div className="relative flex-1 overflow-hidden rounded-xl border border-[#E3E5DF] bg-[#E9ECE6] min-h-[260px]">
            {!imgFailed ? (
              <img
                src="/src/assets/images/satark_calm_pause_1795170348004.jpg"
                alt="An Indian woman placing her phone face-down calmly beside a cup of chai"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#EAECE6] to-[#D9DFD6] p-8 text-center">
                <ShieldCheck className="h-10 w-10 text-[#1B4332]" aria-hidden="true" />
                <p className="font-display text-base font-semibold text-[#111C19]">
                  Pause before you act
                </p>
              </div>
            )}
          </div>
          <figcaption className="mt-3 text-xs leading-relaxed text-[#525E59]">
            {strings.heroImageCaption}
          </figcaption>
        </figure>
      </div>

      <div className="mt-10 grid grid-cols-1 border-y border-[#E3E5DF] sm:grid-cols-2 lg:grid-cols-4">
        {strings.stripSteps.map((step, index) => (
          <div
            key={step.num}
            className={`py-5 ${index > 0 ? 'border-t border-[#E3E5DF] sm:border-t-0' : ''} ${
              index % 2 === 1 ? 'sm:border-l sm:border-[#E3E5DF] sm:pl-6' : 'sm:pr-6'
            } ${index > 0 ? 'lg:border-l lg:border-[#E3E5DF] lg:px-6' : 'lg:pr-6'}`}
          >
            <span className="font-mono text-xs font-medium text-[#1B4332] tabular-nums">
              {step.num}
            </span>
            <h2 className="mt-1.5 font-display text-sm font-semibold text-[#111C19]">
              {step.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#525E59]">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
