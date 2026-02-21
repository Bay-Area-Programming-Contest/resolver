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
    const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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
                // Resuming — restore state from current step
                setDisplayStandings(steps[currentStep].standings);
                setFocusedTeamId(steps[currentStep].teamId);
            } else if (currentStep >= steps.length && steps.length > 0) {
                // Was finished — show final standings
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

    // Get the focused team based on current step
    const getFocusedTeamId = useCallback(
        (stepIndex: number): string | null => {
            if (stepIndex < 0 || stepIndex >= steps.length) return null;
            return steps[stepIndex].teamId;
        },
        [steps]
    );

    // Animate a step forward
    const animateStepForward = useCallback(
        async (stepIdx: number) => {
            if (stepIdx >= steps.length || !contestData) return;

            const step = steps[stepIdx];
            setIsAnimating(true);
            setIsFinished(false);

            if (step.type === 'focus') {
                // Focus step: highlight the team
                setFocusedTeamId(step.teamId);
                setDisplayStandings(step.standings);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
            } else if (step.type === 'reveal') {
                // Reveal step: show the result with animation
                setFocusedTeamId(step.teamId);
                setRevealingProblemId(step.problemId || null);

                await new Promise((r) => setTimeout(r, config.revealDuration));

                setDisplayStandings(step.standings);
                setRevealingProblemId(null);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
            } else if (step.type === 'move') {
                // Move step: animate the team moving up
                //
                // Strategy:
                // 1. Update standings to new order immediately
                // 2. Apply a positive translateY offset to push the team
                //    back to its OLD visual position
                // 3. Animate the offset to 0 so the team slides to its new spot
                const rowsToMove = (step.fromRank ?? 0) - (step.toRank ?? 0);

                setFocusedTeamId(step.teamId);
                setMovingTeamId(step.teamId);
                setDisplayStandings(step.standings); // New order
                setMoveOffset(rowsToMove); // Offset back to old visual position

                // Wait a frame for React to render with the offset
                await new Promise((r) => setTimeout(r, 50));
                setMoveOffset(0); // Animate to final position

                await new Promise((r) => setTimeout(r, config.movementSpeed));

                setMovingTeamId(null);
                setMoveOffset(0);
                setCurrentStep(stepIdx);
                setIsAnimating(false);
            }
        },
        [steps, contestData, config.revealDuration, config.movementSpeed, setCurrentStep]
    );

    // Step forward
    const stepForward = useCallback(() => {
        if (isAnimating) return;
        const nextStep = currentStep + 1;
        if (nextStep < steps.length) {
            animateStepForward(nextStep);
        } else if (nextStep === steps.length && !isFinished) {
            // Show final resolved scoreboard
            if (steps.length > 0) {
                setDisplayStandings(steps[steps.length - 1].standings);
            }
            setFocusedTeamId(null);
            setRevealingProblemId(null);
            setIsFinished(true);
            setCurrentStep(steps.length);
        }
    }, [currentStep, steps, isAnimating, isFinished, animateStepForward, setCurrentStep]);

    // Step backward
    const stepBackward = useCallback(() => {
        if (isAnimating) return;
        if (isFinished) {
            // Go back from finished state to last step
            const lastStep = steps.length - 1;
            if (lastStep >= 0) {
                setDisplayStandings(steps[lastStep].standings);
                setFocusedTeamId(steps[lastStep].teamId);
                setCurrentStep(lastStep);
            }
            setIsFinished(false);
            return;
        }
        const prevStep = currentStep - 1;
        if (prevStep >= -1) {
            const standings = getCurrentStandings(prevStep);
            setDisplayStandings(standings);
            setCurrentStep(prevStep);
            setFocusedTeamId(getFocusedTeamId(prevStep));
            setRevealingProblemId(null);
            setMovingTeamId(null);
        }
    }, [currentStep, isAnimating, isFinished, steps, getCurrentStandings, setCurrentStep, getFocusedTeamId]);

    // Autoplay logic
    useEffect(() => {
        if (isPlaying && !isAnimating) {
            const nextStep = currentStep + 1;

            if (nextStep > steps.length) {
                // Past the final state
                setIsPlaying(false);
                return;
            }

            if (nextStep === steps.length) {
                // Advance to finished state
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

            // Check if we should pause at this rank
            const step = steps[nextStep];
            if (step.type === 'focus') {
                const teamStanding = displayStandings.find(
                    (s) => s.teamId === step.teamId
                );
                if (teamStanding && config.pauseAtRanks.includes(teamStanding.rank)) {
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
        isPlaying,
        isAnimating,
        currentStep,
        steps,
        displayStandings,
        config.pauseAtRanks,
        config.autoplayPause,
        animateStepForward,
        setCurrentStep,
    ]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    setIsPlaying((prev) => !prev);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (!isPlaying) stepForward();
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
    }, [isPlaying, stepForward, stepBackward, router]);

    // Click to step forward
    const handleClick = useCallback(() => {
        if (!isPlaying) stepForward();
    }, [isPlaying, stepForward]);

    if (!isReady || !contestData) {
        return (
            <div className="scoreboard-loading">
                <p>Loading...</p>
            </div>
        );
    }

    // Compute visible teams based on container height
    const rowHeight = 48;
    const headerHeight = 56;
    const containerHeight =
        typeof window !== 'undefined' ? window.innerHeight - headerHeight : 800;
    const visibleCount = Math.floor(containerHeight / rowHeight);

    // Find focused team index in displayStandings
    const focusedIndex = focusedTeamId
        ? displayStandings.findIndex((s) => s.teamId === focusedTeamId)
        : -1;

    // Calculate viewport window
    let startIdx = 0;
    if (focusedIndex >= 0) {
        const targetPosition = visibleCount - 2;
        startIdx = Math.max(0, focusedIndex - targetPosition);
        startIdx = Math.min(startIdx, Math.max(0, displayStandings.length - visibleCount));
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
                    {isPlaying ? (
                        <span className="status-badge playing">⏸ Playing</span>
                    ) : (
                        <span className="status-badge paused">▶ Paused</span>
                    )}
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
                        // Only grey out teams below the focused team, and NOT during
                        // a move animation (where positions are shifting)
                        const isGreyedOut =
                            !isFinished &&
                            focusedIndex >= 0 &&
                            globalIdx > focusedIndex &&
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
                                transition: moveOffset === 0
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
