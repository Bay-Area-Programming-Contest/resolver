'use client';

import React from 'react';
import { TeamStanding, Problem, Organization } from '@/lib/types';
import ProblemCell from './ProblemCell';

interface ScoreboardRowProps {
    standing: TeamStanding;
    teamName: string;
    organization?: Organization;
    problems: Problem[];
    isFocused: boolean;
    isGreyedOut: boolean;
    revealingProblemId: string | null;
    style?: React.CSSProperties;
}

export default function ScoreboardRow({
    standing,
    teamName,
    organization,
    problems,
    isFocused,
    isGreyedOut,
    revealingProblemId,
    style,
}: ScoreboardRowProps) {
    let rowClass = 'scoreboard-row';
    if (isFocused) rowClass += ' row-focused';
    if (isGreyedOut) rowClass += ' row-greyed';

    return (
        <div className={rowClass} style={style}>
            <div className="row-rank">{standing.rank}</div>
            <div className="row-team">
                <span className="team-name">{teamName}</span>
                {organization && (
                    <span className="team-org">{organization.formal_name || organization.name}</span>
                )}
            </div>
            <div className="row-score">
                <span className="score-solved">{standing.score.numSolved}</span>
                <span className="score-penalty">{standing.score.totalTime}</span>
            </div>
            {problems.map((prob) => {
                const result = standing.problems.find((p) => p.problemId === prob.id);
                if (!result) return <div key={prob.id} className="problem-cell cell-empty" />;
                return (
                    <ProblemCell
                        key={prob.id}
                        result={result}
                        problem={prob}
                        isRevealing={revealingProblemId === prob.id}
                        isHighlighted={isFocused && revealingProblemId === prob.id}
                    />
                );
            })}
        </div>
    );
}
