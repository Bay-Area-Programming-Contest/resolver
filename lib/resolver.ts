import {
    ContestData,
    ResolverConfig,
    ResolverStep,
    TeamStanding,
    ProblemResult,
    Submission,
    Judgement,
} from './types';

/**
 * Parse a CCS relative time string like "4:13:07.832" into total minutes.
 */
export function parseRelTime(relTime: string): number {
    const parts = relTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2] || '0');
    return hours * 60 + minutes + seconds / 60;
}

/**
 * Parse a relative time string into total seconds.
 */
function parseRelTimeSeconds(relTime: string): number {
    const parts = relTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2] || '0');
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get the final judgement for a submission (latest judgement with a type).
 */
function getFinalJudgement(
    submissionId: string,
    judgementsBySubmission: Map<string, Judgement[]>
): Judgement | null {
    const judgs = judgementsBySubmission.get(submissionId);
    if (!judgs || judgs.length === 0) return null;
    // Return the last judgement that has a type (completed judgement)
    for (let i = judgs.length - 1; i >= 0; i--) {
        if (judgs[i].judgement_type_id !== null) {
            return judgs[i];
        }
    }
    return null;
}

/**
 * Compute team standings from a set of submissions and judgements.
 */
function computeStandings(
    data: ContestData,
    submissions: Submission[],
    judgementsBySubmission: Map<string, Judgement[]>,
    pendingSubmissions: Set<string> // submission IDs that are "pending" (frozen)
): TeamStanding[] {
    const penaltyTime = data.contest.penalty_time ?? 20;

    // Group submissions by team and problem
    const teamProblemSubs = new Map<string, Map<string, Submission[]>>();
    for (const team of data.teams) {
        teamProblemSubs.set(team.id, new Map());
        for (const prob of data.problems) {
            teamProblemSubs.get(team.id)!.set(prob.id, []);
        }
    }

    for (const sub of submissions) {
        const teamSubs = teamProblemSubs.get(sub.team_id);
        if (!teamSubs) continue;
        const probSubs = teamSubs.get(sub.problem_id);
        if (probSubs) {
            probSubs.push(sub);
        }
    }

    const standings: TeamStanding[] = [];

    for (const team of data.teams) {
        const problemResults: ProblemResult[] = [];
        let totalSolved = 0;
        let totalPenalty = 0;

        for (const prob of data.problems) {
            const subs = teamProblemSubs.get(team.id)?.get(prob.id) || [];
            // Sort by contest_time
            subs.sort(
                (a, b) =>
                    parseRelTimeSeconds(a.contest_time) -
                    parseRelTimeSeconds(b.contest_time)
            );

            let solved = false;
            let solveTime = -1;
            let numJudged = 0;
            let numPending = 0;
            let wrongAttempts = 0;

            for (const sub of subs) {
                if (pendingSubmissions.has(sub.id)) {
                    numPending++;
                    continue;
                }

                const judgement = getFinalJudgement(sub.id, judgementsBySubmission);
                if (!judgement || judgement.judgement_type_id === null) {
                    // No completed judgement yet, treat as pending
                    numPending++;
                    continue;
                }

                numJudged++;
                const jType = data.judgementTypes.get(judgement.judgement_type_id);
                if (!jType) continue;

                if (jType.solved) {
                    if (!solved) {
                        solved = true;
                        solveTime = Math.floor(parseRelTime(sub.contest_time));
                        totalSolved++;
                        totalPenalty += solveTime + wrongAttempts * penaltyTime;
                    }
                    // Once solved, ignore subsequent submissions
                    break;
                } else if (jType.penalty) {
                    wrongAttempts++;
                }
            }

            problemResults.push({
                problemId: prob.id,
                numJudged,
                numPending,
                solved,
                time: solveTime >= 0 ? solveTime : 0,
                firstSolveTime: solveTime,
            });
        }

        standings.push({
            teamId: team.id,
            rank: 0, // computed after sorting
            score: {
                numSolved: totalSolved,
                totalTime: totalPenalty,
            },
            problems: problemResults,
        });
    }

    // Sort and assign ranks
    return rankStandings(standings);
}

/**
 * Sort standings by score and assign ranks.
 */
