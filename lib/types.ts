// CCS 2022-07 Contest API types

export interface Contest {
    id: string;
    name: string;
    formal_name?: string;
    start_time: string | null;
    duration: string;
    scoreboard_freeze_duration?: string;
    scoreboard_type?: string;
    penalty_time?: number;
}

export interface Problem {
    id: string;
    label: string;
    name: string;
    ordinal: number;
    color?: string;
    rgb?: string;
    time_limit?: number;
    test_data_count?: number;
}

export interface Organization {
    id: string;
    name: string;
    formal_name?: string;
    country?: string;
    icpc_id?: string;
}

export interface Team {
    id: string;
    name: string;
    organization_id?: string;
    group_ids?: string[];
    icpc_id?: string;
    hidden?: boolean;
    display_name?: string;
}

export interface Submission {
    id: string;
    language_id: string;
    problem_id: string;
    team_id: string;
    time: string;
    contest_time: string;
    entry_point?: string;
}

export interface Judgement {
    id: string;
    submission_id: string;
    judgement_type_id: string | null;
    start_time: string;
    start_contest_time: string;
    end_time: string | null;
    end_contest_time: string | null;
    max_run_time?: number;
}

export interface JudgementType {
    id: string;
    name: string;
    penalty: boolean;
    solved: boolean;
}

export interface ContestState {
    started: string | null;
    ended: string | null;
    frozen: string | null;
    thawed: string | null;
    finalized: string | null;
    end_of_updates: string | null;
}

export interface Group {
    id: string;
    name: string;
    type?: string;
    hidden?: boolean;
}

// Parsed contest data from the event feed
export interface ContestData {
    contest: Contest;
    problems: Problem[];
    teams: Team[];
    organizations: Map<string, Organization>;
    submissions: Submission[];
    judgements: Judgement[];
    judgementTypes: Map<string, JudgementType>;
    state: ContestState | null;
    groups: Map<string, Group>;
}

// Resolver types

export interface ProblemResult {
    problemId: string;
    numJudged: number;
    numPending: number;
    solved: boolean;
    time: number; // minutes
    firstSolveTime: number; // minutes, -1 if not solved
}

export interface TeamStanding {
    teamId: string;
    rank: number;
    score: {
        numSolved: number;
        totalTime: number; // penalty minutes
    };
    problems: ProblemResult[];
}

export type StepType = 'reveal' | 'move' | 'focus';

export interface ResolverStep {
    type: StepType;
    teamId: string;
    // For 'reveal' steps
    problemId?: string;
    revealedResult?: ProblemResult;
    previousResult?: ProblemResult;
    // For 'move' steps
    fromRank?: number;
    toRank?: number;
    // Full standings snapshot after this step
    standings: TeamStanding[];
}

export interface ResolverConfig {
    revealDuration: number;    // ms
    movementSpeed: number;     // ms
    autoplayPause: number;     // ms
    startTime: string | null;  // relative time or null for freeze time
    pauseAtRanks: number[];    // ranks to pause at
}

export const DEFAULT_CONFIG: ResolverConfig = {
    revealDuration: 750,
    movementSpeed: 1000,
    autoplayPause: 250,
    startTime: null,
    pauseAtRanks: [1, 2, 3],
};
