// The 20 most popular AI/LLM API providers Syncvida can run on. Most expose an
// OpenAI-compatible endpoint, so one backend code path (baseUrl + key + model)
// covers them; "kind" tells the caller which API shape to use.
export type AiProviderKind = "openai" | "anthropic" | "gemini" | "compat" | "builtin";

export interface AiProvider {
  id: string;
  name: string;
  kind: AiProviderKind;
  /** OpenAI-compatible base URL (where applicable). */
  baseUrl?: string;
  /** Where the user creates a key. */
  keyUrl?: string;
  placeholder: string;
  defaultModel: string;
  /** No user key needed (platform-provided). */
  builtin?: boolean;
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: "openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys", placeholder: "sk-...", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", name: "Anthropic (Claude)", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", keyUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-...", defaultModel: "claude-sonnet-4-20250514" },
  { id: "gemini", name: "Google Gemini", kind: "compat", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/app/apikey", placeholder: "AIza...", defaultModel: "gemini-2.0-flash" },
  { id: "grok", name: "xAI (Grok)", kind: "compat", baseUrl: "https://api.x.ai/v1", keyUrl: "https://console.x.ai", placeholder: "xai-...", defaultModel: "grok-2-latest" },
  { id: "mistral", name: "Mistral AI", kind: "compat", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys", placeholder: "...", defaultModel: "mistral-large-latest" },
  { id: "meta", name: "Meta Llama", kind: "compat", baseUrl: "https://api.llama.com/compat/v1", keyUrl: "https://llama.developer.meta.com", placeholder: "LLM|...", defaultModel: "Llama-3.3-70B-Instruct" },
  { id: "groq", name: "Groq", kind: "compat", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", placeholder: "gsk_...", defaultModel: "llama-3.3-70b-versatile" },
  { id: "deepseek", name: "DeepSeek", kind: "compat", baseUrl: "https://api.deepseek.com", keyUrl: "https://platform.deepseek.com/api_keys", placeholder: "sk-...", defaultModel: "deepseek-chat" },
  { id: "perplexity", name: "Perplexity", kind: "compat", baseUrl: "https://api.perplexity.ai", keyUrl: "https://www.perplexity.ai/settings/api", placeholder: "pplx-...", defaultModel: "sonar" },
  { id: "cohere", name: "Cohere", kind: "compat", baseUrl: "https://api.cohere.ai/compatibility/v1", keyUrl: "https://dashboard.cohere.com/api-keys", placeholder: "...", defaultModel: "command-r-plus" },
  { id: "openrouter", name: "OpenRouter", kind: "compat", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys", placeholder: "sk-or-...", defaultModel: "openai/gpt-4o-mini" },
  { id: "together", name: "Together AI", kind: "compat", baseUrl: "https://api.together.xyz/v1", keyUrl: "https://api.together.ai/settings/api-keys", placeholder: "...", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "fireworks", name: "Fireworks AI", kind: "compat", baseUrl: "https://api.fireworks.ai/inference/v1", keyUrl: "https://fireworks.ai/account/api-keys", placeholder: "fw_...", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  { id: "nvidia", name: "NVIDIA NIM", kind: "compat", baseUrl: "https://integrate.api.nvidia.com/v1", keyUrl: "https://build.nvidia.com", placeholder: "nvapi-...", defaultModel: "meta/llama-3.3-70b-instruct" },
  { id: "huggingface", name: "Hugging Face", kind: "compat", baseUrl: "https://router.huggingface.co/v1", keyUrl: "https://huggingface.co/settings/tokens", placeholder: "hf_...", defaultModel: "meta-llama/Llama-3.3-70B-Instruct" },
  { id: "ai21", name: "AI21 Labs", kind: "compat", baseUrl: "https://api.ai21.com/studio/v1", keyUrl: "https://studio.ai21.com/account/api-key", placeholder: "...", defaultModel: "jamba-1.5-large" },
  { id: "qwen", name: "Alibaba Qwen", kind: "compat", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyUrl: "https://dashscope.console.aliyun.com", placeholder: "sk-...", defaultModel: "qwen-max" },
  { id: "moonshot", name: "Moonshot (Kimi)", kind: "compat", baseUrl: "https://api.moonshot.ai/v1", keyUrl: "https://platform.moonshot.ai/console/api-keys", placeholder: "sk-...", defaultModel: "moonshot-v1-8k" },
  { id: "reka", name: "Reka AI", kind: "compat", baseUrl: "https://api.reka.ai/v1", keyUrl: "https://platform.reka.ai", placeholder: "...", defaultModel: "reka-core" },
];

export const AI_PROVIDER_BY_ID: Record<string, AiProvider> =
  Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p]));
