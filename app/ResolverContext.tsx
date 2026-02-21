'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ContestData, ResolverConfig, ResolverStep, TeamStanding, DEFAULT_CONFIG } from '@/lib/types';
import { parseFeed } from '@/lib/feedParser';
import { computeResolverSteps } from '@/lib/resolver';

interface ResolverState {
    contestData: ContestData | null;
    config: ResolverConfig;
    steps: ResolverStep[];
    frozenStandings: TeamStanding[];
    currentStep: number;
    isReady: boolean;
    feedText: string | null;
    hasFrozenPeriod: boolean;
}

interface ResolverContextType extends ResolverState {
    setConfig: (config: ResolverConfig) => void;
    loadFeed: (feedText: string, config: ResolverConfig) => void;
    recomputeWithConfig: (config: ResolverConfig) => void;
    invalidateFeed: () => void;
    setCurrentStep: (step: number) => void;
    reset: () => void;
}

const ResolverContext = createContext<ResolverContextType | null>(null);

export function ResolverProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<ResolverState>({
        contestData: null,
        config: { ...DEFAULT_CONFIG },
        steps: [],
        frozenStandings: [],
        currentStep: -1,
        isReady: false,
        feedText: null,
        hasFrozenPeriod: true,
    });

    const setConfig = useCallback((config: ResolverConfig) => {
        setState((prev) => ({ ...prev, config }));
    }, []);

    const loadFeed = useCallback((feedText: string, config: ResolverConfig) => {
        const contestData = parseFeed(feedText);
        const hasFrozenPeriod = !!contestData.contest.scoreboard_freeze_duration;
        const { frozenStandings, steps } = computeResolverSteps(contestData, config);
        setState((prev) => ({
            ...prev,
            config,
            contestData,
            feedText,
            frozenStandings,
            steps,
            currentStep: -1,
            isReady: true,
            hasFrozenPeriod,
        }));
    }, []);

    const recomputeWithConfig = useCallback((config: ResolverConfig) => {
        setState((prev) => {
            if (!prev.feedText) return prev;
            const contestData = parseFeed(prev.feedText);
            const { frozenStandings, steps } = computeResolverSteps(contestData, config);
            return {
                ...prev,
                config,
                contestData,
                frozenStandings,
                steps,
                currentStep: -1,
                isReady: true,
            };
        });
    }, []);

    const invalidateFeed = useCallback(() => {
        setState((prev) => ({
            ...prev,
            contestData: null,
            feedText: null,
            steps: [],
            frozenStandings: [],
            currentStep: -1,
            isReady: false,
            hasFrozenPeriod: true,
        }));
    }, []);

    const setCurrentStep = useCallback((step: number) => {
        setState((prev) => ({ ...prev, currentStep: step }));
    }, []);

    const reset = useCallback(() => {
        setState({
            contestData: null,
            config: { ...DEFAULT_CONFIG },
            steps: [],
            frozenStandings: [],
            currentStep: -1,
            isReady: false,
            feedText: null,
            hasFrozenPeriod: true,
        });
    }, []);

    return (
        <ResolverContext.Provider
            value={{
                ...state,
                setConfig,
                loadFeed,
                recomputeWithConfig,
                invalidateFeed,
                setCurrentStep,
                reset,
            }}
        >
            {children}
        </ResolverContext.Provider>
    );
}

export function useResolver() {
    const context = useContext(ResolverContext);
    if (!context) {
        throw new Error('useResolver must be used within a ResolverProvider');
    }
    return context;
}
