import {
    Contest,
    Problem,
    Organization,
    Team,
    Submission,
    Judgement,
    JudgementType,
    ContestState,
    ContestData,
    Group,
} from './types';

interface FeedEvent {
    type: string;
    id: string | null;
    data: unknown;
}

export function parseFeed(feedText: string): ContestData {
    let contest: Contest | null = null;
    const problems = new Map<string, Problem>();
    const organizations = new Map<string, Organization>();
    const teams = new Map<string, Team>();
    const submissions = new Map<string, Submission>();
    const judgements = new Map<string, Judgement>();
    const judgementTypes = new Map<string, JudgementType>();
    const groups = new Map<string, Group>();
    let state: ContestState | null = null;

    const lines = feedText.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: FeedEvent;
        try {
            event = JSON.parse(trimmed) as FeedEvent;
        } catch {
            console.warn('Skipping invalid JSON line:', trimmed.substring(0, 80));
            continue;
        }

        const { type, data } = event;
        if (!data) continue; // deletion event or null data

        switch (type) {
            case 'contests':
            case 'contest': {
                if (Array.isArray(data)) {
                    // Collection update — take first
                    contest = data[0] as Contest;
                } else {
                    contest = data as Contest;
                }
                break;
            }
            case 'problems': {
                if (Array.isArray(data)) {
                    for (const p of data as Problem[]) {
                        problems.set(p.id, p);
                    }
                } else {
                    const p = data as Problem;
                    problems.set(p.id, p);
                }
                break;
            }
            case 'organizations': {
                if (Array.isArray(data)) {
                    for (const o of data as Organization[]) {
                        organizations.set(o.id, o);
                    }
                } else {
                    const o = data as Organization;
                    organizations.set(o.id, o);
                }
                break;
            }
            case 'teams': {
                if (Array.isArray(data)) {
                    for (const t of data as Team[]) {
                        teams.set(t.id, t);
                    }
                } else {
                    const t = data as Team;
                    teams.set(t.id, t);
                }
                break;
            }
            case 'submissions': {
                if (Array.isArray(data)) {
                    for (const s of data as Submission[]) {
                        submissions.set(s.id, s);
                    }
                } else {
                    const s = data as Submission;
                    submissions.set(s.id, s);
                }
                break;
            }
            case 'judgements': {
                if (Array.isArray(data)) {
                    for (const j of data as Judgement[]) {
                        judgements.set(j.id, j);
                    }
                } else {
                    const j = data as Judgement;
                    judgements.set(j.id, j);
                }
                break;
            }
            case 'judgement-types': {
                if (Array.isArray(data)) {
                    for (const jt of data as JudgementType[]) {
                        judgementTypes.set(jt.id, jt);
                    }
                } else {
                    const jt = data as JudgementType;
                    judgementTypes.set(jt.id, jt);
                }
                break;
            }
            case 'groups': {
                if (Array.isArray(data)) {
                    for (const g of data as Group[]) {
                        groups.set(g.id, g);
                    }
                } else {
                    const g = data as Group;
                    groups.set(g.id, g);
                }
                break;
            }
            case 'state': {
                if (Array.isArray(data)) {
                    state = data[0] as ContestState;
                } else {
                    state = data as ContestState;
                }
                break;
            }
            // Ignore other event types (languages, persons, accounts, runs, etc.)
        }
    }

    if (!contest) {
        throw new Error('No contest data found in feed');
    }

    // Sort problems by ordinal
    const sortedProblems = Array.from(problems.values()).sort(
        (a, b) => a.ordinal - b.ordinal
    );

    // Filter out hidden teams
    const visibleTeams = Array.from(teams.values()).filter(t => !t.hidden);

    return {
        contest,
        problems: sortedProblems,
        teams: visibleTeams,
        organizations,
        submissions: Array.from(submissions.values()),
        judgements: Array.from(judgements.values()),
        judgementTypes,
        state,
        groups,
    };
}
