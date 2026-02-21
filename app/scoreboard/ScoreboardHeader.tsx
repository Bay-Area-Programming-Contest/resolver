'use client';

import React from 'react';
import { Problem } from '@/lib/types';

/** Returns '#000000' or '#ffffff' depending on which has better contrast */
function contrastColor(hex: string): string {
    // Strip '#' and parse
    const cleaned = hex.replace(/^#/, '');
    if (cleaned.length < 6) return '#ffffff';
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
    // W3C perceived brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

interface ScoreboardHeaderProps {
    problems: Problem[];
}

export default function ScoreboardHeader({ problems }: ScoreboardHeaderProps) {
    return (
        <div className="scoreboard-header">
            <div className="header-rank">Rank</div>
            <div className="header-team">Team</div>
            <div className="header-score">Score</div>
            {problems.map((prob) => {
                const bg = prob.rgb || prob.color || '#666';
                return (
                    <div key={prob.id} className="header-problem">
                        <div
                            className="problem-label"
                            style={{
                                backgroundColor: bg,
                                color: contrastColor(bg),
                            }}
                        >
                            {prob.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
