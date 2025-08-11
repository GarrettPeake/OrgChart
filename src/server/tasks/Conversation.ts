export enum ConversationParticipant {
	PARENT = 'PARENT',
	CHILD = 'CHILD',
}

export interface ConversationMessage {
	from: ConversationParticipant;
	content: string;
}

export class Conversation {
	public readonly id: string;
	private parentMessage?: ConversationMessage;
	private childMessage?: ConversationMessage;
	public pendingToolCallId?: string;

	constructor() {
		this.id = crypto.randomUUID();
	}

	/**
	 * Add a message to the conversation
	 */
	addMessage(from: ConversationParticipant, content: string): void {
		const message: ConversationMessage = {
			from,
			content,
		};

		if (from === ConversationParticipant.PARENT) {
			this.parentMessage = message;
		} else {
			this.childMessage = message;
		}
	}

	/**
	 * Peek at the message from a specific participant without consuming it
	 */
	peekMessage(from: ConversationParticipant): ConversationMessage | undefined {
		if (from === ConversationParticipant.PARENT) {
			return this.parentMessage;
		} else {
			return this.childMessage;
		}
	}

	/**
	 * Take (consume) the message from a specific participant
	 */
	takeMessage(from: ConversationParticipant): ConversationMessage | undefined {
		if (from === ConversationParticipant.PARENT) {
			const message = this.parentMessage;
			this.parentMessage = undefined;
			return message;
		} else {
			const message = this.childMessage;
			this.childMessage = undefined;
			return message;
		}
	}

	/**
	 * Check if there's a message from a specific participant
	 */
	hasMessage(from: ConversationParticipant): boolean {
		return this.peekMessage(from) !== undefined;
	}
}
