'use client';

import React from 'react';
import { Problem } from '@/lib/types';

interface ScoreboardHeaderProps {
    problems: Problem[];
}

export default function ScoreboardHeader({ problems }: ScoreboardHeaderProps) {
    return (
        <div className="scoreboard-header">
            <div className="header-rank">Rank</div>
            <div className="header-team">Team</div>
            <div className="header-score">Score</div>
            {problems.map((prob) => (
                <div key={prob.id} className="header-problem">
                    <div
                        className="problem-label"
                        style={{
                            backgroundColor: prob.rgb || prob.color || '#666',
                        }}
                    >
                        {prob.label}
                    </div>
                </div>
            ))}
        </div>
    );
}
