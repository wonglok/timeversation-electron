import type { SVGProps, ComponentType } from "react";
import ClaudeCode from "@lobehub/icons/es/ClaudeCode";
import Codex from "@lobehub/icons/es/Codex";
import Qwen from "@lobehub/icons/es/Qwen";
import KiloCode from "@lobehub/icons/es/KiloCode";
import OpenCode from "@lobehub/icons/es/OpenCode";
import Kimi from "@lobehub/icons/es/Kimi";
import Pi from "@lobehub/icons/es/Pi";
import GeminiCLI from "@lobehub/icons/es/GeminiCLI";
import GithubCopilot from "@lobehub/icons/es/GithubCopilot";
import Cursor from "@lobehub/icons/es/Cursor";
import Windsurf from "@lobehub/icons/es/Windsurf";
import Cline from "@lobehub/icons/es/Cline";
import RooCode from "@lobehub/icons/es/RooCode";

// ============================================================================
// Icon name type — matches the `icon` field on agent definitions
// ============================================================================

export type IconName =
	// Branded (lobehub)
	| "claude"
	| "codex"
	| "qwen"
	| "kilocode"
	| "opencode"
	| "kimi"
	| "pi"
	| "gemini"
	| "copilot"
	| "cursor"
	| "windsurf"
	| "cline"
	| "roocode"
	// Custom SVG (unbranded / no lobehub match)
	| "handshake"
	| "cloud"
	| "cat"
	| "heart"
	| "package"
	// Generic UI icons
	| "hourglass"
	| "lock"
	| "plug"
	| "search"
	| "alert-triangle"
	| "check-circle"
	| "sparkles"
	// Legacy (kept for backward compat — mapped to lobehub)
	| "zap"
	| "unlock"
	| "moon"
	| "diamond"
	| "mouse"
	| "wave"
	| "octopus"
	| "arm"
	| "kangaroo";

// ============================================================================
// Branded icons (lobehub)
// ============================================================================

type BrandIconComponent = ComponentType<{
	size?: string | number;
	color?: string;
	className?: string;
	style?: React.CSSProperties;
}>;

const BRANDED_ICONS: Record<string, BrandIconComponent> = {
	claude: ClaudeCode,
	codex: Codex,
	qwen: Qwen,
	kilocode: KiloCode,
	opencode: OpenCode,
	kimi: Kimi,
	pi: Pi,
	gemini: GeminiCLI,
	copilot: GithubCopilot,
	cursor: Cursor,
	windsurf: Windsurf,
	cline: Cline,
	roocode: RooCode,
};

// ============================================================================
// Legacy aliases → branded
// ============================================================================

const BRAND_ALIASES: Record<string, string> = {
	zap: "kilocode",
	unlock: "opencode",
	moon: "kimi",
	diamond: "gemini",
	mouse: "cursor",
	wave: "windsurf",
	octopus: "copilot",
	arm: "cline",
	kangaroo: "roocode",
};

// ============================================================================
// Custom SVG path data (24×24, 1.5px stroke, round joins/caps)
// ============================================================================

const ICON_PATHS: Record<string, string> = {
	handshake: [
		"M11 17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4l-2-2 1.5-1.5L8 12h2l3-2",
		"M13 17a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-4l2-2-1.5-1.5L16 12h-2l-3-2",
		"M12 10V7",
		"M8.5 8.5 12 12l3.5-3.5",
	].join(" "),

	cloud: "M17.5 19H6a5 5 0 0 1-1.4-9.8A7 7 0 0 1 17.5 7a4.5 4.5 0 0 1 0 9 3 3 0 0 0 0 3Z",

	cat: [
		"M12 5a4 4 0 0 1 4 4v3l2-1v2l-2 1v2a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4v-2l-2-1v-2l2 1V9a4 4 0 0 1 4-4Z",
		"M10 10h.01",
		"M14 10h.01",
		"M12 13v2",
	].join(" "),

	heart: "M19.5 13.6 12 21l-7.5-7.4A5 5 0 0 1 12 7a5 5 0 0 1 7.5 6.6Z",

	package: [
		"M12 3 2 8l10 5 10-5-10-5Z",
		"M2 8v8l10 5 10-5V8",
		"M12 13v8",
		"M8 10.5 2 8",
		"M16 10.5 22 8",
	].join(" "),

	hourglass: [
		"M5 3h14",
		"M5 21h14",
		"M7 3v5a5 5 0 0 0 5 5h0a5 5 0 0 0 5-5V3",
		"M7 21v-5a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v5",
	].join(" "),

	lock: [
		"M8 11V7a4 4 0 0 1 8 0v4",
		"M3 11h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
		"M10 15a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
	].join(" "),

	plug: [
		"M9 2v4",
		"M15 2v4",
		"M7 6h10l1 5-2 3v6h-8v-6l-2-3 1-5Z",
	].join(" "),

	search: [
		"M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
		"M21 21l-5-5",
	].join(" "),

	"alert-triangle": [
		"M12 9v4",
		"M12 17h.01",
		"M10.3 3.8 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z",
	].join(" "),

	"check-circle": [
		"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
		"M9 12l2 2 4-4",
	].join(" "),

	sparkles: [
		"M12 3v2",
		"M12 19v2",
		"M5.6 5.6l1.4 1.4",
		"M17 17l1.4 1.4",
		"M3 12h2",
		"M19 12h2",
		"M5.6 18.4l1.4-1.4",
		"M17 7l1.4-1.4",
	].join(" "),
};

// ============================================================================
// Helpers
// ============================================================================

/** Resolve legacy aliases to their canonical branded name */
function resolveBrand(name: string): string {
	return BRAND_ALIASES[name] ?? name;
}

/** Default icon to use when an agent has no icon defined */
export const DEFAULT_ICON: IconName = "plug";

/**
 * Resolve an icon string to an IconName.
 * Handles legacy aliases. Falls back to `plug`.
 */
export function resolveIconName(raw: string | undefined): IconName {
	if (!raw) return DEFAULT_ICON;
	const canonical = resolveBrand(raw);
	if (canonical in BRANDED_ICONS || canonical in ICON_PATHS) {
		return canonical as IconName;
	}
	return DEFAULT_ICON;
}

// ============================================================================
// Component
// ============================================================================

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
	name: IconName | string;
	/** Override the default 1.25rem size */
	size?: number | string;
}

export function Icon({ name, size = "1.25rem", className, ...rest }: IconProps) {
	const canonical = resolveBrand(name as string);

	// Branded lobehub icon
	const BrandComponent = BRANDED_ICONS[canonical];
	if (BrandComponent) {
		return (
			<BrandComponent
				size={size}
				className={className}
				{...rest}
			/>
		);
	}

	// Custom SVG path icon
	const d = ICON_PATHS[canonical];
	if (!d) return null;

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
			{...rest}
		>
			<path d={d} />
		</svg>
	);
}
