'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useResolver } from '../ResolverContext';
import { TeamStanding } from '@/lib/types';
import ScoreboardHeader from './ScoreboardHeader';
import ScoreboardRow from './ScoreboardRow';

const FALLBACK_ROW_HEIGHT = 48; // used only before DOM measurement
const HEADER_HEIGHT = 56;
const SCROLL_DURATION = 400; // ms for viewport scrolling

export default function ScoreboardPage() {
    const router = useRouter();
    const {
        contestData,
        config,
        steps,
        frozenStandings,
        currentStep,
        setCurrentStep,
        isReady,
    } = useResolver();

    const [isPlaying, setIsPlaying] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [revealingProblemId, setRevealingProblemId] = useState<string | null>(null);
    const [focusedTeamId, setFocusedTeamId] = useState<string | null>(null);
    const [displayStandings, setDisplayStandings] = useState<TeamStanding[]>([]);
    const [movingTeamId, setMovingTeamId] = useState<string | null>(null);
    const [movePixels, setMovePixels] = useState(0);
    const [isFinished, setIsFinished] = useState(false);

    // Displaced teams (pushed down one row during a move animation)
    const [displacedTeamIds, setDisplacedTeamIds] = useState<Set<string>>(new Set());
    const [displacedOffset, setDisplacedOffset] = useState(0);

    // Smooth viewport scrolling: pixel offset for the scoreboard-body inner wrapper
    const [scrollY, setScrollY] = useState(0);
    const [scrollTransition, setScrollTransition] = useState(false);

    // Locked values during move animations
    const [lockedFocusedIdx, setLockedFocusedIdx] = useState<number | null>(null);

    const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const skipAnimRef = useRef(false);
    const animatingStepRef = useRef(-1);

    // Dynamically measured row height
    const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);

    // Redirect if no data
    useEffect(() => {
        if (!isReady || !contestData) {
            router.push('/');
        }
    }, [isReady, contestData, router]);

    // Measure actual row-to-row stride from DOM after first render.
    // We measure the distance between the tops of two adjacent rows,
    // which captures height + border exactly.
    useEffect(() => {
        const measure = () => {
            if (bodyRef.current) {
                const rows = bodyRef.current.querySelectorAll('.scoreboard-row');
                if (rows.length >= 2) {
                    const top0 = rows[0].getBoundingClientRect().top;
                    const top1 = rows[1].getBoundingClientRect().top;
                    const stride = top1 - top0;
                    if (stride > 0) {
                        setRowHeight(stride);
                    }
                } else if (rows.length === 1) {
                    const h = rows[0].getBoundingClientRect().height;
                    if (h > 0) setRowHeight(h);
                }
            }
        };
        const timer = setTimeout(measure, 100);
        return () => clearTimeout(timer);
    }, [displayStandings]);

    // Compute visible count from window height
    const visibleCount = useMemo(() => {
        const h = typeof window !== 'undefined' ? window.innerHeight - HEADER_HEIGHT : 800;
        return Math.floor(h / rowHeight);
    }, [rowHeight]);

    // Compute the ideal scroll target (pixel offset) for a given focused team
    const computeScrollTarget = useCallback((standings: TeamStanding[], focused: string | null) => {
        if (!focused) return 0;
        const focusIdx = standings.findIndex((s) => s.teamId === focused);
        if (focusIdx < 0) return 0;
        const targetPosition = visibleCount - 2; // show focus near bottom
        let startIdx = Math.max(0, focusIdx - targetPosition);
        startIdx = Math.min(startIdx, Math.max(0, standings.length - visibleCount));
        return startIdx * rowHeight;
    }, [visibleCount, rowHeight]);

    // Initialize display standings from current step (handles resume after exit)
    useEffect(() => {
        if (frozenStandings.length > 0 && displayStandings.length === 0) {
            if (currentStep >= 0 && currentStep < steps.length) {
                setDisplayStandings(steps[currentStep].standings);
                setFocusedTeamId(steps[currentStep].teamId);
                setScrollY(computeScrollTarget(steps[currentStep].standings, steps[currentStep].teamId));
            } else if (currentStep >= steps.length && steps.length > 0) {
                setDisplayStandings(steps[steps.length - 1].standings);
                setIsFinished(true);
                setScrollY(0);
            } else {
                setDisplayStandings(frozenStandings);
                setScrollY(0);
            }
        }
    }, [frozenStandings, displayStandings.length, currentStep, steps, computeScrollTarget]);

    // Smoothly scroll to a target position
    const smoothScrollTo = useCallback((targetY: number) => {
        setScrollTransition(true);
        setScrollY(targetY);
        // Transition is applied via CSS; the duration is SCROLL_DURATION
    }, []);

    // Instantly jump scroll (no transition)
    const jumpScrollTo = useCallback((targetY: number) => {
        setScrollTransition(false);
        setScrollY(targetY);
    }, []);

    // Apply step result instantly (used for skip and step backward)
    const applyStepInstant = useCallback((stepIdx: number) => {
        if (stepIdx < 0) {
            setDisplayStandings(frozenStandings);
            setFocusedTeamId(null);
            jumpScrollTo(0);
        } else if (stepIdx < steps.length) {
            setDisplayStandings(steps[stepIdx].standings);
            setFocusedTeamId(steps[stepIdx].teamId);
            jumpScrollTo(computeScrollTarget(steps[stepIdx].standings, steps[stepIdx].teamId));
        } else if (steps.length > 0) {
            setDisplayStandings(steps[steps.length - 1].standings);
            setFocusedTeamId(null);
            jumpScrollTo(0);
        }
        setRevealingProblemId(null);
        setMovingTeamId(null);
        setMovePixels(0);
        setDisplacedTeamIds(new Set());
        setDisplacedOffset(0);
        setLockedFocusedIdx(null);
    }, [frozenStandings, steps, computeScrollTarget, jumpScrollTo]);

    // Helper: interruptible delay
    const interruptibleDelay = useCallback((ms: number) => {
        return new Promise<void>((resolve) => {
            if (skipAnimRef.current) { resolve(); return; }
            const timer = setTimeout(() => { clearInterval(interval); resolve(); }, ms);
            const interval = setInterval(() => {
                if (skipAnimRef.current) {
                    clearTimeout(timer);
                    clearInterval(interval);
                    resolve();
                }
            }, 16);
        });
    }, []);

    // Animate a step forward
    const animateStepForward = useCallback(
        async (stepIdx: number) => {
            if (stepIdx >= steps.length || !contestData) return;

            const step = steps[stepIdx];
            setIsAnimating(true);
            setIsFinished(false);
            skipAnimRef.current = false;
            animatingStepRef.current = stepIdx;

            if (step.type === 'focus') {
                // Clear locks from previous move
                setLockedFocusedIdx(null);
                setFocusedTeamId(step.teamId);
                setDisplayStandings(step.standings);
                setCurrentStep(stepIdx);

                // Smooth scroll to show this team
                const target = computeScrollTarget(step.standings, step.teamId);
                smoothScrollTo(target);

                setIsAnimating(false);
                animatingStepRef.current = -1;
            } else if (step.type === 'reveal') {
                setFocusedTeamId(step.teamId);
                setRevealingProblemId(step.problemId || null);

                await interruptibleDelay(config.revealDuration);

                setDisplayStandings(step.standings);
                setRevealingProblemId(null);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
                animatingStepRef.current = -1;
            } else if (step.type === 'move') {
                // MOVE ANIMATION:
                //
                // displayStandings is in OLD order (team at fromIdx).
                // step.standings has NEW sorted order (team at toIdx).
                //
                // 1. Lock grey-out at current position
                // 2. Identify displaced teams (between toIdx and fromIdx-1)
                // 3. Animate: moving team slides UP, displaced teams slide DOWN
                // 4. After animation, swap to new standings

                const fromIdx = step.fromRank ?? 0;
                const toIdx = step.toRank ?? 0;

                // Measure actual pixel distance from DOM rather than assuming
                // uniform row heights. This handles focused-row styling differences.
                let movePixels = (fromIdx - toIdx) * rowHeight; // fallback
                if (bodyRef.current) {
                    const rows = bodyRef.current.querySelectorAll('.scoreboard-row');
                    if (rows[fromIdx] && rows[toIdx]) {
                        const fromTop = rows[fromIdx].getBoundingClientRect().top;
                        const toTop = rows[toIdx].getBoundingClientRect().top;
                        movePixels = fromTop - toTop;
                    }
                }

                // Lock grey-out
                const currentFocusIdx = displayStandings.findIndex(s => s.teamId === step.teamId);
                setLockedFocusedIdx(currentFocusIdx);

                // Identify displaced teams: those at indices [toIdx, fromIdx) in OLD order.
                // They each get pushed down by one row.
                const displaced = new Set<string>();
                for (let i = toIdx; i < fromIdx; i++) {
                    if (i < displayStandings.length && displayStandings[i].teamId !== step.teamId) {
                        displaced.add(displayStandings[i].teamId);
                    }
                }

                setFocusedTeamId(step.teamId);
                setMovingTeamId(step.teamId);
                setMovePixels(0);
                setDisplacedTeamIds(displaced);
                setDisplacedOffset(0);

                if (skipAnimRef.current) {
                    applyStepInstant(stepIdx);
                    setCurrentStep(stepIdx);
                    setIsAnimating(false);
                    animatingStepRef.current = -1;
                    return;
                }

                // Wait a frame for React to render at offset 0
                await new Promise((r) => setTimeout(r, 30));

                if (skipAnimRef.current) {
                    applyStepInstant(stepIdx);
                    setCurrentStep(stepIdx);
                    setIsAnimating(false);
                    animatingStepRef.current = -1;
                    return;
                }

                // Animate: team slides UP by measured pixel distance,
                // displaced teams slide DOWN by one row
                setMovePixels(-movePixels);
                setDisplacedOffset(1);

                // Wait for CSS transition to complete. Add buffer because
                // the transition starts after React renders (~30ms after we
                // set the offset), but the timer starts immediately.
                await interruptibleDelay(config.movementSpeed + 50);

                // Animation done: swap to final standings
                // Keep grey-out locked until next focus step
                setDisplayStandings(step.standings);
                setMovingTeamId(null);
                setMovePixels(0);
                setDisplacedTeamIds(new Set());
                setDisplacedOffset(0);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
                animatingStepRef.current = -1;
            }
        },
        [steps, contestData, config.revealDuration, config.movementSpeed,
            setCurrentStep, interruptibleDelay, applyStepInstant,
            displayStandings, computeScrollTarget, smoothScrollTo]
    );

    // Skip current animation
    const skipCurrentAnimation = useCallback(() => {
        if (!isAnimating || animatingStepRef.current < 0) return;
        skipAnimRef.current = true;
    }, [isAnimating]);

    // Step forward
    const stepForward = useCallback(() => {
        if (isAnimating) {
            skipCurrentAnimation();
            return;
        }
        const nextStep = currentStep + 1;
        if (nextStep < steps.length) {
            animateStepForward(nextStep);
        } else if (nextStep === steps.length && !isFinished) {
            if (steps.length > 0) {
                setDisplayStandings(steps[steps.length - 1].standings);
            }
            setFocusedTeamId(null);
            setRevealingProblemId(null);
            setLockedFocusedIdx(null);
            setIsFinished(true);
            setCurrentStep(steps.length);
            smoothScrollTo(0);
        }
    }, [currentStep, steps, isAnimating, isFinished, animateStepForward,
        skipCurrentAnimation, setCurrentStep, smoothScrollTo]);

    // Step backward
    const stepBackward = useCallback(() => {
        if (isAnimating) return;
        if (isFinished) {
            const lastStep = steps.length - 1;
            if (lastStep >= 0) {
                applyStepInstant(lastStep);
                setCurrentStep(lastStep);
            }
            setIsFinished(false);
            return;
        }
        const prevStep = currentStep - 1;
        if (prevStep >= -1) {
            applyStepInstant(prevStep);
            setCurrentStep(prevStep);
        }
    }, [currentStep, isAnimating, isFinished, steps, applyStepInstant, setCurrentStep]);

    // Autoplay logic
    useEffect(() => {
        if (isPlaying && !isAnimating) {
            const nextStep = currentStep + 1;

            if (nextStep > steps.length) {
                setIsPlaying(false);
                return;
            }

            if (nextStep === steps.length) {
                if (steps.length > 0) {
                    setDisplayStandings(steps[steps.length - 1].standings);
                }
                setFocusedTeamId(null);
                setRevealingProblemId(null);
                setLockedFocusedIdx(null);
                setIsFinished(true);
                setCurrentStep(steps.length);
                setIsPlaying(false);
                smoothScrollTo(0);
                return;
            }

            // Check if we should pause at this position
            const step = steps[nextStep];
            if (step.type === 'focus') {
                const teamPosition = displayStandings.findIndex(
                    (s) => s.teamId === step.teamId
                ) + 1;
                if (teamPosition > 0 && config.pauseAtRanks.includes(teamPosition)) {
                    setIsPlaying(false);
                    return;
                }
            }

            autoplayTimer.current = setTimeout(() => {
                animateStepForward(nextStep);
            }, config.autoplayPause);
        }

        return () => {
            if (autoplayTimer.current) {
                clearTimeout(autoplayTimer.current);
                autoplayTimer.current = null;
            }
        };
    }, [
        isPlaying, isAnimating, currentStep, steps, displayStandings,
        config.pauseAtRanks, config.autoplayPause, animateStepForward,
        setCurrentStep, smoothScrollTo,
    ]);

    // Toggle play/pause
    const togglePlay = useCallback(() => {
        setIsPlaying((prev) => !prev);
    }, []);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    stepForward();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (!isPlaying) stepBackward();
                    break;
                case 'Escape':
                    e.preventDefault();
                    setIsPlaying(false);
                    router.push('/');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, stepForward, stepBackward, togglePlay, router]);

    // Click to step forward
    const handleClick = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.status-badge')) return;
        if (!isPlaying) stepForward();
    }, [isPlaying, stepForward]);

    if (!isReady || !contestData) {
        return (
            <div className="scoreboard-loading">
                <p>Loading...</p>
            </div>
        );
    }

    // Focused index (for grey-out)
    const focusedIndex = focusedTeamId
        ? displayStandings.findIndex((s) => s.teamId === focusedTeamId)
        : -1;
    const effectiveFocusedIdx = lockedFocusedIdx !== null ? lockedFocusedIdx : focusedIndex;

    // Build team name lookup
    const teamNames = new Map<string, string>();
    for (const team of contestData.teams) {
        teamNames.set(team.id, team.display_name || team.name);
    }

    // Status display
    const stepDisplay = isFinished
        ? `Finished — ${steps.length} steps`
        : `Step ${Math.max(0, currentStep + 1)} / ${steps.length}`;

    // Viewport height for the overflow container
    const viewportHeight = visibleCount * rowHeight;

    return (
        <div className="scoreboard-page" onClick={handleClick} ref={containerRef}>
            {/* Contest title bar */}
            <div className="scoreboard-title-bar">
                <h1>{contestData.contest.formal_name || contestData.contest.name}</h1>
                <div className="scoreboard-controls-info">
                    <button
                        className={`status-badge ${isPlaying ? 'playing' : 'paused'}`}
                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    >
                        {isPlaying ? '⏸ Playing' : '▶ Paused'}
                    </button>
                    <span className="step-counter">{stepDisplay}</span>
                </div>
            </div>

            {/* Scoreboard */}
            <div className="scoreboard-container">
                <ScoreboardHeader problems={contestData.problems} />
                <div
                    className="scoreboard-viewport"
                    style={{ height: viewportHeight, overflow: 'hidden' }}
                >
                    <div
                        ref={bodyRef}
                        className="scoreboard-body"
                        style={{
                            transform: `translateY(${-scrollY}px)`,
                            transition: scrollTransition
                                ? `transform ${SCROLL_DURATION}ms ease-in-out`
                                : 'none',
                        }}
                    >
                        {displayStandings.map((standing, idx) => {
                            const isFocused = standing.teamId === focusedTeamId;
                            const isGreyedOut =
                                !isFinished &&
                                effectiveFocusedIdx >= 0 &&
                                idx > effectiveFocusedIdx &&
                                !movingTeamId;
                            const isMoving = standing.teamId === movingTeamId;
                            const isDisplaced = displacedTeamIds.has(standing.teamId);

                            const team = contestData.teams.find(
                                (t) => t.id === standing.teamId
                            );
                            const org = team?.organization_id
                                ? contestData.organizations.get(team.organization_id)
                                : undefined;

                            let rowStyle: React.CSSProperties = {};
                            if (isMoving) {
                                rowStyle = {
                                    transform: `translateY(${movePixels}px)`,
                                    transition: movePixels !== 0
                                        ? `transform ${config.movementSpeed}ms ease-in-out`
                                        : 'none',
                                    zIndex: 10,
                                    position: 'relative',
                                };
                            } else if (isDisplaced) {
                                rowStyle = {
                                    transform: `translateY(${displacedOffset * rowHeight}px)`,
                                    transition: displacedOffset !== 0
                                        ? `transform ${config.movementSpeed}ms ease-in-out`
                                        : 'none',
                                    position: 'relative',
                                };
                            }

                            return (
                                <ScoreboardRow
                                    key={standing.teamId}
                                    standing={standing}
                                    teamName={teamNames.get(standing.teamId) || 'Unknown'}
                                    organization={org}
                                    problems={contestData.problems}
                                    isFocused={isFocused}
                                    isGreyedOut={isGreyedOut}
                                    revealingProblemId={
                                        isFocused ? revealingProblemId : null
                                    }
                                    style={rowStyle}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Controls hint */}
            <div className="controls-hint">
                <span>Space: Play/Pause</span>
                <span>←→: Step</span>
                <span>Click: Step Forward</span>
                <span>Esc: Back</span>
            </div>
        </div>
    );
}
