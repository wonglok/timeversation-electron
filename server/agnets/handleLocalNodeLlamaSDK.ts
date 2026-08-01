import path from "node:path";
import fs from "fs";
/*


import {fileURLToPath} from "url";
import path from "path";
import {
    getLlama, LlamaChat, ChatModelFunctions, ChatHistoryItem,
    ChatModelResponse, ChatModelFunctionCall
} from "node-llama-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const llama = await getLlama();
const model = await llama.loadModel({
    modelPath: path.join(
        __dirname, "models", "Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf"
    )
});
const context = await model.createContext();
const llamaChat = new LlamaChat({
    contextSequence: context.getSequence()
});

let chatHistory = llamaChat.chatWrapper.generateInitialChatHistory();

const prompt = "Give me the result of 2 dice rolls";
const functionDefinitions = {
    getRandomNumber: {
        description: "Get a random number",
        params: {
            type: "object",
            properties: {
                min: {
                    type: "number"
                },
                max: {
                    type: "number"
                }
            }
        }
    }
} satisfies ChatModelFunctions;
function getRandomNumber(params: {min: number, max: number}) {
    return Math.floor(
        (Math.random() * (params.max - params.min + 1)) +
        params.min
    );
}

// add the user prompt to the chat history
chatHistory.push({
    type: "user",
    text: prompt
});

// add a slot for the model response, for the model to complete.
// if we want the model response to start with a specific text,
// we can do so by adding it to the response array
chatHistory.push({
    type: "model",
    response: []
});

console.log("User: " + prompt);

let chatHistoryContextWindow: ChatHistoryItem[] | undefined;
let lastContextShiftMetadata: any;

while (true) {
    const res = await llamaChat.generateResponse(chatHistory, {
        functions: functionDefinitions,
        onFunctionCall(functionCall) {
            // we can use this callback to start performing
            // the function as soon as the model calls it
            console.log(
                "model called function", functionCall.functionName,
                "with params", functionCall.params
            );
        },
        contextShift: {
            lastEvaluationMetadata: lastContextShiftMetadata
        },
        lastEvaluationContextWindow: {
            history: chatHistoryContextWindow
        },
    });
    chatHistory = res.lastEvaluation.cleanHistory;
    chatHistoryContextWindow = res.lastEvaluation.contextWindow;
    lastContextShiftMetadata = res.lastEvaluation.contextShiftMetadata;

    // print the text the model generated before calling functions
    if (res.response !== "") {
        const fullResponse = res.fullResponse
            .map((item) => {
                if (typeof item === "string")
                    return item;
                else if (item.type === "segment") {
                    let res = "";
                    if (item.startTime != null)
                        res += ` [segment start: ${item.segmentType}] `;
    
                    res += item.text;
    
                    if (item.endTime != null)
                        res += ` [segment end: ${item.segmentType}] `;
    
                    return res;
                }
    
                return "";
            })
            .join("");
        
        console.log("AI: " + res.response);
        console.log("Full response:", fullResponse);
    }

    // when there are no function calls,
    // it means the model has finished generating the response
    if (res.functionCalls == null)
        break;

    // perform the function calls
    const callItems: ChatModelFunctionCall[] = res.functionCalls
        .map((functionCall) => {
            if (functionCall.functionName !== "getRandomNumber")
                throw new Error("only function getRandomNumber is supported");
            
            const res = getRandomNumber(functionCall.params);
            console.log(
                "Responding to function", functionCall.functionName,
                "with params", functionCall.params,
                "with result", res
            );

            const functionDefinition =
                functionDefinitions[functionCall.functionName];
    
            return {
                type: "functionCall",
                name: functionCall.functionName,
                params: functionCall.params,
                rawCall: functionCall.raw,
                description: functionDefinition?.description,
                result: res
            } satisfies ChatModelFunctionCall;
        });

    // needed for maintaining the existing context sequence state
    // with parallel function calling,
    // and avoiding redundant context shifts
    callItems[0]!.startsNewChunk = true;


    if (chatHistory.at(-1)?.type !== "model")
        chatHistory.push({
            type: "model",
            response: []
        });

    if (chatHistoryContextWindow.at(-1)?.type !== "model")
        chatHistoryContextWindow.push({
            type: "model",
            response: []
        });

    const modelResponse = chatHistory.at(-1)! as ChatModelResponse;
    const contextWindowModelResponse =
        chatHistoryContextWindow.at(-1)! as ChatModelResponse;

    // add the function calls and their results
    // both to the chat history and the context window chat history
    for (const callItem of callItems) {
        modelResponse.response.push(callItem);
        contextWindowModelResponse.response.push(callItem);
    }
}
    

*/

import {
    getLlama,
    LlamaContext,
    LlamaContextSequence,
    LlamaModel,
} from "node-llama-cpp";
import { OpenAIMock, OpenAIMockConfig } from "../node-llama-cpp/OpenAISDKMock";
import { app } from "electron";

const resolvedModelsDir = path.join(
    app.getPath("appData"),
    "timeversation",
    "ai-models",
);

// ============================================================================
// Types
// ============================================================================

interface LlmState {
    model: LlamaModel;
    context: LlamaContext;
    sequence: LlamaContextSequence;
    client: OpenAIMock;
    modelPath: string;
}
// ------------------------------------------------------------------
// Model state (lazy singleton)
// ------------------------------------------------------------------

let state: LlmState | null = null;
let currentModelPath: string | null = null;

/** Dispose current model, context, and sequence; clear state */
function disposeState() {
    if (!state) return;
    try {
        state.sequence.dispose();
    } catch {
        /* ignore */
    }
    try {
        state.context.dispose();
    } catch {
        /* ignore */
    }
    try {
        state.model.dispose();
    } catch {
        /* ignore */
    }
    state = null;
    currentModelPath = null;
}

/** Find the first .gguf file in the models directory */
function findGgufFile(dir: string): string | null {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".gguf")) {
                return path.join(dir, entry.name);
            }
        }
        return null;
    } catch {
        return null;
    }
}

/** Load (or return cached) the Llama model + OpenAIMock client */
async function getClient(): Promise<OpenAIMock> {
    if (state && currentModelPath === state.modelPath) {
        return state.client;
    }

    const modelPath = findGgufFile(resolvedModelsDir);
    if (!modelPath) {
        throw new Error(
            `No .gguf model found in ${resolvedModelsDir}. ` +
                `Download a model first via POST /api/llm/models/pull.`,
        );
    }

    // Dispose previous state if switching models
    disposeState();

    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const contextSize = Number(process.env.LLM_CONTEXT_SIZE) || 128000;
    const context = await model.createContext({ contextSize });
    const sequence = context.getSequence();

    const config: OpenAIMockConfig = {
        model,
        context,
        contextSequence: sequence,
        modelName: path.basename(modelPath, ".gguf"),
        systemPrompt:
            "You are a helpful assistant. Keep responses clear and concise.",
    };

    const client = new OpenAIMock(config);
    state = { model, context, sequence, client, modelPath };
    currentModelPath = modelPath;

    return client;
}

export const handleLocalNodeLlamaSDK = async ({
    req,
    res,
    message,
    workspacePath = "",
    conversationId,
}: {
    req: any;
    res: any;
    message: string;
    workspacePath?: string;
    conversationId?: string;
}) => {
    //
    //
    //
    //
};
