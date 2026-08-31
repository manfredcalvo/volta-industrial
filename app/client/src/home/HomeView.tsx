/**
 * Home / landing page.
 *
 * Tells the STORY of the use case. The narrative pieces (hero persona,
 * headline, situation, goal, journey quotes, starter prompts, featured
 * action) are hardcoded here. Only `assistantScript` and `branding` stay
 * config-driven (the script chain is reused by the chat dock; branding is
 * also read by the shell header).
 *
 * The journey diagram's 4 cards wire into the floating chat dock via
 * `dockController` — clicking a card navigates, opens the dock, or opens
 * it and auto-sends a scripted prompt. That's the "see it in action" path.
 */
import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  MessageCircleQuestion,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { useSession, type ScriptStep } from '@/lib/api';
import { fetchActivity } from '@/lib/lines';
import type { ActivityEvent } from '@/shared/types';
import { dataMutated } from '@/lib/events';
import { dockController } from '@/chat/dockController';
import { AgentLoopFlow } from '@/architecture/AgentLoopFlow';
import { actionLabel } from '@/shared/badges';

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

const HERO = {
  name: 'Dana Okafor',
  role: 'Plant Operations Lead',
};

const STORY = {
  headline: 'A critical line is trending toward an unplanned stop.',
  situation:
    "Vibration and temperature on LINE-04 have been climbing for three shifts. The failure-risk model has it in the critical band, with roughly $3.5M of downtime exposure across the at-risk fleet. Nothing has failed yet — but the window to act cheaply is closing.",
  goal: 'Find what is driving the risk, weigh pull-now vs. run-to-shift-end vs. expedite-the-part, and cut a work order before the line goes down.',
};

const STARTER_QUESTIONS = [
  'Why is LINE-04 trending toward a stop, and what are my options?',
  'Which lines are in the critical band right now?',
  'Do we have the part in local stock, or do we need to expedite it?',
];

// The featured action's prompt runs the full investigate → rank → act arc.
const FEATURED_ACTION_PROMPT =
  "Something is off with LINE-04. Find the worst at-risk line, explain what's driving the failure risk using the plant data, then rank the maintenance actions with the model — pull now, run to shift end, or expedite the part — and show me the net value of each. Check whether the needed part is in local stock. Recommend the best action and wait for my approval. Once I say go, cut the work order.";

