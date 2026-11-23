"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lightbulb,
  ListChecks,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import type {
  SetupReadinessItem,
  SetupReadinessStatus,
} from "@/lib/setup-guide-readiness";
import { GuideIcon } from "./GuideIcon";
import { GuideVisual } from "./GuideVisual";
import {
  guideCategories,
  type Guide,
  type GuideCategoryId,
  type GuideStep,
} from "./guides";
import {
  getGuideVisual,
  getStepCheckpoint,
  getVisualCaption,
} from "./guideWalkthroughMeta";
import styles from "./setup-guides-redesign.module.css";

type GuideFilter = GuideCategoryId | "all";

type SetupGuideExperienceProps = {
  guides: Guide[];
  readiness: SetupReadinessItem[];
  initialSlug?: string;
  initialStep?: number;
};

const readinessLabels: Record<SetupReadinessStatus, string> = {
  ready: "Ready",
  needs_setup: "Needs setup",
  optional: "Optional",
  review: "Review",
  unavailable: "Unavailable",
};

const categoryLabels = Object.fromEntries(
  guideCategories.map((category) => [category.id, category.label]),
) as Record<GuideCategoryId, string>;

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(reducedMotionQuery).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function getStepReadSeconds(step: GuideStep, checkpoint: string): number {
  const words = countWords(
    [
      step.title,
      ...step.body,
      ...(step.points ?? []),
      step.tip ?? "",
      step.warning?.text ?? "",
      ...(step.details?.body ?? []),
      checkpoint,
    ].join(" "),
  );

  return Math.min(30, Math.max(10, Math.ceil(words / 3.3)));
}

function getInitialStep(guide: Guide, requestedStep: number | undefined): number {
  if (!Number.isFinite(requestedStep)) return 0;

  return Math.min(
    Math.max(Math.floor(requestedStep ?? 0), 0),
    guide.steps.length - 1,
  );
}

function guideCount(value: number): string {
  return `${value} ${value === 1 ? "guide" : "guides"}`;
}