function rankStandings(standings: TeamStanding[]): TeamStanding[] {
    standings.sort((a, b) => {
        // More solved problems first
        if (a.score.numSolved !== b.score.numSolved) {
            return b.score.numSolved - a.score.numSolved;
        }
        // Less penalty time first
        return a.score.totalTime - b.score.totalTime;
    });

    for (let i = 0; i < standings.length; i++) {
        if (
            i > 0 &&
            standings[i].score.numSolved === standings[i - 1].score.numSolved &&
            standings[i].score.totalTime === standings[i - 1].score.totalTime
        ) {
            standings[i].rank = standings[i - 1].rank;
        } else {
            standings[i].rank = i + 1;
        }
    }

    return standings;
}

/**
 * Deep clone standings array.
 */
function cloneStandings(standings: TeamStanding[]): TeamStanding[] {
    return standings.map((s) => ({
        ...s,
        score: { ...s.score },
        problems: s.problems.map((p) => ({ ...p })),
    }));
}

/**
 * Compute the resolver steps from contest data and configuration.
 *
 * Algorithm:
 * 1. Determine the freeze time
 * 2. Compute the frozen scoreboard (only non-frozen submissions)
 * 3. Starting from the lowest-ranked team, reveal each pending problem
 * 4. After each reveal, check if the team's rank changes
 * 5. If it does, create a movement step and continue from the next team
 */