export function HomeView() {
  const { config, configError, retry: retrySession } = useSession();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const reload = () =>
      fetchActivity(20)
        .then(setActivity)
        .catch((e) => {
          console.error('[home] activity feed failed', e);
        });
    void reload();
    return dataMutated.subscribe(reload);
  }, []);

  if (configError) {
    return (
      <div className="p-12 max-w-xl text-sm">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <div className="font-semibold">Couldn't load app config</div>
            <div className="text-destructive/80">{configError}</div>
            <button
              type="button"
              onClick={retrySession}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs hover:bg-destructive/15 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return <div className="p-12 text-muted-foreground">Loading…</div>;
  }

  const heroFirstName = HERO.name.split(/\s+/)[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-14 space-y-5 sm:space-y-7">
        {/* Hero */}
        <section className="space-y-5">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-block h-px w-8 bg-foreground/40" />
            {HERO.name} · {HERO.role}
          </div>
          <h1 className="display text-3xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-foreground">
            {STORY.headline}
          </h1>
          <p className="hidden sm:block text-lg text-muted-foreground leading-relaxed max-w-3xl">
            {STORY.situation}
          </p>
          <p
            className="inline-block text-sm text-foreground italic border-l-2 pl-3 py-0.5 max-w-3xl"
            style={{ borderColor: 'var(--accent)' }}
          >
            <span className="font-semibold not-italic uppercase tracking-[0.15em] text-xs text-muted-foreground mr-2">
              Goal
            </span>
            {STORY.goal}
          </p>
        </section>

        {/* Persona journey diagram */}
        <section className="space-y-5">
          <div className="hidden sm:block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            A shift's work · before the line goes down
          </div>
          <JourneyDiagram heroName={heroFirstName} script={config.assistantScript} />

          <AgentLoopFlow />
        </section>

        {/* Starter prompts — each opens the floating assistant dock */}
        <section className="space-y-3">
          <div className="hidden sm:block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Try asking
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {STARTER_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => dockController.newAndSend(q)}
                className="flex w-full sm:w-auto sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground hover:border-foreground/30 hover:shadow-sm transition-all"
              >
                <Sparkles className="size-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 text-left sm:flex-none">{q}</span>
                <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </section>

        {/* Featured action — climax. */}
        <section>
          <div
            className="rounded-2xl p-7 relative overflow-hidden"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in oklch, var(--primary) 96%, white) 0%, color-mix(in oklch, var(--primary) 88%, var(--accent) 12%) 100%)',
              color: 'var(--primary-foreground)',
            }}
          >
            <div
              className="absolute -right-16 -top-16 size-52 rounded-full opacity-20"
              style={{ background: 'var(--accent)' }}
            />
            <div className="relative">
              <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80 mb-3">
                <Zap className="size-3.5" />
                Let the assistant handle it
              </div>
              <h3 className="display text-2xl font-semibold mb-2 leading-tight">
                Investigate LINE-04, rank the actions, cut the work order
              </h3>
              <p className="hidden sm:block text-sm opacity-85 leading-relaxed mb-5 max-w-2xl">
                The assistant pulls the failure signals for the worst at-risk
                line, explains what's driving the risk, then asks the model to
                rank pull-now vs. run-to-shift-end vs. expedite-the-part by net
                value — checking whether the part is in local stock. It
                recommends the best action and waits for your approval before
                cutting a work order.
              </p>
              <p className="sm:hidden text-sm opacity-85 leading-relaxed mb-5">
                Investigate the worst line, rank the actions by net value,
                approve — then it cuts the work order.
              </p>
              <button
                onClick={() => dockController.newAndSend(FEATURED_ACTION_PROMPT)}
                className="inline-flex items-center gap-2 rounded-full bg-background text-foreground px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Run this <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Proof — activity feed */}
        {activity.length > 0 && (
          <section className="space-y-4">
            <div className="hidden sm:block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Recent activity
            </div>
            <ActivityFeed
              events={activity}
              onJumpToLine={() => navigate('/operations')}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// --- Journey diagram -------------------------------------------------------

function JourneyDiagram({
  heroName,
  script,
}: {
  heroName: string;
  script: ScriptStep[];
}) {
  const navigate = useNavigate();
  const step0 = script[0];
  const step1 = script[1];
  const step2 = script[2];

  const steps = [
    {
      icon: <Eye className="size-5" />,
      role: `${heroName} watches`,
      quote: '"LINE-04 has been climbing all shift — the board is red."',
      highlight: false,
      onClick: () => navigate('/operations'),
    },
    {
      icon: <MessageCircleQuestion className="size-5" />,
      role: 'She asks',
      quote: '"Why is LINE-04 trending toward a stop?"',
      highlight: false,
      onClick: () =>
        step0
          ? dockController.newAndSend(step0.prompt)
          : dockController.open(),
    },
    {
      icon: <Brain className="size-5" />,
      role: 'AI investigates',
      quote: '"Vibration + heat rising. Bearing part is local. Ranked actions by net value."',
      highlight: true,
      onClick: () => dockController.open(),
    },
    {
      icon: <Wrench className="size-5" />,
      role: 'AI takes action',
      quote: '"Pull now beats running it out. Work order cut on approval."',
      highlight: true,
      onClick: () => {
        if (step1) dockController.openAndSend(step1.prompt);
        else if (step2) dockController.openAndSend(step2.prompt);
        else dockController.open();
      },
    },
  ];

  return (
    <>
      {/* Desktop / tablet: 4 cards in a row with arrows between. */}
      <div className="hidden md:grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
        {steps.map((s, i) => (
          <Fragment key={i}>
            <button
              onClick={s.onClick}
              className={`text-left rounded-xl px-4 py-4 flex flex-col gap-2 transition-all hover:shadow-sm ${stepCardClass(s.highlight)}`}
              style={stepCardStyle(s.highlight)}
            >
              <StepIcon step={s} size="sm" />
              <StepText step={s} />
            </button>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center text-muted-foreground">
                <ArrowRight className="size-4" />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* Phone: vertical rail of icons on the left, card per step on the right. */}
      <ol className="md:hidden relative flex flex-col gap-2.5">
        <div
          aria-hidden
          className="absolute left-[18px] top-7 bottom-7 w-px bg-border"
        />
        {steps.map((s, i) => (
          <li key={i} className="relative flex items-start gap-3">
            <StepIcon step={s} size="md" className="relative z-10 shrink-0 mt-1" />
            <button
              onClick={s.onClick}
              className={`flex-1 min-w-0 text-left rounded-xl px-3 py-2.5 transition-all hover:shadow-sm ${stepCardClass(s.highlight)}`}
              style={stepCardStyle(s.highlight)}
            >
              <StepText step={s} compact />
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

// --- Journey step primitives ------------------------------------------------

type JourneyStep = {
  icon: React.ReactNode;
  role: string;
  quote: string;
  highlight: boolean;
  onClick: () => void;
};

function stepCardClass(highlight: boolean): string {
  return highlight
    ? 'border-2 bg-card'
    : 'border border-border bg-card hover:border-foreground/30';
}

function stepCardStyle(highlight: boolean): React.CSSProperties | undefined {
  return highlight ? { borderColor: 'var(--accent)' } : undefined;
}

function StepIcon({
  step,
  size,
  className = '',
}: {
  step: JourneyStep;
  size: 'sm' | 'md';
  className?: string;
}) {
  const sizeClass = size === 'sm' ? 'size-8' : 'size-9';
  return (
    <div
      className={`${sizeClass} rounded-lg flex items-center justify-center ${className}`}
      style={{
        background: step.highlight ? 'var(--accent)' : 'var(--muted)',
        color: step.highlight ? 'var(--accent-foreground)' : 'var(--foreground)',
      }}
    >
      {step.icon}
    </div>
  );
}

function StepText({ step, compact = false }: { step: JourneyStep; compact?: boolean }) {
  return (
    <>
      <div
        className={`text-sm font-semibold text-foreground ${compact ? 'leading-tight' : ''}`}
      >
        {step.role}
      </div>
      <div
        className={`text-xs text-muted-foreground leading-snug italic ${compact ? 'mt-0.5' : ''}`}
      >
        {step.quote}
      </div>
    </>
  );
}

// --- Activity feed ---------------------------------------------------------

function ActivityFeed({
  events,
  onJumpToLine,
}: {
  events: ActivityEvent[];
  onJumpToLine: (lineId: string) => void;
}) {
  return (
    <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {events.map((e) => (
        <li key={e.workOrderId} className="px-4 py-3 flex items-start gap-3 text-sm">
          <div className="size-7 rounded-full flex items-center justify-center shrink-0 bg-[var(--success-subtle)] text-[var(--success-subtle-foreground)]">
            <CheckCircle2 className="size-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-foreground">
              <span className="font-medium capitalize">{e.action}</span>{' '}
              <span className="text-muted-foreground">
                {actionLabel(e.actionType)}
              </span>{' '}
              on <span className="font-mono text-xs">{e.lineId}</span>
              {e.by && (
                <span className="text-xs text-muted-foreground ml-2">
                  by {e.by}
                </span>
              )}
            </div>
            <button
              onClick={() => onJumpToLine(e.lineId)}
              className="mt-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              View line →
            </button>
          </div>
          <div className="text-xs text-muted-foreground shrink-0">
            {relativeTime(e.at)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.round((now - d) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