export default function SetupGuideExperience({
  guides,
  readiness,
  initialSlug,
  initialStep,
}: SetupGuideExperienceProps) {
  const defaultGuide =
    guides.find((guide) => guide.slug === initialSlug) ??
    guides.find((guide) => guide.slug === "initial-setup") ??
    guides[0]!;

  const [selectedSlug, setSelectedSlug] = useState(defaultGuide.slug);
  const [stepIndex, setStepIndex] = useState(() =>
    getInitialStep(defaultGuide, initialStep),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<GuideFilter>("all");

  const searchRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLElement>(null);

  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const selectedGuide =
    guides.find((guide) => guide.slug === selectedSlug) ?? defaultGuide;
  const currentStep =
    selectedGuide.steps[stepIndex] ?? selectedGuide.steps[0]!;
  const checkpoint = getStepCheckpoint(selectedGuide.slug, stepIndex);
  const visual = getGuideVisual(selectedGuide.slug);
  const visualCaption = getVisualCaption(visual, stepIndex);
  const stepCount = selectedGuide.steps.length;
  const readSeconds = getStepReadSeconds(currentStep, checkpoint);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === stepCount - 1;
  const manualActive = manualMode || prefersReducedMotion;

  const searchableGuides = useMemo(
    () =>
      guides.map((guide) => ({
        guide,
        searchText: [
          guide.title,
          guide.description,
          categoryLabels[guide.category],
          guide.keywords.join(" "),
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [guides],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGuides = useMemo(() => {
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    return searchableGuides
      .filter(({ guide, searchText }) => {
        if (activeCategory !== "all" && guide.category !== activeCategory) {
          return false;
        }

        return terms.every((term) => searchText.includes(term));
      })
      .map(({ guide }) => guide);
  }, [activeCategory, normalizedQuery, searchableGuides]);

  const isFiltering = normalizedQuery.length > 0 || activeCategory !== "all";
  const relatedGuides = selectedGuide.related
    .map((slug) => guides.find((guide) => guide.slug === slug))
    .filter((guide): guide is Guide => Boolean(guide));

  useEffect(() => {
    if (!isPlaying || manualActive || isLastStep) return;

    const timer = window.setTimeout(() => {
      const nextStep = stepIndex + 1;

      setStepIndex(nextStep);
      if (nextStep >= stepCount - 1) setIsPlaying(false);
    }, readSeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [isLastStep, isPlaying, manualActive, readSeconds, stepCount, stepIndex]);

  useEffect(() => {
    const params = new URLSearchParams({ guide: selectedGuide.slug });
    if (stepIndex > 0) params.set("step", String(stepIndex + 1));

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [selectedGuide.slug, stepIndex]);

  function scrollToSection(
    target: HTMLElement | null,
    behavior: ScrollBehavior,
  ) {
    target?.scrollIntoView({ behavior, block: "start" });
  }

  function chooseGuide(slug: string) {
    setSelectedSlug(slug);
    setStepIndex(0);
    setIsPlaying(false);

    if (window.matchMedia("(max-width: 1180px)").matches) {
      window.requestAnimationFrame(() => {
        scrollToSection(
          viewerRef.current,
          prefersReducedMotion ? "auto" : "smooth",
        );
      });
    }
  }

  function returnToPicker() {
    setIsPlaying(false);
    scrollToSection(
      pickerRef.current,
      prefersReducedMotion ? "auto" : "smooth",
    );
    searchRef.current?.focus({ preventScroll: true });
  }

  function goToStep(nextStep: number) {
    const boundedStep = Math.min(Math.max(nextStep, 0), stepCount - 1);

    setIsPlaying(false);
    setStepIndex(boundedStep);
  }

  function restartGuide() {
    setIsPlaying(false);
    setStepIndex(0);
  }

  function togglePlayback() {
    if (manualActive) return;

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (isLastStep) setStepIndex(0);
    setIsPlaying(true);
  }

  function toggleManualMode() {
    setIsPlaying(false);
    setManualMode((current) => !current);
  }

  function resetFilters() {
    setQuery("");
    setActiveCategory("all");
    searchRef.current?.focus();
  }

  return (
    <>
      <header className={styles.pageHead}>
        <div className={styles.headCopy}>
          <p className={styles.eyebrow}>Creator Studio // Setup Guides</p>
          <h1 className={styles.title}>
            Setup walkthroughs<span>.</span>
          </h1>
          <p className={styles.intro}>
            Pick a setup from the directory. Each walkthrough follows controls
            that exist in this build. Press Play to advance automatically, or
            choose Manual to move at your own pace.
          </p>
        </div>
        <div className={styles.headMeta}>
          <span>
            <MousePointer2 aria-hidden="true" size={12} />
            Pick a setup
          </span>
          <span>
            <Play aria-hidden="true" size={12} />
            Play or manual
          </span>
          <span>
            <ChevronDown aria-hidden="true" size={12} />
            Controls below
          </span>
        </div>
      </header>

      <section className={styles.readinessPanel} aria-labelledby="readiness-title">
        <div className={styles.readinessHeading}>
          <div>
            <p className={styles.readinessEyebrow}>Verified account signals</p>
            <h2 id="readiness-title">Setup readiness</h2>
          </div>
          <p>
            Saved account data only. Provider credentials, local bridge health,
            and OBS playback need their own checks.
          </p>
        </div>
        <div className={styles.readinessGrid}>
          {readiness.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={styles.readinessItem}
              data-status={item.status}
            >
              <span className={styles.readinessTitle}>{item.title}</span>
              <span className={styles.readinessStatus}>
                <span className={styles.readinessDot} aria-hidden="true" />
                {readinessLabels[item.status]}
              </span>
              <span className={styles.readinessDetail}>{item.detail}</span>
              <span className={styles.readinessAction}>
                {item.actionLabel} <ArrowRight aria-hidden="true" size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <aside
          ref={pickerRef}
          id="guide-picker"
          className={styles.rail}
          aria-label="Setup guide directory"
        >
          <div className={styles.railHead}>
            <span className={styles.railTitle}>Setup directory</span>
            <span className={styles.railCount} role="status" aria-live="polite">
              {guideCount(filteredGuides.length)}
              {isFiltering ? ` / ${guides.length}` : ""}
            </span>
          </div>

          <div className={styles.railSearch}>
            <Search
              aria-hidden="true"
              className={styles.searchIcon}
              size={14}
            />
            <label className={styles.srOnly} htmlFor="guide-search">
              Search setup guides
            </label>
            <input
              ref={searchRef}
              id="guide-search"
              type="search"
              autoComplete="off"
              placeholder="OBS, payments, voice..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.length > 0 ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear guide search"
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </div>

          <div
            className={styles.categoryStrip}
            role="group"
            aria-label="Filter guides by category"
          >
            <button
              type="button"
              className={`${styles.categoryButton} ${
                activeCategory === "all" ? styles.categoryButtonActive : ""
              }`}
              aria-pressed={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            >
              All
            </button>
            {guideCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`${styles.categoryButton} ${
                  activeCategory === category.id
                    ? styles.categoryButtonActive
                    : ""
                }`}
                aria-pressed={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>

          {filteredGuides.length > 0 ? (
            <ul className={styles.guideList}>
              {filteredGuides.map((guide) => {
                const selected = guide.slug === selectedGuide.slug;
                const index = guides.indexOf(guide) + 1;

                return (
                  <li key={guide.slug}>
                    <button
                      type="button"
                      className={`${styles.guideButton} ${
                        selected ? styles.guideButtonActive : ""
                      }`}
                      data-category={guide.category}
                      aria-pressed={selected}
                      title={guide.title}
                      onClick={() => chooseGuide(guide.slug)}
                    >
                      <span className={styles.guideIndex}>
                        {String(index).padStart(2, "0")}
                      </span>
                      <span className={styles.guideIcon}>
                        <GuideIcon name={guide.icon} size={15} />
                      </span>
                      <span className={styles.guideCopy}>
                        <span className={styles.guideCategory}>
                          {categoryLabels[guide.category]}
                        </span>
                        <span className={styles.guideTitle}>{guide.title}</span>
                        <span className={styles.guideMeta}>
                          {guide.steps.length} checkpoints
                        </span>
                      </span>
                      <span className={styles.guideEnd}>
                        {selected ? (
                          <Check aria-hidden="true" size={13} />
                        ) : (
                          <ChevronRight aria-hidden="true" size={13} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.railEmpty}>
              <Search aria-hidden="true" size={18} />
              <h3>No guide matches</h3>
              <p>Try a broader search or reset the category filter.</p>
              <button
                type="button"
                className={styles.railReset}
                onClick={resetFilters}
              >
                <RotateCcw aria-hidden="true" size={12} />
                Reset filters
              </button>
            </div>
          )}

          <p className={styles.railNote}>
            <ShieldCheck aria-hidden="true" size={12} />
            Walkthrough availability is not a check of your live configuration.
            Confirm integration status in the dashboard.
          </p>
        </aside>

        <section
          ref={viewerRef}
          id="walkthrough"
          className={styles.stage}
          aria-labelledby="walkthrough-title"
          tabIndex={-1}
        >
          <div className={styles.stageTop}>
            <button
              type="button"
              className={styles.backButton}
              onClick={returnToPicker}
            >
              <ChevronLeft aria-hidden="true" size={13} />
              All setups
            </button>
            <span className={styles.availability}>
              <span className={styles.availabilityDot} aria-hidden="true" />
              Guide ready
            </span>
          </div>

          <header className={styles.guideHeader}>
            <span
              className={styles.guideHeaderIcon}
              data-category={selectedGuide.category}
            >
              <GuideIcon name={selectedGuide.icon} size={19} />
            </span>
            <div className={styles.guideHeaderCopy}>
              <p className={styles.stageCategory}>
                {categoryLabels[selectedGuide.category]} · {stepCount}{" "}
                checkpoints
              </p>
              <h2 id="walkthrough-title" className={styles.stageTitle}>
                {selectedGuide.title}
              </h2>
              <p className={styles.stageIntro}>{selectedGuide.intro}</p>
            </div>
          </header>

          <p
            className={styles.srOnly}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {selectedGuide.title}. Step {stepIndex + 1} of {stepCount}:{" "}
            {currentStep.title}.
          </p>

          <div className={styles.overviewGrid}>
            <div className={styles.visualWrap}>
              <GuideVisual
                visual={visual}
                step={stepIndex}
                caption={visualCaption}
              />
            </div>

            <aside className={styles.configPanel} aria-label="Guide details">
              <div className={styles.configHead}>
                <span>Guide details</span>
                <span className={styles.configReady}>
                  <i aria-hidden="true" />
                  Available
                </span>
              </div>

              <dl className={styles.configList}>
                <div className={styles.configItem}>
                  <dt className={styles.configKey}>Category</dt>
                  <dd className={styles.configValue}>
                    {categoryLabels[selectedGuide.category]}
                  </dd>
                </div>
                <div className={styles.configItem}>
                  <dt className={styles.configKey}>Checkpoints</dt>
                  <dd className={styles.configValue}>{stepCount}</dd>
                </div>
                <div className={styles.configItem}>
                  <dt className={styles.configKey}>Playback</dt>
                  <dd className={styles.configValue}>
                    {manualActive
                      ? "Manual"
                      : isPlaying
                        ? "Auto running"
                        : "Ready"}
                  </dd>
                </div>
                <div className={styles.configItem}>
                  <dt className={styles.configKey}>Read time</dt>
                  <dd className={styles.configValue}>~{readSeconds}s / step</dd>
                </div>
              </dl>

              {selectedGuide.prerequisites.length > 0 ? (
                <div className={styles.configSection}>
                  <p className={styles.configSectionLabel}>
                    <ListChecks aria-hidden="true" size={11} />
                    Before you start
                  </p>
                  <ul className={styles.prereqList}>
                    {selectedGuide.prerequisites.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className={styles.videoNote}>
                <span>Need a video file?</span>
                <p>
                  These are interactive diagrams, not screen recordings. Use
                  your operating system&apos;s recorder if you need video for
                  your team.
                </p>
              </div>
            </aside>
          </div>

          <article
            key={`${selectedGuide.slug}-${stepIndex}`}
            className={styles.stepCard}
            aria-labelledby="current-step-title"
          >
            <div className={styles.stepTop}>
              <span className={styles.stepBadge}>
                {String(stepIndex + 1).padStart(2, "0")} /{" "}
                {String(stepCount).padStart(2, "0")}
              </span>
              <span className={styles.stepCategory}>
                {categoryLabels[selectedGuide.category]}
              </span>
              <span className={styles.stepTime}>
                <Clock3 aria-hidden="true" size={11} />~{readSeconds}s
              </span>
            </div>

            <h3 id="current-step-title" className={styles.stepTitle}>
              {currentStep.title}
            </h3>

            {currentStep.body.map((paragraph) => (
              <p key={paragraph} className={styles.stepBody}>
                {paragraph}
              </p>
            ))}

            {currentStep.points && currentStep.points.length > 0 ? (
              <ul className={styles.stepPoints}>
                {currentStep.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}

            {currentStep.warning ? (
              <aside className={styles.warning} role="note">
                <TriangleAlert aria-hidden="true" size={15} />
                <div>
                  <strong>{currentStep.warning.title}</strong>
                  <p>{currentStep.warning.text}</p>
                </div>
              </aside>
            ) : null}

            {currentStep.tip ? (
              <p className={styles.tip}>
                <Lightbulb aria-hidden="true" size={14} />
                <span>
                  <strong>Tip:</strong> {currentStep.tip}
                </span>
              </p>
            ) : null}

            {currentStep.details ? (
              <details className={styles.details}>
                <summary>
                  {currentStep.details.summary}
                  <ChevronDown
                    aria-hidden="true"
                    className={styles.chevron}
                    size={14}
                  />
                </summary>
                <div className={styles.detailsBody}>
                  {currentStep.details.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </details>
            ) : null}

            {currentStep.links && currentStep.links.length > 0 ? (
              <div className={styles.links}>
                {currentStep.links.map((link) => (
                  <Link
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    className={styles.link}
                  >
                    {link.label}
                    <ArrowRight aria-hidden="true" size={12} />
                  </Link>
                ))}
              </div>
            ) : null}

            <div className={styles.checkpoint}>
              <span className={styles.checkpointIcon} aria-hidden="true">
                <Check size={14} />
              </span>
              <div>
                <strong>Checkpoint</strong>
                <p>{checkpoint}</p>
              </div>
            </div>

            <div className={styles.playback}>
              <div className={styles.progressMeta}>
                <span>Walkthrough progress</span>
                <span>
                  {stepIndex + 1} / {stepCount}
                </span>
              </div>
              <div
                className={styles.progressRail}
                role="group"
                aria-label="Jump to a walkthrough step"
              >
                {selectedGuide.steps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    className={`${styles.progressStep} ${
                      index === stepIndex ? styles.progressStepActive : ""
                    }`}
                    aria-label={`Step ${index + 1}: ${step.title}`}
                    aria-current={index === stepIndex ? "step" : undefined}
                    onClick={() => goToStep(index)}
                  >
                    <span>{index + 1}</span>
                    <i aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className={styles.autoTrack} aria-hidden="true">
                <i
                  key={`${selectedGuide.slug}-${stepIndex}-${isPlaying ? "playing" : "paused"}`}
                  className={isPlaying ? styles.autoProgress : undefined}
                  style={{ animationDuration: `${readSeconds * 1000}ms` }}
                />
              </div>

              <div className={styles.controlsRow}>
                <div className={styles.controlGroup}>
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={() => goToStep(stepIndex - 1)}
                    disabled={isFirstStep}
                    aria-label="Previous step"
                  >
                    <ChevronLeft aria-hidden="true" size={14} />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.controlButton} ${styles.playButton}`}
                    onClick={togglePlayback}
                    disabled={manualActive}
                    aria-label={
                      isPlaying
                        ? "Pause automatic walkthrough"
                        : isLastStep
                          ? "Replay automatic walkthrough"
                          : "Play automatic walkthrough"
                    }
                    aria-pressed={isPlaying}
                  >
                    {isPlaying ? (
                      <Pause aria-hidden="true" size={14} />
                    ) : (
                      <Play aria-hidden="true" size={14} />
                    )}
                    <span>
                      {isPlaying ? "Pause" : isLastStep ? "Replay" : "Play"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={() => goToStep(stepIndex + 1)}
                    disabled={isLastStep}
                    aria-label="Next step"
                  >
                    <span>Next</span>
                    <ChevronRight aria-hidden="true" size={14} />
                  </button>
                </div>

                <div className={styles.controlGroup}>
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={restartGuide}
                    aria-label="Restart walkthrough"
                    title="Restart walkthrough"
                  >
                    <RotateCcw aria-hidden="true" size={13} />
                    <span>Restart</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.controlButton} ${styles.manualButton}`}
                    onClick={toggleManualMode}
                    aria-pressed={manualActive}
                    disabled={prefersReducedMotion}
                    title={
                      prefersReducedMotion
                        ? "Automatic playback is off because reduced motion is enabled."
                        : "Toggle automatic playback"
                    }
                  >
                    <MousePointer2 aria-hidden="true" size={13} />
                    <span>Manual</span>
                  </button>
                </div>
              </div>

              <p className={styles.playbackHint}>
                {prefersReducedMotion
                  ? "Reduced motion is enabled, so automatic playback stays off. Use Prev and Next."
                  : manualActive
                    ? "Manual mode is on. Use Prev and Next to move at your own pace."
                    : isPlaying
                      ? `Playing. The next step starts in about ${readSeconds} seconds; auto-advance stops after the last step.`
                      : isLastStep
                        ? "You are on the last step. Automatic playback stops here; choose Replay to start over."
                        : `Playback is paused. Automatic steps wait ${readSeconds} seconds before advancing.`}
              </p>
            </div>
          </article>

          <div className={styles.lowerGrid}>
            <details className={styles.troubleshooting}>
              <summary>
                <span>
                  <Wrench aria-hidden="true" size={13} />
                  Troubleshooting
                </span>
                <span>
                  {selectedGuide.troubleshooting.length} problems
                  <ChevronDown
                    aria-hidden="true"
                    className={styles.chevron}
                    size={13}
                  />
                </span>
              </summary>
              <div className={styles.troubleshootingGrid}>
                {selectedGuide.troubleshooting.map((item) => (
                  <article
                    key={item.problem}
                    className={styles.troubleshootingItem}
                  >
                    <h3>{item.problem}</h3>
                    <p>{item.solution}</p>
                  </article>
                ))}
              </div>
            </details>

            {relatedGuides.length > 0 ? (
              <details className={styles.related} open>
                <summary>
                  <span>
                    <ListChecks aria-hidden="true" size={13} />
                    Related guides
                  </span>
                  <span>
                    {relatedGuides.length} next
                    <ChevronDown
                      aria-hidden="true"
                      className={styles.chevron}
                      size={13}
                    />
                  </span>
                </summary>
                <ul className={styles.relatedList}>
                  {relatedGuides.map((related) => (
                    <li key={related.slug}>
                      <button
                        type="button"
                        className={styles.relatedButton}
                        onClick={() => chooseGuide(related.slug)}
                      >
                        <span className={styles.relatedIcon}>
                          <GuideIcon name={related.icon} size={13} />
                        </span>
                        <span className={styles.relatedCopy}>
                          <span className={styles.relatedCategory}>
                            {categoryLabels[related.category]}
                          </span>
                          <span className={styles.relatedTitle}>
                            {related.title}
                          </span>
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className={styles.relatedArrow}
                          size={13}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <div />
            )}
          </div>

          <div className={styles.stageFooter}>
            <button
              type="button"
              className={styles.footerLink}
              onClick={returnToPicker}
            >
              <ChevronLeft aria-hidden="true" size={13} />
              All setups
            </button>
            <Link href="/dashboard" className={styles.footerLink}>
              Open dashboard
              <ArrowRight aria-hidden="true" size={13} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