export function computeResolverSteps(
    data: ContestData,
    config: ResolverConfig
): { frozenStandings: TeamStanding[]; steps: ResolverStep[] } {
    // Determine freeze time in seconds
    let freezeTimeSeconds: number;
    if (config.startTime) {
        freezeTimeSeconds = parseRelTimeSeconds(config.startTime);
    } else if (data.contest.scoreboard_freeze_duration) {
        const durationSeconds = parseRelTimeSeconds(data.contest.duration);
        const freezeDurationSeconds = parseRelTimeSeconds(
            data.contest.scoreboard_freeze_duration
        );
        freezeTimeSeconds = durationSeconds - freezeDurationSeconds;
    } else {
        // No freeze info — use contest duration (all results visible)
        freezeTimeSeconds = parseRelTimeSeconds(data.contest.duration);
    }

    // Build judgement index by submission
    const judgementsBySubmission = new Map<string, Judgement[]>();
    for (const j of data.judgements) {
        if (!judgementsBySubmission.has(j.submission_id)) {
            judgementsBySubmission.set(j.submission_id, []);
        }
        judgementsBySubmission.get(j.submission_id)!.push(j);
    }

    // Separate submissions into pre-freeze and frozen
    const contestDurationSeconds = parseRelTimeSeconds(data.contest.duration);
    const preFreezeSubmissions: Submission[] = [];
    const frozenSubmissions: Submission[] = [];

    for (const sub of data.submissions) {
        const subTimeSeconds = parseRelTimeSeconds(sub.contest_time);
        // Only include submissions within the contest duration
        if (subTimeSeconds > contestDurationSeconds) continue;

        if (subTimeSeconds < freezeTimeSeconds) {
            preFreezeSubmissions.push(sub);
        } else {
            frozenSubmissions.push(sub);
        }
    }

    // Identify which frozen submissions are pending (have a judgement we haven't revealed yet)
    const pendingSubmissionIds = new Set<string>();
    for (const sub of frozenSubmissions) {
        const judgement = getFinalJudgement(sub.id, judgementsBySubmission);
        if (judgement && judgement.judgement_type_id !== null) {
            pendingSubmissionIds.add(sub.id);
        }
    }

    // Compute the frozen scoreboard
    const allSubmissions = [...preFreezeSubmissions, ...frozenSubmissions];
    const frozenStandings = computeStandings(
        data,
        allSubmissions,
        judgementsBySubmission,
        pendingSubmissionIds
    );

    // Now, generate resolver steps
    const steps: ResolverStep[] = [];
    let currentStandings = cloneStandings(frozenStandings);
    // displayOrder tracks the array order for step standings.
    // Reveal steps keep this order (only update scores in-place).
    // Move steps re-sort to the new order.
    let displayOrder = cloneStandings(frozenStandings);

    // Build a map of pending submissions per team per problem
    // Sorted by contest_time
    const pendingByTeamProblem = new Map<string, Map<string, Submission[]>>();
    for (const sub of frozenSubmissions) {
        if (!pendingSubmissionIds.has(sub.id)) continue;
        if (!pendingByTeamProblem.has(sub.team_id)) {
            pendingByTeamProblem.set(sub.team_id, new Map());
        }
        const teamMap = pendingByTeamProblem.get(sub.team_id)!;
        if (!teamMap.has(sub.problem_id)) {
            teamMap.set(sub.problem_id, []);
        }
        teamMap.get(sub.problem_id)!.push(sub);
    }

    // Sort pending submissions per problem by contest_time
    for (const teamMap of pendingByTeamProblem.values()) {
        for (const subs of teamMap.values()) {
            subs.sort(
                (a, b) =>
                    parseRelTimeSeconds(a.contest_time) -
                    parseRelTimeSeconds(b.contest_time)
            );
        }
    }

    // Track which submissions have been revealed
    const revealedSubmissions = new Set<string>();

    /**
     * Update displayOrder in-place: copy the team's latest score and problem
     * results from `currentStandings` (which is properly sorted/scored) into
     * `displayOrder` (which preserves the visual array order).
     */
    function syncDisplayOrder() {
        for (let i = 0; i < displayOrder.length; i++) {
            const updated = currentStandings.find(
                (s) => s.teamId === displayOrder[i].teamId
            );
            if (updated) {
                displayOrder[i] = { ...updated };
            }
        }
    }

    // Process from lowest rank to highest
    // We walk through teams starting from the bottom of the standings
    // teamIndex is the position in displayOrder
    let teamIndex = displayOrder.length - 1;

    while (teamIndex >= 0) {
        const teamStanding = displayOrder[teamIndex];
        const teamId = teamStanding.teamId;

        // Check if this team has any pending problems
        const teamPending = pendingByTeamProblem.get(teamId);
        if (!teamPending || teamPending.size === 0) {
            teamIndex--;
            continue;
        }

        // Check if there's any unrevealed pending for this team
        let hasPending = false;
        for (const prob of data.problems) {
            const subs = teamPending.get(prob.id);
            if (subs) {
                for (const sub of subs) {
                    if (!revealedSubmissions.has(sub.id)) {
                        hasPending = true;
                        break;
                    }
                }
            }
            if (hasPending) break;
        }

        if (!hasPending) {
            teamIndex--;
            continue;
        }

        // Add a focus step for this team
        steps.push({
            type: 'focus',
            teamId,
            standings: cloneStandings(displayOrder),
        });

        // Reveal pending problems for this team, left to right (by problem ordinal)
        let rankChanged = false;
        for (const prob of data.problems) {
            const subs = teamPending.get(prob.id);
            if (!subs) continue;

            const unrevealed = subs.filter((s) => !revealedSubmissions.has(s.id));
            if (unrevealed.length === 0) continue;

            // Get the previous result for this problem
            const prevResultIndex = teamStanding.problems.findIndex(
                (p) => p.problemId === prob.id
            );
            const prevResult = { ...teamStanding.problems[prevResultIndex] };

            // If already solved before freeze, skip
            if (prevResult.solved) continue;

            // Reveal all pending submissions for this problem at once
            for (const sub of unrevealed) {
                revealedSubmissions.add(sub.id);
            }

            // Recompute fully-sorted standings with newly revealed submissions
            const newPending = new Set(pendingSubmissionIds);
            for (const revId of revealedSubmissions) {
                newPending.delete(revId);
            }

            currentStandings = computeStandings(
                data,
                allSubmissions,
                judgementsBySubmission,
                newPending
            );

            // Update displayOrder scores in-place (keeping old array order)
            syncDisplayOrder();

            // Find the new result for this team+problem
            const newTeamStanding = displayOrder.find(
                (s) => s.teamId === teamId
            )!;
            const newResult = newTeamStanding.problems.find(
                (p) => p.problemId === prob.id
            )!;

            // Create a reveal step with OLD array order but UPDATED scores
            steps.push({
                type: 'reveal',
                teamId,
                problemId: prob.id,
                revealedResult: { ...newResult },
                previousResult: prevResult,
                standings: cloneStandings(displayOrder),
            });

            // Check if rank changed (compare position in sorted vs display)
            const newTeamIndex = currentStandings.findIndex(
                (s) => s.teamId === teamId
            );

            if (newTeamIndex < teamIndex) {
                // Team moved up — create a move step with the NEW sorted order
                // fromRank/toRank are 0-indexed positions in the display array
                steps.push({
                    type: 'move',
                    teamId,
                    fromRank: teamIndex,
                    toRank: newTeamIndex,
                    standings: cloneStandings(currentStandings),
                });

                // Now sync displayOrder to the new sorted order
                displayOrder = cloneStandings(currentStandings);

                rankChanged = true;
                // Don't decrement teamIndex — process the same position again
                // (a new team is now at this index)
                break;
            }
        }

        if (!rankChanged) {
            teamIndex--;
        }
    }

    return { frozenStandings, steps };
}
