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
}

interface ResolverContextType extends ResolverState {
    setConfig: (config: ResolverConfig) => void;
    loadFeed: (feedText: string, config: ResolverConfig) => void;
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
    });

    const setConfig = useCallback((config: ResolverConfig) => {
        setState((prev) => ({ ...prev, config }));
    }, []);

    const loadFeed = useCallback((feedText: string, config: ResolverConfig) => {
        setState((prev) => {
            const contestData = parseFeed(feedText);
            const { frozenStandings, steps } = computeResolverSteps(
                contestData,
                config
            );
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
        });
    }, []);

    return (
        <ResolverContext.Provider
            value={{
                ...state,
                setConfig,
                loadFeed,
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
