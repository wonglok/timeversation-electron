import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, methods } from "@agentclientprotocol/sdk";
import type {
    ClientContext,
    ClientHandlerContext,
    ActiveSession,
} from "@agentclientprotocol/sdk";
import * as schema from "@agentclientprotocol/sdk";

// ============================================================================
// SSE encoder (same format as handleClaude.ts)
// ============================================================================

const encoder = new TextEncoder();

function encodeLine(field: string, value: string): Uint8Array {
    return encoder.encode(`${field}: ${value}\r\n`);
}

function writeSSEEvent(
    res: NodeJS.WritableStream,
    data: string,
    event?: string,
): void {
    const parts: Uint8Array[] = [];

    if (event) parts.push(encodeLine("event", event));

    if (data === "") {
        parts.push(encodeLine("data", ""));
    } else {
        for (const line of data.split("\n")) {
            parts.push(encodeLine("data", line));
        }
    }

    parts.push(encoder.encode("\r\n"));

    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
        merged.set(p, offset);
        offset += p.length;
    }
    res.write(merged);
}

// ============================================================================
// Handler — Agent Client Protocol via stdio
// ============================================================================

export const handleOpenCode = async ({
    req,
    res,
    message,
    workspacePath = "",
}: {
    req: any;
    res: any;
    message: string;
    workspacePath?: string;
}) => {
    // --- SSE headers ---
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.write(encoder.encode(":ok\r\n\r\n"));

    const cwd = workspacePath || process.cwd();
    let done = false;
    const end = () => {
        if (!done) {
            done = true;
            res.end();
        }
    };

    // --- Spawn opencode in ACP mode ---
    const proc = spawn("opencode", ["acp"], {
        env: process.env,
        cwd,
        stdio: ["pipe", "pipe", "inherit"],
    });

    // If opencode exits before we write, stdin gets EPIPE.  Suppress it and
    // let the close/error handlers surface the real problem.
    let spawnError: string | null = null;

    proc.on("error", (err) => {
        spawnError = err.message;
    });

    // proc.on("close", (code) => {
    //     if (code !== 0 && code !== null && spawnError === null) {
    //         spawnError = `opencode exited with code ${code}`;
    //     }
    // });

    // req.on("close", () => {
    //     if (proc.exitCode === null && !proc.killed) proc.kill();
    // });

    // Wait one tick for the process to either start or fail
    await new Promise((r) => setTimeout(r, 50));

    if (spawnError || proc.exitCode !== null) {
        writeSSEEvent(res, spawnError ?? "opencode failed to start", "error");
        return end();
    }

    // --- ACP stream from stdio ---
    const stream = ndJsonStream(
        Writable.toWeb(proc.stdin!),
        Readable.toWeb(proc.stdout!),
    );

    const app = client({ name: "timeversation" });

    // Forward session/update notifications as raw ACP NDJSON lines.
    // This matches the same schema that `claude --output-format stream-json` emits.
    app.onNotification(
        methods.client.session.update,
        (ctx: ClientHandlerContext<schema.SessionNotification>) => {
            writeSSEEvent(res, JSON.stringify(ctx.params));
        },
    );

    app.connectWith(stream, async (ctx: ClientContext) => {
        const init: any = await ctx.request(methods.agent.initialize, {
            protocolVersion: 1,
            clientCapabilities: {
                fs: { writeTextFile: true, readTextFile: true },
                terminal: true,
            },
        });

        // Emit init event matching claude's stream-json init schema
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "init",
                cwd,
                session_id: init?.sessionId ?? null,
                model: init?.agentMetadata?.model ?? "unknown",
            }),
        );

        const session: ActiveSession = await ctx.buildSession(cwd).start();

        // Emit session event matching claude's stream-json session schema
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "session",
                session_id: session.sessionId,
            }),
        );

        try {
            const promptPromise = session.prompt([
                { type: "text", text: message },
            ]);

            // Stream updates until stop. Each update is forwarded as-is
            // by the onNotification handler above.
            while (true) {
                const msg = await session.nextUpdate();
                if (msg.kind === "stop") break;

                // onNotification already forwards the raw params; nothing extra needed
                const contents = (msg as any).update?.contents;
                if (contents) {
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "assistant",
                            message: {
                                role: "assistant",
                                content: contents,
                            },
                            session_id: session.sessionId,
                        }),
                    );
                }
            }

            const resp: any = await promptPromise;

            // Emit result event matching claude's stream-json result schema
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "result",
                    subtype: "success",
                    is_error: false,
                    duration_ms: resp?.durationMs ?? 0,
                    result: resp?.stopReason ?? "end_turn",
                    stop_reason: resp?.stopReason ?? "end_turn",
                    session_id: session.sessionId,
                    num_turns: 1,
                }),
            );

            writeSSEEvent(res, "[DONE]");
            end();
        } finally {
            try {
                session.dispose();
            } catch {
                /* ok */
            }
        }
    })
        .then(() => {})
        .catch((err: any) => {
            if (err?.code === "ECONNRESET" || err?.name === "AbortError") {
                writeSSEEvent(res, "[DONE]");
            } else {
                writeSSEEvent(res, err?.message ?? "ACP failed", "error");
            }
            end();
        });
};

