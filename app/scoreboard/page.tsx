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
    const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Redirect if no data
    useEffect(() => {
        if (!isReady || !contestData) {
            router.push('/');
        }
    }, [isReady, contestData, router]);

    // Initialize display standings
    useEffect(() => {
        if (frozenStandings.length > 0 && displayStandings.length === 0) {
            setDisplayStandings(frozenStandings);
        }
    }, [frozenStandings, displayStandings.length]);

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
                setFocusedTeamId(step.teamId);
                setMovingTeamId(step.teamId);

                // Calculate rows to move
                const rowsToMove = (step.fromRank ?? 0) - (step.toRank ?? 0);
                setMoveOffset(-rowsToMove);

                await new Promise((r) => setTimeout(r, 50)); // Let CSS pick up the state
                setMoveOffset(0); // Animate to final position

                await new Promise((r) => setTimeout(r, config.movementSpeed));

                setDisplayStandings(step.standings);
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
        }
    }, [currentStep, steps.length, isAnimating, animateStepForward]);

    // Step backward
    const stepBackward = useCallback(() => {
        if (isAnimating) return;
        const prevStep = currentStep - 1;
        if (prevStep >= -1) {
            const standings = getCurrentStandings(prevStep);
            setDisplayStandings(standings);
            setCurrentStep(prevStep);
            setFocusedTeamId(getFocusedTeamId(prevStep));
            setRevealingProblemId(null);
            setMovingTeamId(null);
        }
    }, [currentStep, isAnimating, getCurrentStandings, setCurrentStep, getFocusedTeamId]);

    // Autoplay logic
    useEffect(() => {
        if (isPlaying && !isAnimating) {
            const nextStep = currentStep + 1;
            if (nextStep >= steps.length) {
                setIsPlaying(false);
                return;
            }

            // Check if we should pause at this rank
            const step = steps[nextStep];
            if (step.type === 'focus') {
                // Find the rank of this team in current standings
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
    // The focused team should be second from bottom
    const rowHeight = 48; // Approximate row height in px
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
        // Focused team should be second from bottom
        const targetPosition = visibleCount - 2;
        startIdx = Math.max(0, focusedIndex - targetPosition);
        // Make sure we don't go past the end
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

    return (
        <div className="scoreboard-page" onClick={handleClick} ref={containerRef}>
            {/* Contest title bar */}
            <div className="scoreboard-title-bar">
                <h1>{contestData.contest.formal_name || contestData.contest.name}</h1>
                <div className="scoreboard-controls-info">
                    {isPlaying ? (
                        <span className="status-badge playing">▶ Playing</span>
                    ) : (
                        <span className="status-badge paused">⏸ Paused</span>
                    )}
                    <span className="step-counter">
                        Step {Math.max(0, currentStep + 1)} / {steps.length}
                    </span>
                </div>
            </div>

            {/* Scoreboard */}
            <div className="scoreboard-container">
                <ScoreboardHeader problems={contestData.problems} />
                <div className="scoreboard-body">
                    {visibleStandings.map((standing, idx) => {
                        const globalIdx = startIdx + idx;
                        const isFocused = standing.teamId === focusedTeamId;
                        const isGreyedOut =
                            focusedIndex >= 0 && globalIdx > focusedIndex;
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
