// The message a player signs to attach a wallet to a username (proves control; no transaction, no keys).
export const signText = (player: string, week: string) => `HL Fantasy League: I am ${player} for ${week}. (Free game, no transaction.)`;
