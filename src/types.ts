export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'RJ' | 'BJ';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isJoker?: boolean;
  jokerType?: 'red' | 'black';
  transformedToRank?: Rank;
  transformedToSuit?: Suit;
}

export type GameMode = 'classic' | 'ultimate';
export type PlayMode = 'local' | 'computer';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  isAI: boolean;
  isEliminated: boolean;
  hasDeclaredLastCard: boolean;
}

export interface GameSettings {
  mode: GameMode;
  playMode: PlayMode;
  difficulty: Difficulty;
  numDecks: 1 | 2;
  startingScore: number;
  cardsPerPlayer: number;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  currentSuit: Suit;
  currentRank: Rank;
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  drawStackCount: number;
  skipNextPlayer: boolean;
  gameStatus: 'menu' | 'playing' | 'round-end' | 'game-over';
  winnerId: string | null;
  blackJokerTargetCard: Card | null; // For Ultimate mode Black Joker
  lastActionMessage: string;
  roundNumber: number;
}
