Please build a scoreboard resolver that follows the design below. `create-next-app` has already been run for you.

# Objective
Build an ICPC contest scoreboard resolver using React, Next.js, and Tailwind CSS.

# Overview
A scoreboard resolver is used in programming contests which have a frozen scoreboard period, where the results of other teams' submissions are not available.
This creates suspense and allows for a scoreboard reveal during the closing ceremony.

A scoreboard resolver starts by showing the scoreboard state when the frozen scoreboard period begins.
Then it reveals the results of the submissions from the highest-ranked team (i.e. the team furthest away from 1st place).
If revealing a result causes the ranking of that team to change, the resolver should move that team to the appropriate rank without revealing any additional results.
This process should repeat until all results are revealed.

Each result that is revealed is a **step**.
The resolver should run through the steps automatically, but the user should be able to pause the resolver at any step.
When paused, the user should be able to step forward or backward to reveal or hide a result.

# Detailed Design
The scoreboard resolver should be a static website which has two pages.

## Configuration Page
The Configuration Page is the entry point where the user provides the necessary data to initialize the resolver.

### Configuration Options
- **Contest Data**: A contest feed file that follows the [2022-07 Contest Control System Specification](https://ccs-specs.icpc.io/2022-07/). This is the default format used by DOMjudge. All the information from the contest will be stored in this file. Read https://ccs-specs.icpc.io/2022-07/contest_api#notification-format and related documentation to understand the format.
- **Animation Settings**:
    - **Reveal Duration**: The time in milliseconds spent showing the result of a single submission. Defaults to 750ms.
    - **Movement Speed**: The time in milliseconds for a team to transition between ranks on the scoreboard. Defaults to 1000ms.
    - **Autoplay Pause**: The time in milliseconds to pause between steps when autoplay is enabled. Defaults to 250ms.
- **Breakpoint Settings**:
    - **Start Time**: The time when the resolver should start, relative to the contest start time. Leave blank to start when the scoreboard was frozen.
    - **Pause at Rank**: A list of ranks at which the resolver should pause. Defaults to [1, 2, 3].

## Scoreboard Page
The scoreboard page should display a scoreboard similar to the DOMjudge scoreboard.
An example of the DOMjudge scoreboard can be seen at https://bapc.gunncpc.com/bapc2025_scoreboard/index.html.

In particular, the scoreboard should have:
- The rank of the team
- The team name
- The team's organization, if it exists
- The team's total score and penalty
- The team's solved problems and penalty for each problem

Each problem has an associated label and color. Make sure the scoreboard shows both.
Again, the above requirements are very similar to the DOMjudge scoreboard.

The resolver scoreboard should not require scrolling and should adapt to the size of the screen, and it should look like a fullscreen presentation.
A tall screen should be able to display more teams at once.
The team whose submission results are currently being revealed should be the second from the bottom.
The team below that team should be slightly greyed out.

The reveal and rank changes should be animated. Make it look nice!

## Controls
The user should press the spacebar to toggle autoplay.
When autoplay is enabled, the resolver should automatically step through the steps.
When autoplay is paused, the user should be able to step forward or backward to reveal or hide a result using the arrow keys.
Clicking on the scoreboard should also step forward when autoplay is paused.

The user should press the escape key to return to the configuration page, which will have a new Reset button.
The scoreboard state should be preserved when returning to the configuration page, unless the user hits Reset.