/*
{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"availableCommands":[{"name":"aws-lambda-microvms","description":"Builds, runs, debugs, and operates applications on AWS Lambda MicroVMs — Firecracker-isolated, snapshot-resumable serverless compute environments running inside a container with up to 8 hr lifetimes. Applicable when workloads need strong isolation between tenants, isolated serverless compute, sandbox compute, or secure multi-tenant execution. Also suited for AI/agent code-execution sandboxes, interactive code playgrounds and notebooks (Jupyter, REPLs, dev environments running user-supplied code), reinforcement-learning environments, multi-tenant CI executors and build runners, sessionful game or simulation servers, or isolated security scanners. Also applicable when the workload needs long-lived sessions, a real port-listening server (gRPC, WebSocket, custom TCP protocols), state preserved across periods of inactivity (suspend/resume), container-level access (FUSE, eBPF, custom syscalls), or session-affine routing."},{"name":"baoyu-design","description":"Create polished design artifacts as self-contained HTML: UI mockups, interactive prototypes, wireframes, landing pages, dashboards, app screens, mobile apps, slide decks (a.k.a. PPT / PowerPoint presentations), and visual explorations. Use whenever the user asks to design, mock up, prototype, wireframe, visualize, explore, or make a PPT/deck for an interface, product screen, user flow, content layout, visual artifact, or pitch/deck concept, even if they do not say \"design\". Also use to export a deck built with this skill to PowerPoint (PPT/PPTX) — but only decks authored here (deck-stage / this skill's slide-structured HTML), NOT arbitrary HTML, so confirm the target is such a deck first. Also use for setting up, importing, or authoring reusable design systems, UI kits, brand tokens, or component libraries. Harness-agnostic for Claude Code, Cursor, Codex Agent, and similar file-capable agents."},{"name":"customize-opencode","description":"Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."},{"name":"faceless-explainer","description":"faceless-explainer video workflow - arbitrary text (article / notes / topic / brief) -> narrator_scripts.json + audio (voice + BGM) + section_plan.md -> typography / abstract-graphics / diagram / data-viz video. Typical length up to ~3 min (sweet spot ~30-90s); a genuinely longer piece is general-video, not this workflow. Generates its OWN narration (TTS) — it does not sync to a user-supplied / pre-recorded voiceover (that is general-video). No website capture, no real product screenshots. If the text names a product / its site to promote, that is /product-launch-video; when product-vs-topic is unclear, start at /hyperframes-read-first."},{"name":"frontend-design","description":"Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics."},{"name":"general-video","description":"Use as the fallback for custom HyperFrames HTML video composition authoring when no specialized workflow fits. Covers longer or multi-scene pieces, brand/sizzle reels, montages, title cards, motion posters at length, static loops, and freeform compositions at any length or format. Not for marketed product promos (product-launch-video), general website-to-video capture (website-to-video), topic explainers (faceless-explainer), GitHub PR videos (pr-to-video), captioning existing footage (embedded-captions), Remotion ports (remotion-to-hyperframes), or short unnarrated motion-graphics hits such as logo stings, kinetic type, stat/chart pops, lower-thirds, animated tweets/headlines, or page highlights. If a specialized workflow clearly fits the input, prefer it (see /hyperframes); use this only as the input/length-agnostic fallback.\n"},{"name":"gepeto","description":"Guide for building 1-click launchers and building apps with launchers built-in using Pinokio"},{"name":"graphic-overlays","description":"Package an existing talking-head / interview / podcast video by layering timed, designed GRAPHIC OVERLAY cards onto the playing video — titles, lower-thirds, data callouts, quotes, side panels, picture-in-picture — synced to the transcript. The source video plays in full; the agent designs and writes each card's HTML in conversation, then renders to MP4 via hyperframes. Use when the user asks for graphic overlays, on-screen graphics / lower-thirds / data callouts / kinetic titles on a video, \"package / dress up my video\", \"add overlay cards / graphic cards\", or AI-composed graphic packaging of an existing video. NOT for plain subtitles (→ embedded-captions) or building a video from scratch (→ the creation workflows); when unsure overlays-vs-captions, see /hyperframes-read-first."},{"name":"hyperframes","description":"Create video compositions, animations, title cards, overlays, captions, voiceovers, audio-reactive visuals, and scene transitions in HyperFrames HTML. Use when asked to build any HTML-based video content, add captions or subtitles synced to audio, generate text-to-speech narration, create audio-reactive animation (beat sync, glow, pulse driven by music), add animated text highlighting (marker sweeps, hand-drawn circles, burst lines, scribble, sketchout), or add transitions between scenes (crossfades, wipes, reveals, shader transitions). Covers composition authoring, timing, media, and the full video production workflow. For dev-loop CLI commands (init, lint, inspect, preview, render) see the hyperframes-cli skill; for asset preprocessing commands (tts, transcribe, remove-background) see the hyperframes-media skill."},{"name":"hyperframes-animation","description":"All animation knowledge for HyperFrames — atomic motion rules, multi-phase scene blueprints, scene transitions, broader motion-design techniques, AND the seven runtime adapters (GSAP default, plus Lottie, Three.js, Anime.js, CSS keyframes, Web Animations API, TypeGPU). Use for any motion or animation task: pick 2-4 rules and compose, or load a blueprint, or look up runtime-specific API (e.g. GSAP eases / Lottie player / Three.js mixer). HyperFrames-native: single paused timeline, seek-safe, deterministic."},{"name":"hyperframes-cli","description":"HyperFrames CLI dev loop — `npx hyperframes` for scaffolding (init), validation (lint, inspect), preview, render, and environment troubleshooting (doctor, browser, info, upgrade). Use when running any of these commands or troubleshooting the HyperFrames build/render environment. For asset preprocessing commands (`tts`, `transcribe`, `remove-background`), invoke the `hyperframes-media` skill instead."},{"name":"hyperframes-core","description":"HyperFrames HTML composition contract. Use for composition structure, data attributes, clips, tracks, sub-compositions, variables, media playback, deterministic render rules, and validation of minimal renderable projects."},{"name":"hyperframes-creative","description":"Non-animation creative direction for HyperFrames videos. Use for design spec (frame.md / design.md) handling, palettes, typography, narration, beat planning, audio-reactive visuals, composition patterns, and brand / style decisions. For atomic motion patterns and scene blueprints, use `hyperframes-animation`."},{"name":"hyperframes-media","description":"Asset preprocessing for HyperFrames compositions — multi-provider TTS (HeyGen / ElevenLabs / Kokoro local), multi-provider BGM (Google Lyria / local MusicGen), Whisper transcription, background removal, and caption authoring. Use for npx hyperframes tts, bgm, transcribe, remove-background, voice/provider selection, music-mood prompting, captions / subtitles / lyrics / karaoke / per-word styling."},{"name":"hyperframes-registry","description":"Install and wire registry blocks and components into HyperFrames compositions. Use when running hyperframes add, installing a block or component, wiring an installed item into index.html, or working with hyperframes.json. Covers the add command, install locations, block sub-composition wiring, component snippet merging, registry discovery, and authoring a new block or component to contribute upstream (idea → scaffold → validate → PR)."},{"name":"impeccable","description":"Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks."},{"name":"init","description":"guided AGENTS.md setup"},{"name":"lavish","description":"Turn complex or visual agent responses into rich, reviewable HTML artifacts the user can annotate and send feedback on, using the lavish-axi CLI. Use when about to give a plan, comparison, diagram, table, code diff, report, or anything easier to grasp visually than as prose."},{"name":"motion-graphics","description":"Use when the user wants a short, design-led motion graphic where motion is the message: kinetic typography, stat or number count-up, chart/data-viz hit, logo sting, brand lockup, lower-third, callout, social overlay, animated headline/tweet/news item, motion poster, or quick captured-page highlight. Usually under 10s and up to ~30s, with no narration arc, voice-over, or live-action subject. Can render to MP4 or transparent overlay. Not for longer, multi-scene, narrated, or brand-reel pieces (use general-video), narrated website videos (website-to-video), topic explainers (faceless-explainer), product promos (product-launch-video), PR videos (pr-to-video), or captions on existing footage (embedded-captions). When unsure whether it's a quick motion-first piece or a longer / narrated treatment, see /hyperframes.\n"},{"name":"pinokio","description":"Discover, launch, and use apps and tools for the current task."},{"name":"product-launch-video","description":"Use when the user wants a product launch, SaaS promo, feature reveal, app/company/site marketing video, or a script/brief turned into a product-focused video. Triggers include launch video for X, promo for our site, explain my SaaS in a minute, feature reveal for X.com, and turn this script into a 60s promo. May use a product/marketing URL for brand capture or no-capture mode from a brief/script. Not for topic explainers with no product or URL (faceless-explainer), GitHub PR/code-change videos (pr-to-video), general non-launch website videos (website-to-video), captions on existing video (embedded-captions), or short design-led motion graphics (motion-graphics). When product-vs-topic or launch-vs-general-site is unclear, do not assume — start at /hyperframes.\n"},{"name":"remotion-to-hyperframes","description":"Translate an existing Remotion (React-based) video composition into a HyperFrames HTML composition. Use ONLY when the user explicitly asks to port, convert, migrate, translate, or rewrite a Remotion composition as HyperFrames (e.g. \"port my Remotion project to HyperFrames\"). Do NOT use when (a) authoring a NEW HyperFrames composition (even if A/B-testing a Remotion video); (b) Remotion is mentioned in passing; (c) Remotion code is shared as reference, not for translation; (d) the user wants \"the same video as my Remotion one\" without explicitly asking to migrate the source — treat as a fresh HyperFrames build. When in doubt, default to the `hyperframes` skill. Detects unsupported patterns (useState, useEffect side effects, async calculateMetadata, third-party React component libraries, `@remotion/lambda`) and recommends the runtime interop escape hatch instead of a lossy translation."},{"name":"review","description":"review changes [commit|branch|pr], defaults to uncommitted"},{"name":"slideshow","description":"Author a HyperFrames slideshow composition — a presentation, pitch deck, or interactive deck with discrete slides, fragment reveals, branching sequences, and hotspot navigation. Read when the request is to build or edit a slideshow, presentation, or pitch deck as a HyperFrames composition.\n"},{"name":"vercel-react-best-practices","description":"React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements."},{"name":"website-to-video","description":"Capture a general website/URL and turn it into a HyperFrames video (site tour, showcase, or social clip from the site's own visuals). Uses headless Chrome screenshots + brand assets. Use when intent is general — portfolio/blog/landing-page showcase or social clip from the site. NOT for: product/SaaS launch or promo (→ /product-launch-video, even from a URL); topic explainer with no site (→ /faceless-explainer); GitHub PR (→ /pr-to-video); adding captions to existing video (→ /embedded-captions); short unnarrated page-highlight motion graphic (→ /motion-graphics). Unclear launch-vs-general-site? Ask one question or start at /hyperframes-read-first."}],"sessionUpdate":"available_commands_update"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":"The user said \"","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":"hi\".","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" This","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" is a simple greeting","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":",","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" so I should respond","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" briefly","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" and offer","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" help. I","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":"'ll","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" keep","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" it short","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" and friendly","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":".","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_thought_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":"Hi! How","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_message_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" can I help you","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_message_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"content":{"text":" today?","type":"text"},"messageId":"msg_fa6c0092b0018cyjkf30gYeaxK","sessionUpdate":"agent_message_chunk"}}{"sessionId":"ses_0593ff6edffeWt3Hkrhz0xBqZA","update":{"used":11793,"size":200000,"cost":{"amount":0,"currency":"USD"},"sessionUpdate":"usage_update"}}
*/
