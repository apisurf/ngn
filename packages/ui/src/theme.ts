import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

if (!defaultConfig.theme) {
	throw new Error("Missing defaultConfig.theme");
}

export const config = defineConfig({
	conditions: defaultConfig.conditions,
	cssVarsPrefix: defaultConfig.cssVarsPrefix,
	cssVarsRoot: defaultConfig.cssVarsRoot,
	preflight: defaultConfig.preflight,
	utilities: defaultConfig.utilities,
	globalCss: {
		...defaultConfig.globalCss,
		"*": {
			boxSizing: "border-box",
		},
		"html, body, #app": {
			margin: 0,
			padding: 0,
			height: "100%",
		},
		body: {
			background: "linear-gradient(135deg, #0f1219 0%, #151c28 100%)",
			color: "{colors.gray.300}",
		},
	},
	theme: {
		animationStyles: defaultConfig.theme.animationStyles,
		breakpoints: defaultConfig.theme.breakpoints,
		keyframes: defaultConfig.theme.keyframes,
		layerStyles: defaultConfig.theme.layerStyles,
		tokens: {
			animations: defaultConfig.theme.tokens?.animations,
			aspectRatios: defaultConfig.theme.tokens?.aspectRatios,
			blurs: defaultConfig.theme.tokens?.blurs,
			borders: defaultConfig.theme.tokens?.borders,
			cursor: defaultConfig.theme.tokens?.cursor,
			durations: defaultConfig.theme.tokens?.durations,
			easings: defaultConfig.theme.tokens?.easings,
			fontSizes: defaultConfig.theme.tokens?.fontSizes,
			fontWeights: defaultConfig.theme.tokens?.fontWeights,
			fonts: defaultConfig.theme.tokens?.fonts,
			letterSpacings: defaultConfig.theme.tokens?.letterSpacings,
			lineHeights: defaultConfig.theme.tokens?.lineHeights,
			radii: defaultConfig.theme.tokens?.radii,
			sizes: defaultConfig.theme.tokens?.sizes,
			spacing: defaultConfig.theme.tokens?.spacing,
			zIndex: defaultConfig.theme.tokens?.zIndex,
			colors: {
				current: {
					value: "currentColor",
				},
				transparent: {
					value: "transparent",
				},
				white: {
					value: "#FFFFFF",
				},
				black: {
					value: "#09090B",
				},
				gray: {
					"50": { value: "rgb(248 250 252)" },
					"100": { value: "rgb(241 245 249)" },
					"200": { value: "rgb(226 232 240)" },
					"300": { value: "rgb(203 213 225)" },
					"400": { value: "rgb(148 163 184)" },
					"500": { value: "rgb(100 116 139)" },
					"600": { value: "rgb(71 85 105)" },
					"700": { value: "rgb(51 65 85)" },
					"800": { value: "rgb(30 41 59)" },
					"900": { value: "rgb(15 23 42)" },
					"950": { value: "rgb(2 6 23)" },
				},
				blue: {
					"50": {
						value: "rgb(236 254 255)",
					},
					"100": {
						value: "rgb(207 250 254)",
					},
					"200": {
						value: "rgb(165 243 252)",
					},
					"300": {
						value: "rgb(103 232 249)",
					},
					"400": {
						value: "rgb(34 211 238)",
					},
					"500": {
						value: "rgb(6 182 212)", // base
					},
					"600": {
						value: "rgb(8 145 178)",
					},
					"700": {
						value: "rgb(14 116 144)",
					},
					"800": {
						value: "rgb(21 94 117)",
					},
					"900": {
						value: "rgb(22 78 99)",
					},
					"950": {
						value: "rgb(8 51 68)",
					},
				},
				green: {
					"50": {
						value: "#f0fdf4",
					},
					"100": {
						value: "#dcfce7",
					},
					"200": {
						value: "#bbf7d0",
					},
					"300": {
						value: "#86efac",
					},
					"400": {
						value: "#4ade80",
					},
					"500": {
						value: "#22c55e",
					},
					"600": {
						value: "#16a34a",
					},
					"700": {
						value: "#116932",
					},
					"800": {
						value: "#124a28",
					},
					"900": {
						value: "#042713",
					},
					"950": {
						value: "#03190c",
					},
				},
				red: {
					"50": {
						value: "#fef2f2",
					},
					"100": {
						value: "#fee2e2",
					},
					"200": {
						value: "#fecaca",
					},
					"300": {
						value: "#fca5a5",
					},
					"400": {
						value: "#f87171",
					},
					"500": {
						value: "#ef4444",
					},
					"600": {
						value: "#dc2626",
					},
					"700": {
						value: "#991919",
					},
					"800": {
						value: "#511111",
					},
					"900": {
						value: "#300c0c",
					},
					"950": {
						value: "#1f0808",
					},
				},
				orange: {
					"50": {
						value: "#fff7ed",
					},
					"100": {
						value: "#ffedd5",
					},
					"200": {
						value: "#fed7aa",
					},
					"300": {
						value: "#fdba74",
					},
					"400": {
						value: "#fb923c",
					},
					"500": {
						value: "#f97316",
					},
					"600": {
						value: "#ea580c",
					},
					"700": {
						value: "#92310a",
					},
					"800": {
						value: "#6c2710",
					},
					"900": {
						value: "#3b1106",
					},
					"950": {
						value: "#220a04",
					},
				},
			},
		},
		// https://www.chakra-ui.com/docs/theming/semantic-tokens
		semanticTokens: {
			radii: defaultConfig.theme.semanticTokens?.radii,
			shadows: {
				...defaultConfig.theme.semanticTokens?.shadows,
				panel: { value: "0 4px 24px 0 rgba(14,165,233,0.12)" },
				glow: {
					xs: {
						value: "0 1px 6px 0 {colors.blue.500/15}",
					},
					sm: {
						value: "0 2px 12px 0 {colors.blue.500/15}",
					},
					md: {
						value: "0 4px 24px 0 {colors.blue.500/15}",
					},
					lg: {
						value: "0 4px 48px 0 {colors.blue.500/15}",
					},
				},
				glowActive: {
					xs: {
						value: "0 1px 6px 0 {colors.blue.500/40}",
					},
					sm: {
						value: "0 2px 12px 0 {colors.blue.500/40}",
					},
					md: {
						value: "0 4px 24px 0 {colors.blue.500/40}",
					},
					lg: {
						value: "0 4px 48px 0 {colors.blue.500/40}",
					},
				},
			},
			colors: {
				bg: {
					DEFAULT: {
						value: "{colors.black}",
					},
					subtle: {
						value: "{colors.gray.950}",
					},
					muted: {
						value: "{colors.gray.900}",
					},
					emphasized: {
						value: "{colors.gray.800}",
					},
					inverted: {
						value: "{colors.white}",
					},
					panel: {
						value: "{colors.gray.950}",
					},
					error: {
						value: "{colors.red.500}",
					},
					warning: {
						value: "{colors.orange.500}",
					},
					success: {
						value: "{colors.green.500}",
					},
					info: {
						value: "{colors.blue.500}",
					},
					glowSubtle: {
						value: "{colors.blue.500/10}",
					},
					glow: {
						value: "{colors.blue.500/20}",
					},
					panelLight: {
						value: "#1e293b80",
					},
					table: {
						value: "transparent",
					},
					tableHeader: {
						value: "rgba(255, 255, 255, 0.02)",
					},
					tableRowHover: {
						value: "rgba(255, 255, 255, 0.04)",
					},
				},
				fg: {
					DEFAULT: {
						value: "{colors.gray.400}",
					},
					muted: {
						value: "{colors.gray.500}",
					},
					subtle: {
						value: "{colors.gray.600}",
					},
					inverted: {
						value: "{colors.black}",
					},
					error: {
						value: "{colors.red.400}",
					},
					warning: {
						value: "{colors.orange.300}",
					},
					success: {
						value: "{colors.green.300}",
					},
					info: {
						value: "{colors.blue.300}",
					},
					emphasized: {
						value: "{colors.white}",
					},
				},
				border: {
					DEFAULT: {
						value: "{colors.gray.700}",
					},
					muted: {
						value: "{colors.gray.800}",
					},
					subtle: {
						value: "{colors.gray.950}",
					},
					emphasized: {
						value: "{colors.gray.600}",
					},
					inverted: {
						value: "{colors.gray.200}",
					},
					error: {
						value: "{colors.red.400}",
					},
					warning: {
						value: "{colors.orange.400}",
					},
					success: {
						value: "{colors.green.400}",
					},
					info: {
						value: "{colors.blue.400}",
					},
					glow: {
						value: "{colors.blue.500/40}",
					},
					glowEmphasized: {
						value: "{colors.blue.500/50}",
					},
					panel: {
						value: "{colors.gray.800}",
					},
					panelLight: {
						value: "#33415580",
					},
					table: {
						value: "rgba(255, 255, 255, 0.06)",
					},
					tableRow: {
						value: "rgba(255, 255, 255, 0.04)",
					},
				},
			},
		},
		// https://www.chakra-ui.com/docs/theming/recipes
		recipes: defaultConfig.theme.recipes,
		// https://www.chakra-ui.com/docs/theming/slot-recipes
		slotRecipes: defaultConfig.theme.slotRecipes,
		// https://www.chakra-ui.com/docs/theming/text-styles
		textStyles: defaultConfig.theme.textStyles,
	},
});

console.log(defaultConfig.theme);

export const system = createSystem(config);
