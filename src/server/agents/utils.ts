// TODO: This function will be used later when we implement custom user instructions
export function buildUserInstructions(
	globalRulesFileInstructions?: string,
	localRulesFileInstructions?: string,
	clineIgnoreInstructions?: string,
	preferredLanguageInstructions?: string,
) {
	let customInstructions = '';
	if (preferredLanguageInstructions) {
		customInstructions += preferredLanguageInstructions + '\n\n';
	}
	if (globalRulesFileInstructions) {
		customInstructions += globalRulesFileInstructions + '\n\n';
	}
	if (localRulesFileInstructions) {
		customInstructions += localRulesFileInstructions + '\n\n';
	}
	if (clineIgnoreInstructions) {
		customInstructions += clineIgnoreInstructions;
	}

	return `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

${customInstructions.trim()}`;
}
