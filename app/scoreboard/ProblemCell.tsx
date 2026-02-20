'use client';

import React from 'react';
import { ProblemResult, Problem } from '@/lib/types';

interface ProblemCellProps {
    result: ProblemResult;
    problem: Problem;
    isRevealing: boolean;
    isHighlighted: boolean;
}

export default function ProblemCell({
    result,
    problem,
    isRevealing,
    isHighlighted,
}: ProblemCellProps) {
    let cellClass = 'problem-cell';
    let content: React.ReactNode = null;

    if (result.solved) {
        cellClass += ' cell-solved';
        content = (
            <>
                <span className="cell-time">{result.time}</span>
                <span className="cell-tries">
                    {result.numJudged === 1
                        ? '1 try'
                        : `${result.numJudged} tries`}
                </span>
            </>
        );
    } else if (result.numPending > 0) {
        cellClass += ' cell-pending';
        content = (
            <span className="cell-pending-icon">?</span>
        );
    } else if (result.numJudged > 0) {
        cellClass += ' cell-failed';
        content = (
            <span className="cell-tries">
                {result.numJudged === 1
                    ? '1 try'
                    : `${result.numJudged} tries`}
            </span>
        );
    } else {
        cellClass += ' cell-empty';
    }

    if (isRevealing) {
        cellClass += ' cell-revealing';
    }
    if (isHighlighted) {
        cellClass += ' cell-highlighted';
    }

    return <div className={cellClass}>{content}</div>;
}
