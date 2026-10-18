/**
 * Generate status.html from test results.
 *
 * Usage: bun scripts/generate-status.ts --candidate-sha <40-hex> [--results-dir <path>] [--now <ISO-8601>]
 *
 * A PASS cell requires a well-formed result for that implementation whose
 * commit is the candidate SHA, whose status is exactly "passing", whose
 * error is null, and whose timestamp falls in the freshness window. Missing,
 * malformed, stale, mismatched, or unknown-status evidence is never PASS.
 */

interface Implementation {
    id: string;
    name: string;
    language: string;
    repo: string;
    path?: string;
    status: "production" | "active-dev" | "early-stage";
    description: string;
    testCommand: string | null;
}

export interface TestResult {
    implementationId: string;
    status: "passing" | "failing";
    duration: number;
    error: string | null;
    timestamp: string;
    commit: string;
}

/** Daily status evidence older than this is stale. */
export const EVIDENCE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
/** Reject timestamps this far in the future. */
export const EVIDENCE_FUTURE_SKEW_MS = 15 * 60 * 1000;

export type EvidenceCell = "pending" | "invalid" | "pass" | "fail";

const SHA = /^[0-9a-f]{40}$/i;

interface ImplementationsConfig {
    implementations: Implementation[];
}

export function argumentValue(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0 || index + 1 >= args.length) {
        return undefined;
    }
    return args[index + 1];
}

export function classifyEvidence(
    raw: unknown,
    expectedId: string,
    candidateSha: string,
    now: Date,
): EvidenceCell {
    if (raw === null || raw === undefined) {
        return "pending";
    }
    if (!isAcceptableEvidence(raw, expectedId, candidateSha, now)) {
        return "invalid";
    }
    return raw.status === "passing" ? "pass" : "fail";
}

function isAcceptableEvidence(
    raw: unknown,
    expectedId: string,
    candidateSha: string,
    now: Date,
): raw is TestResult {
    if (!SHA.test(candidateSha) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
        return false;
    }
    const result = raw as Record<string, unknown>;
    if (result.implementationId !== expectedId) {
        return false;
    }
    if (result.status !== "passing" && result.status !== "failing") {
        return false;
    }
    if (typeof result.duration !== "number" || !Number.isFinite(result.duration) || result.duration < 0) {
        return false;
    }
    const errorOk = result.status === "passing"
        ? result.error === null
        : typeof result.error === "string" && result.error !== "";
    if (!errorOk) {
        return false;
    }
    if (typeof result.timestamp !== "string") {
        return false;
    }
    const timestamp = Date.parse(result.timestamp);
    if (Number.isNaN(timestamp)) {
        return false;
    }
    const age = now.getTime() - timestamp;
    if (age > EVIDENCE_MAX_AGE_MS || age < -EVIDENCE_FUTURE_SKEW_MS) {
        return false;
    }
    return typeof result.commit === "string"
        && SHA.test(result.commit)
        && result.commit.toLowerCase() === candidateSha.toLowerCase();
}

async function loadImplementations(): Promise<Implementation[]> {
    const file = Bun.file("./implementations.json");
    const config: ImplementationsConfig = await file.json();
    return config.implementations;
}

