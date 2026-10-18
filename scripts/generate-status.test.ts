import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyEvidence, type TestResult } from "./generate-status.ts";

const SHA = "237a97488ac663fdf326e07badc383b4452db4ad";
const NOW = new Date("2026-10-18T16:00:00Z");

function evidence(overrides: Record<string, unknown> = {}): TestResult {
    return {
        implementationId: "go-algochat",
        status: "passing",
        duration: 10,
        error: null,
        timestamp: "2026-10-18T15:00:00Z",
        commit: SHA,
        ...overrides,
    } as TestResult;
}

describe("status evidence", () => {
    test("accepts a fresh matching pass and an explicit failure", () => {
        expect(classifyEvidence(evidence(), "go-algochat", SHA, NOW)).toBe("pass");
        expect(classifyEvidence(evidence({ status: "failing", error: "Tests failed" }), "go-algochat", SHA, NOW)).toBe("fail");
    });

    test("missing evidence is pending and never a pass", () => {
        expect(classifyEvidence(null, "go-algochat", SHA, NOW)).toBe("pending");
        expect(classifyEvidence(undefined, "swift-algochat", SHA, NOW)).toBe("pending");
    });

    test("rejects a wrong candidate, stale time, malformed JSON, and an unknown status", () => {
        expect(classifyEvidence(evidence({ commit: "0".repeat(40) }), "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence(evidence({ timestamp: "2000-01-01T00:00:00Z" }), "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence(evidence({ timestamp: "2026-10-20T00:00:00Z" }), "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence({ malformed: true }, "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence("not-json", "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence(evidence({ status: "invalid-status", error: null }), "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence(evidence({ status: "passing", error: "hidden" }), "go-algochat", SHA, NOW)).toBe("invalid");
        expect(classifyEvidence(evidence(), "go-algochat", "not-a-sha", NOW)).toBe("invalid");
        expect(classifyEvidence(evidence({ implementationId: "algochat-web" }), "go-algochat", SHA, NOW)).toBe("invalid");
    });
});

const IDS = [
    "swift-algochat",
    "ts-algochat",
    "py-algochat",
    "rs-algochat",
    "kt-algochat",
    "go-algochat",
];

function render(results: Record<string, unknown>, candidate = SHA): { status: number | null; html: string } {
    const dir = mkdtempSync(join(tmpdir(), "algochat-status-"));
    const resultsDir = join(dir, "results");
    mkdirSync(resultsDir);
    for (const [id, body] of Object.entries(results)) {
        writeFileSync(join(resultsDir, `${id}.json`), JSON.stringify(body));
    }
    const run = spawnSync(
        "bun",
        [
            "scripts/generate-status.ts",
            "--candidate-sha",
            candidate,
            "--results-dir",
            resultsDir,
            "--output-dir",
            dir,
            "--now",
            NOW.toISOString(),
        ],
        { cwd: join(import.meta.dir, ".."), encoding: "utf8" },
    );
    let html = "";
    try {
        html = readFileSync(join(dir, "status.html"), "utf8");
    } catch {
        html = "";
    }
    return { status: run.status, html };
}

describe("status page", () => {
    test("a wrong SHA, stale evidence, malformed evidence, and an unknown status never render PASS", () => {
        const cases: Record<string, unknown>[] = [
            { commit: "0".repeat(40) },
            { timestamp: "2000-01-01T00:00:00Z" },
            { status: "invalid-status", error: null },
        ];
        for (const overrides of cases) {
            const results = Object.fromEntries(IDS.map((id) => [id, evidence({ implementationId: id, ...overrides })]));
            const page = render(results);
            expect(page.status).toBe(1);
            expect(page.html.match(/test-success">PASS/g) ?? []).toHaveLength(0);
        }
        const malformed = render(Object.fromEntries(IDS.map((id) => [id, { broken: true }])));
        expect(malformed.status).toBe(1);
        expect(malformed.html.match(/test-success">PASS/g) ?? []).toHaveLength(0);
    });

    test("six fresh matching results render six PASS cells and include Go", () => {
        const results = Object.fromEntries(IDS.map((id) => [id, evidence({ implementationId: id })]));
        const page = render(results);
        expect(page.status).toBe(0);
        expect(page.html.match(/test-success">PASS/g) ?? []).toHaveLength(6);
        expect(page.html).toContain("go-algochat");
        expect(page.html).not.toContain("algochat-web");
    });
});

describe("status workflow", () => {
    const workflow = readFileSync(new URL("../.github/workflows/status.yml", import.meta.url), "utf8");

    test("covers Go, drops the archived web checkout, and binds Swift to its exit code", () => {
        expect(workflow).toContain("go-algochat");
        expect(workflow).toContain("test-go:");
        expect(workflow).not.toContain("algochat-web");
        expect(workflow).not.toContain("CorvidLabs/algochat-web");
        expect(workflow).not.toContain('grep -q "Test Suite');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/swift-algochat.json"');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/ts-algochat.json"');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/py-algochat.json"');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/rs-algochat.json"');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/kt-algochat.json"');
        expect(workflow).toContain('"$GITHUB_WORKSPACE/go-algochat.json"');
        expect(workflow).toContain("--candidate-sha");
        expect(workflow.match(/implementationId": "go-algochat"/g)?.length).toBe(1);
    });
});
