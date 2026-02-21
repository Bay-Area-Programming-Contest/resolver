'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useResolver } from '../ResolverContext';
import { TeamStanding } from '@/lib/types';
import ScoreboardHeader from './ScoreboardHeader';
import ScoreboardRow from './ScoreboardRow';

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
    const [moveOffset, setMoveOffset] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    // Locked viewport start index during move animations
    const [lockedStartIdx, setLockedStartIdx] = useState<number | null>(null);
    // Locked focused index during move animations (for grey-out)
    const [lockedFocusedIdx, setLockedFocusedIdx] = useState<number | null>(null);
    const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Ref used to signal an animation should be skipped
    const skipAnimRef = useRef(false);
    // Ref tracking which step is currently animating
    const animatingStepRef = useRef(-1);

    // Redirect if no data
    useEffect(() => {
        if (!isReady || !contestData) {
            router.push('/');
        }
    }, [isReady, contestData, router]);

    // Initialize display standings from current step (handles resume after exit)
    useEffect(() => {
        if (frozenStandings.length > 0 && displayStandings.length === 0) {
            if (currentStep >= 0 && currentStep < steps.length) {
                setDisplayStandings(steps[currentStep].standings);
                setFocusedTeamId(steps[currentStep].teamId);
            } else if (currentStep >= steps.length && steps.length > 0) {
                setDisplayStandings(steps[steps.length - 1].standings);
                setIsFinished(true);
            } else {
                setDisplayStandings(frozenStandings);
            }
        }
    }, [frozenStandings, displayStandings.length, currentStep, steps]);

    // Get current standings based on step
    const getCurrentStandings = useCallback(
        (stepIndex: number): TeamStanding[] => {
            if (stepIndex < 0 || steps.length === 0) return frozenStandings;
            if (stepIndex >= steps.length) return steps[steps.length - 1].standings;
            return steps[stepIndex].standings;
        },
        [frozenStandings, steps]
    );

    // Apply step result instantly (used for skip and step backward)
    const applyStepInstant = useCallback((stepIdx: number) => {
        if (stepIdx < 0) {
            setDisplayStandings(frozenStandings);
            setFocusedTeamId(null);
        } else if (stepIdx < steps.length) {
            setDisplayStandings(steps[stepIdx].standings);
            setFocusedTeamId(steps[stepIdx].teamId);
        } else if (steps.length > 0) {
            setDisplayStandings(steps[steps.length - 1].standings);
            setFocusedTeamId(null);
        }
        setRevealingProblemId(null);
        setMovingTeamId(null);
        setMoveOffset(0);
        setLockedStartIdx(null);
        setLockedFocusedIdx(null);
    }, [frozenStandings, steps]);

    // Helper: interruptible delay — resolves immediately if skipAnimRef is set
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

    // Compute viewport parameters (extracted so we can lock them)
    const rowHeight = 48;
    const headerHeight = 56;
    const containerHeight =
        typeof window !== 'undefined' ? window.innerHeight - headerHeight : 800;
    const visibleCount = Math.floor(containerHeight / rowHeight);

    const computeStartIdx = useCallback((standings: TeamStanding[], focused: string | null) => {
        const focusIdx = focused
            ? standings.findIndex((s) => s.teamId === focused)
            : -1;
        let idx = 0;
        if (focusIdx >= 0) {
            const targetPosition = visibleCount - 2;
            idx = Math.max(0, focusIdx - targetPosition);
            idx = Math.min(idx, Math.max(0, standings.length - visibleCount));
        }
        return idx;
    }, [visibleCount]);

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
                // Clear any viewport/grey-out locks from a preceding move step
                setLockedStartIdx(null);
                setLockedFocusedIdx(null);
                setFocusedTeamId(step.teamId);
                setDisplayStandings(step.standings);
                setCurrentStep(stepIdx);
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
                // MOVE ANIMATION STRATEGY:
                //
                // The resolver now keeps reveal steps in the OLD array order
                // (only updating scores in-place). So displayStandings already
                // has the team at its old position with updated scores.
                //
                // We just need to:
                // 1. Lock the viewport and grey-out so nothing shifts during animation
                // 2. Animate the team sliding UP via translateY
                // 3. After animation, swap to the move step's standings (re-sorted)
                //
                // fromRank and toRank are 0-indexed array indices.

                const fromIdx = step.fromRank ?? 0;
                const toIdx = step.toRank ?? 0;
                const rowsToMove = fromIdx - toIdx; // positive = moving up

                // Lock viewport and grey-out at current state
                const currentFocusIdx = displayStandings.findIndex(s => s.teamId === step.teamId);
                const currentSIdx = computeStartIdx(displayStandings, step.teamId);
                setLockedStartIdx(currentSIdx);
                setLockedFocusedIdx(currentFocusIdx);

                // displayStandings already has old order — just set animation state
                setFocusedTeamId(step.teamId);
                setMovingTeamId(step.teamId);
                setMoveOffset(0);

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

                // Animate: slide team UP by rowsToMove positions
                setMoveOffset(-rowsToMove);

                await interruptibleDelay(config.movementSpeed);

                // Animation done: swap to final standings (re-sorted).
                // Keep viewport/grey-out LOCKED — they'll be cleared by the
                // next focus step, preventing a brief viewport jump to the
                // moved team's new position.
                setDisplayStandings(step.standings);
                setMovingTeamId(null);
                setMoveOffset(0);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
                animatingStepRef.current = -1;
            }
        },
        [steps, contestData, config.revealDuration, config.movementSpeed,
            setCurrentStep, interruptibleDelay, applyStepInstant, displayStandings, computeStartIdx]
    );

    // Skip current animation and apply step instantly
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
            setLockedStartIdx(null);
            setLockedFocusedIdx(null);
            setIsFinished(true);
            setCurrentStep(steps.length);
        }
    }, [currentStep, steps, isAnimating, isFinished, animateStepForward, skipCurrentAnimation, setCurrentStep]);

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
                setIsFinished(true);
                setCurrentStep(steps.length);
                setIsPlaying(false);
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
        config.pauseAtRanks, config.autoplayPause, animateStepForward, setCurrentStep,
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

    // Compute focused index
    const focusedIndex = focusedTeamId
        ? displayStandings.findIndex((s) => s.teamId === focusedTeamId)
        : -1;

    // Use locked values during move animation, otherwise compute dynamically
    const effectiveFocusedIdx = lockedFocusedIdx !== null ? lockedFocusedIdx : focusedIndex;

    let startIdx = 0;
    if (lockedStartIdx !== null) {
        startIdx = lockedStartIdx;
    } else {
        startIdx = computeStartIdx(displayStandings, focusedTeamId);
    }

    const visibleStandings = displayStandings.slice(
        startIdx,
        startIdx + visibleCount
    );

    // Build a team name lookup
    const teamNames = new Map<string, string>();
    for (const team of contestData.teams) {
        teamNames.set(team.id, team.display_name || team.name);
    }

    // Status display
    const stepDisplay = isFinished
        ? `Finished — ${steps.length} steps`
        : `Step ${Math.max(0, currentStep + 1)} / ${steps.length}`;

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
                <div className="scoreboard-body">
                    {visibleStandings.map((standing, idx) => {
                        const globalIdx = startIdx + idx;
                        const isFocused = standing.teamId === focusedTeamId;
                        // Grey out teams below the focused team.
                        // Use locked focused index during move animations.
                        const isGreyedOut =
                            !isFinished &&
                            effectiveFocusedIdx >= 0 &&
                            globalIdx > effectiveFocusedIdx &&
                            !movingTeamId;
                        const isMoving = standing.teamId === movingTeamId;

                        const team = contestData.teams.find(
                            (t) => t.id === standing.teamId
                        );
                        const org = team?.organization_id
                            ? contestData.organizations.get(team.organization_id)
                            : undefined;

                        const moveStyle: React.CSSProperties = isMoving
                            ? {
                                transform: `translateY(${moveOffset * rowHeight}px)`,
                                transition: moveOffset !== 0
                                    ? `transform ${config.movementSpeed}ms ease-in-out`
                                    : 'none',
                                zIndex: 10,
                                position: 'relative',
                            }
                            : {};

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
                                style={moveStyle}
                            />
                        );
                    })}
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