async function loadTestResults(resultsDir: string, implementationId: string): Promise<unknown> {
    const file = Bun.file(`${resultsDir}/${implementationId}.json`);
    if (!(await file.exists())) {
        return null;
    }
    try {
        return await file.json();
    } catch {
        return { malformed: true };
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getStatusClass(status: Implementation["status"]): string {
    switch (status) {
        case "production":
            return "is-success";
        case "active-dev":
            return "is-warning";
        case "early-stage":
            return "is-primary";
    }
}

function getStatusLabel(status: Implementation["status"]): string {
    switch (status) {
        case "production":
            return "Production";
        case "active-dev":
            return "Active";
        case "early-stage":
            return "Early";
    }
}

function generateTableRow(impl: Implementation, cell: EvidenceCell): string {
    const statusClass = getStatusClass(impl.status);
    const statusLabel = getStatusLabel(impl.status);
    const sourceUrl = `https://github.com/${impl.repo}${impl.path ? `/tree/main/${impl.path}` : ""}`;

    let testsCell: string;
    if (impl.testCommand === null) {
        testsCell = `<span class="test-status test-none">-</span>`;
    } else if (cell === "pending") {
        testsCell = `<span class="test-status test-pending">...</span>`;
    } else if (cell === "invalid") {
        testsCell = `<span class="test-status test-invalid">INVALID</span>`;
    } else if (cell === "fail") {
        testsCell = `<span class="test-status test-error">FAIL</span>`;
    } else if (cell === "pass") {
        testsCell = `<span class="test-status test-success">PASS</span>`;
    } else {
        testsCell = `<span class="test-status test-invalid">INVALID</span>`;
    }

    return `
                <tr>
                    <td>
                        <a href="${escapeHtml(sourceUrl)}">${escapeHtml(impl.name)}</a>
                    </td>
                    <td>${escapeHtml(impl.language)}</td>
                    <td>${escapeHtml(impl.description)}</td>
                    <td><span class="nes-text ${statusClass}">${statusLabel}</span></td>
                    <td class="tests-col">${testsCell}</td>
                </tr>`;
}

function generateSvgBadge(impl: Implementation, cell: EvidenceCell): string {
    let value: string;
    let color: string;

    if (impl.testCommand === null) {
        value = "no tests";
        color = "#6c757d";
    } else if (cell === "pending") {
        value = "pending";
        color = "#6c757d";
    } else if (cell === "fail") {
        value = "failing";
        color = "#e76e55";
    } else if (cell === "pass") {
        value = "passing";
        color = "#92cc41";
    } else {
        value = "invalid";
        color = "#e76e55";
    }

    const label = impl.id;
    const labelWidth = label.length * 6.5 + 10;
    const valueWidth = value.length * 6.5 + 10;
    const totalWidth = labelWidth + valueWidth;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function generateHtml(
    implementations: Implementation[],
    cells: Map<string, EvidenceCell>,
    candidateSha: string,
): string {
    const rows = implementations
        .map((impl) => generateTableRow(impl, cells.get(impl.id) ?? "invalid"))
        .join("\n");

    const values = Array.from(cells.values());
    const passingCount = values.filter((cell) => cell === "pass").length;
    const failingCount = values.filter((cell) => cell === "fail").length;
    const totalCount = values.filter((cell) => cell === "pass" || cell === "fail").length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AlgoChat Status</title>
    <link href="https://unpkg.com/nes.css@2.3.0/css/nes.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Press Start 2P', cursive; }
        body {
            background-color: #212529;
            color: #f8f9fa;
            padding: 20px;
            font-size: 11px;
            line-height: 1.6;
        }
        .container { max-width: 960px; margin: 0 auto; }
        .nes-container { background-color: #2d3238; }
        .nes-container.is-dark { background-color: #212529; }
        .nes-container.with-title > .title {
            background-color: #212529;
            color: #92cc41;
        }
        h1 { color: #92cc41; font-size: 18px; }
        a { color: #209cee; }
        a:hover { color: #92cc41; }

        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .header i { font-size: 48px; color: #f7d51d; }
        .header p { color: #adb5bd; font-size: 10px; margin-top: 8px; }

        .summary {
            display: flex;
            justify-content: center;
            gap: 48px;
            margin: 24px 0;
        }
        .stat { text-align: center; }
        .stat-value {
            font-size: 28px;
            display: block;
            margin-bottom: 4px;
        }
        .stat-value.green { color: #92cc41; }
        .stat-value.red { color: #e76e55; }
        .stat-label { font-size: 8px; color: #6c757d; }

        .impl-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        .impl-table th {
            text-align: left;
            padding: 12px 8px;
            border-bottom: 2px solid #92cc41;
            color: #92cc41;
            font-size: 9px;
        }
        .impl-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #3d4348;
            vertical-align: middle;
        }
        .impl-table tr:hover td { background-color: #2d3238; }
        .impl-table a { text-decoration: none; }
        .impl-table a:hover { text-decoration: underline; }

        .tests-col { text-align: center; }
        .test-status {
            display: inline-block;
            padding: 4px 8px;
            font-size: 9px;
            min-width: 48px;
            text-align: center;
        }
        .test-success { color: #92cc41; }
        .test-warning { color: #f7d51d; }
        .test-error { color: #e76e55; }
        .test-none { color: #6c757d; }
        .test-pending { color: #6c757d; }
        .test-invalid { color: #e76e55; }

        .links {
            display: flex;
            justify-content: center;
            gap: 16px;
            margin-top: 32px;
        }
        .links .nes-btn { font-size: 10px; }

        footer {
            text-align: center;
            margin-top: 40px;
            padding: 16px;
            color: #6c757d;
            font-size: 8px;
        }
        .corvid { color: #ff6b35; }

        .section { margin-top: 24px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <i class="nes-icon trophy"></i>
            <h1>Implementation Status</h1>
            <p>Reported test snapshots for AlgoChat libraries</p>
            <p>A PASS cell is a result whose commit is <code>${escapeHtml(candidateSha)}</code>, whose status is passing, and whose timestamp is inside the 36-hour freshness window. Missing, malformed, stale, or mismatched evidence is never shown as PASS. Project labels do not establish release readiness. Use the <a href="docs/RELEASE.html">release qualification receipts</a> and <a href="docs/ACCURACY.html">accuracy report</a> for evidence and limits.</p>
        </div>

        <section class="nes-container with-title is-dark">
            <p class="title">Summary</p>
            <div class="summary">
                <div class="stat">
                    <span class="stat-value green">${passingCount}</span>
                    <span class="stat-label">Passing</span>
                </div>
                <div class="stat">
                    <span class="stat-value ${failingCount > 0 ? "red" : ""}">${failingCount}</span>
                    <span class="stat-label">Failing</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${totalCount}</span>
                    <span class="stat-label">Total</span>
                </div>
            </div>
        </section>

        <section class="nes-container with-title is-dark section">
            <p class="title">Implementations</p>
            <table class="impl-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Language</th>
                        <th>Platforms</th>
                        <th>Project label</th>
                        <th class="tests-col">Tests</th>
                    </tr>
                </thead>
                <tbody>
${rows}
                </tbody>
            </table>
        </section>

        <div class="links">
            <a href="index.html" class="nes-btn is-primary">Protocol</a>
            <a href="https://github.com/CorvidLabs/algochat" class="nes-btn">GitHub</a>
        </div>

        <footer>
            <p>Made with <i class="nes-icon is-small heart"></i> by <span class="corvid">Corvid Labs</span></p>
            <p style="margin-top: 8px;">Page generated: ${new Date().toISOString().split("T")[0]} UTC. This is not the time each test ran.</p>
        </footer>
    </div>
</body>
</html>`;
}

async function main(): Promise<void> {
    const resultsDir = argumentValue(process.argv, "--results-dir") ?? "./test-results";
    const outputDir = argumentValue(process.argv, "--output-dir") ?? ".";
    const candidateSha = argumentValue(process.argv, "--candidate-sha") ?? "";
    const nowValue = argumentValue(process.argv, "--now");
    const now = nowValue ? new Date(nowValue) : new Date();
    if (!SHA.test(candidateSha) || Number.isNaN(now.getTime())) {
        throw new Error("A 40-hex --candidate-sha and a valid --now are required before any PASS cell can be rendered");
    }

    console.log("Loading implementations...");
    const implementations = await loadImplementations();
    console.log(`Found ${implementations.length} implementations`);

    console.log("Loading test results...");
    const cells = new Map<string, EvidenceCell>();
    let rejected = !SHA.test(candidateSha);
    for (const impl of implementations) {
        if (impl.testCommand === null) {
            cells.set(impl.id, "pending");
            console.log(`  ${impl.id}: no test command`);
            continue;
        }
        const raw = await loadTestResults(resultsDir, impl.id);
        const cell = classifyEvidence(raw, impl.id, candidateSha, now);
        cells.set(impl.id, cell);
        console.log(`  ${impl.id}: ${cell}`);
        if (cell !== "pass" && cell !== "fail") {
            rejected = true;
        }
    }

    console.log("Generating status.html...");
    const html = generateHtml(implementations, cells, candidateSha);
    if ((html.match(/test-success">PASS/g) ?? []).length !== Array.from(cells.values()).filter((cell) => cell === "pass").length) {
        throw new Error("PASS markup does not match accepted evidence");
    }
    await Bun.write(`${outputDir}/status.html`, html);
    console.log("Generated status.html");

    console.log("Generating badges...");
    const badgesDir = `${outputDir}/badges`;
    await Bun.write(`${badgesDir}/.gitkeep`, "");
    for (const impl of implementations) {
        const badge = generateSvgBadge(impl, cells.get(impl.id) ?? "invalid");
        if (cells.get(impl.id) !== "pass" && badge.includes(">passing<")) {
            throw new Error(`badge rendered passing without accepted evidence for ${impl.id}`);
        }
        await Bun.write(`${badgesDir}/${impl.id}.svg`, badge);
        console.log(`  Generated ${impl.id}.svg`);
    }

    if (rejected) {
        throw new Error("Missing or invalid evidence. No PASS cell was rendered for it.");
    }
    console.log("Done!");
}

if (import.meta.main) {
    main().catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
}
