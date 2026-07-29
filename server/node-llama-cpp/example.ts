/**
 * Example: OpenAISDKMock usage with node-llama-cpp
 *
 * Demonstrates model loading, text generation (streaming + non-streaming),
 * tool calling with `defineTool` / `collectTools`, multi-turn conversation,
 * and session reset.
 *
 * Run with:  npx tsx server/node-llama-cpp/example.ts
 *
 * Make sure you have a GGUF model file and update `MODEL_PATH` below.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    getLlama,
    LlamaChatSession,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
} from "node-llama-cpp";

import {
    OpenAIMock,
    defineTool,
    collectTools,
    type OpenAIMockConfig,
    type ChatCompletion,
    type ChatCompletionChunk,
} from "./OpenAISDKMock.js";

// ============================================================================
// Config — update this path to point to your GGUF model
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, "..", "..", "models", "my-model.gguf");

// ============================================================================
// 1. Load the model (one-time setup)
// ============================================================================

async function loadModel(): Promise<{
    model: LlamaModel;
    context: LlamaContext;
    sequence: LlamaContextSequence;
}> {
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: MODEL_PATH });

    const context = await model.createContext({
        contextSize: 8192, // tokens — adjust based on your model
    });

    const sequence = context.getSequence();

    return { model, context, sequence };
}

// ============================================================================
// 2. Define tools with co-located schema + handler
// ============================================================================

const getWeather = defineTool({
    name: "get_weather",
    description:
        "Get current weather for a city. Returns temperature and conditions.",
    parameters: {
        type: "object",
        properties: {
            city: {
                type: "string",
                description: "City name, e.g. 'San Francisco'",
            },
        },
        required: ["city"],
    },
    handler: async (args) => {
        // Stub — replace with a real weather API call.
        const city = args.city as string;
        return {
            city,
            temperature: 22,
            unit: "celsius",
            conditions: "sunny",
        };
    },
});

const calculate = defineTool({
    name: "calculate",
    description:
        "Evaluate a math expression. Supports +, -, *, /, and parentheses.",
    parameters: {
        type: "object",
        properties: {
            expression: {
                type: "string",
                description: "Math expression to evaluate, e.g. '2 + 3 * 4'",
            },
        },
        required: ["expression"],
    },
    handler: async (args) => {
        const expr = args.expression as string;
        // Stub — use a proper expression parser in production (e.g. mathjs).
        // Dynamic evaluation (eval / new Function) is avoided for security.
        return { expression: expr, result: `[computed: ${expr}]` };
    },
});

// Split definitions into the { tools, toolHandlers } shape the adapter expects.
const collected = collectTools(getWeather, calculate);

// ============================================================================
// 3. Create the OpenAIMock client
// ============================================================================

function createClient(
    model: LlamaModel,
    context: LlamaContext,
    sequence: LlamaContextSequence,
): OpenAIMock {
    const config: OpenAIMockConfig = {
        model,
        context,
        contextSequence: sequence,
        modelName: "local-llama-3",
        systemPrompt:
            "You are a helpful assistant. Use tools when appropriate. " +
            "Keep responses concise.",
        toolHandlers: collected.toolHandlers,
    };

    return new OpenAIMock(config);
}

// ============================================================================
// 4. Non-streaming completion
// ============================================================================

async function nonStreamingExample(client: OpenAIMock): Promise<void> {
    console.log("=== Non-streaming completion ===\n");

    const response: ChatCompletion = (await client.chat.completions.create({
        messages: [{ role: "user", content: "Hello! What can you do?" }],
        temperature: 0.7,
    })) as ChatCompletion;

    const choice = response.choices[0]!;
    console.log("Model:", response.model);
    console.log("Content:", choice.message.content);
    console.log("Finish reason:", choice.finish_reason);
    console.log();
}

// ============================================================================
// 5. Streaming completion — consume chunk-by-chunk
// ============================================================================

async function streamingExample(client: OpenAIMock): Promise<void> {
    console.log("=== Streaming completion ===\n");

    const stream = (await client.chat.completions.create({
        messages: [
            {
                role: "user",
                content: "Write a haiku about programming.",
            },
        ],
        stream: true,
        temperature: 0.7,
    })) as AsyncIterable<ChatCompletionChunk>;

    process.stdout.write("Response: ");
    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
            process.stdout.write(delta.content);
        }
    }
    console.log("\n");
}

// ============================================================================
// 6. Tool calling — model invokes a function and gets the result back
// ============================================================================

async function toolCallingExample(client: OpenAIMock): Promise<void> {
    console.log("=== Tool calling ===\n");

    // --- Step 1: Ask a question that triggers a tool call ---
    const response1 = (await client.chat.completions.create({
        messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
        tools: collected.tools,
        stream: false,
    })) as ChatCompletion;

    const choice1 = response1.choices[0]!;
    console.log("Model:", response1.model);
    console.log("Content:", choice1.message.content);
    console.log("Finish reason:", choice1.finish_reason);

    const toolCalls = choice1.message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
        console.log("\nTool calls:");
        for (const tc of toolCalls) {
            console.log(`  - ${tc.function.name}(${tc.function.arguments})`);
        }

        // --- Step 2: Execute handlers and feed results back ---
        const toolResults = await Promise.all(
            toolCalls.map(async (tc) => {
                const handler = collected.toolHandlers[tc.function.name];
                const args = JSON.parse(tc.function.arguments);
                const result = handler
                    ? await handler(args)
                    : { error: "No handler" };
                return {
                    role: "tool" as const,
                    tool_call_id: tc.id,
                    content: JSON.stringify(result),
                };
            }),
        );

        // --- Step 3: Model synthesises a final answer from tool results ---
        const response2 = (await client.chat.completions.create({
            messages: [
                { role: "user", content: "What's the weather in Tokyo?" },
                {
                    role: "assistant",
                    content: null,
                    tool_calls: toolCalls,
                },
                ...toolResults,
            ],
            stream: false,
        })) as ChatCompletion;

        console.log("\nFinal answer:", response2.choices[0]?.message.content);
    }
    console.log();
}

// ============================================================================
// 7. Multi-turn conversation
// ============================================================================

async function multiTurnExample(client: OpenAIMock): Promise<void> {
    console.log("=== Multi-turn conversation ===\n");

    const turns = ["My name is Alice.", "What's my name?"];

    for (const turn of turns) {
        const response = (await client.chat.completions.create({
            messages: [{ role: "user", content: turn }],
            stream: false,
        })) as ChatCompletion;

        console.log(`User:   ${turn}`);
        console.log(`Model:  ${response.choices[0]?.message.content}`);
        console.log();
    }
}

// ============================================================================
// 8. Session reset (clears context)
// ============================================================================

async function resetExample(client: OpenAIMock): Promise<void> {
    console.log("=== Session reset ===\n");

    // After reset the model loses all prior context.
    client.chat.completions.resetHistory();

    const response = (await client.chat.completions.create({
        messages: [{ role: "user", content: "What's my name?" }],
        stream: false,
    })) as ChatCompletion;

    console.log(`User:   What's my name?`);
    console.log(`Model:  ${response.choices[0]?.message.content}`);
    console.log("(Model should have forgotten — history was reset)\n");
}

// ============================================================================
// 9. Streaming with tool calls — the stream emits tool_calls deltas
// ============================================================================

async function streamingWithToolsExample(client: OpenAIMock): Promise<void> {
    console.log("=== Streaming with tools ===\n");

    const stream = (await client.chat.completions.create({
        messages: [{ role: "user", content: "Calculate (15 + 7) * 3" }],
        tools: collected.tools,
        stream: true,
    })) as AsyncIterable<ChatCompletionChunk>;

    let content = "";
    let toolCalls: ChatCompletionChunk["choices"][0]["delta"]["tool_calls"];

    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
            content += delta.content;
            process.stdout.write(delta.content);
        }
        if (delta?.tool_calls) {
            toolCalls = delta.tool_calls;
        }
        if (chunk.choices[0]?.finish_reason) {
            console.log(`\n[finish: ${chunk.choices[0].finish_reason}]`);
        }
    }

    if (toolCalls && toolCalls.length > 0) {
        console.log("\nTool calls detected:");
        for (const tc of toolCalls) {
            console.log(`  - ${tc.function.name}(${tc.function.arguments})`);
        }
    }
    console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    console.log("OpenAISDKMock — Example\n");
    console.log("Model path:", MODEL_PATH);
    console.log();

    const { model, context, sequence } = await loadModel();
    const client = createClient(model, context, sequence);

    try {
        await nonStreamingExample(client);
        await streamingExample(client);
        await toolCallingExample(client);
        await multiTurnExample(client);
        await resetExample(client);
        await streamingWithToolsExample(client);
    } finally {
        // Clean up (optional — GC handles it, but explicit is safer).
        context.dispose();
        // model.dispose(); // uncomment if you want to free model memory too
    }

    console.log("Done.");
}

main().catch((err) => {
    console.error("Example failed:", err);
    process.exit(1);
});
