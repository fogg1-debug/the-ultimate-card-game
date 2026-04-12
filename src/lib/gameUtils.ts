import { Card, Suit, Rank, Player, GameSettings, GameState } from '../types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks: number, includeJokers: boolean): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${d}-${suit}-${rank}`,
          suit,
          rank,
        });
      }
    }
    if (includeJokers) {
      deck.push({ id: `${d}-red-joker`, suit: 'joker', rank: 'RJ', isJoker: true, jokerType: 'red' });
      deck.push({ id: `${d}-black-joker`, suit: 'joker', rank: 'BJ', isJoker: true, jokerType: 'black' });
    }
  }
  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function calculateCardScore(card: Card): number {
  if (card.isJoker) return 25;
  if (card.rank === 'A') return 11;
  if (card.rank === '2') return 15;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank) || 0;
}

export function getInitialGameState(settings: GameSettings, playerNames: string[]): GameState {
  const includeJokers = settings.mode === 'ultimate';
  let deck = createDeck(settings.numDecks, includeJokers);
  deck = shuffle(deck);

  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index}`,
    name,
    hand: [],
    score: settings.startingScore,
    isAI: settings.playMode === 'computer' && index > 0,
    isEliminated: false,
    hasDeclaredLastCard: false,
  }));

  // Deal cards
  for (let i = 0; i < settings.cardsPerPlayer; i++) {
    for (const player of players) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  // Initial discard
  let firstDiscard = deck.pop()!;
  // Ensure first discard is not a special card or joker for simplicity at start
  while (['2', '8', 'J', 'A'].includes(firstDiscard.rank) || firstDiscard.isJoker) {
    deck.unshift(firstDiscard);
    deck = shuffle(deck);
    firstDiscard = deck.pop()!;
  }

  // For Ultimate mode, pick a random joker card
  let blackJokerTargetCard = null;
  if (settings.mode === 'ultimate') {
    const nonSpecialRanks = RANKS.filter(r => !['2', '8', 'J', 'A'].includes(r));
    const randomRank = nonSpecialRanks[Math.floor(Math.random() * nonSpecialRanks.length)];
    const randomSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
    blackJokerTargetCard = { id: 'joker-target', suit: randomSuit, rank: randomRank };
  }

  return {
    players,
    currentPlayerIndex: 0,
    drawPile: deck,
    discardPile: [firstDiscard],
    currentSuit: firstDiscard.suit,
    currentRank: firstDiscard.rank,
    direction: 1,
    drawStackCount: 0,
    skipNextPlayer: false,
    gameStatus: 'playing',
    winnerId: null,
    blackJokerTargetCard,
    lastActionMessage: `Game started! ${players[0].name}'s turn.`,
    roundNumber: 1,
  };
}

export function isValidMove(card: Card, gameState: GameState, settings: GameSettings): { valid: boolean; reason?: string } {
  const { currentSuit, currentRank, drawStackCount, blackJokerTargetCard } = gameState;
  const { mode } = settings;

  // If there's a draw stack, must play a 2 or pick up
  if (drawStackCount > 0) {
    if (card.rank === '2') return { valid: true };
    // Red Joker can act as a 2 in Ultimate mode
    if (settings.mode === 'ultimate' && card.rank === 'RJ') return { valid: true };
    return { valid: false, reason: 'Must play a 2 to stack or draw cards.' };
  }

  // Red Joker can be played at any time in Ultimate
  if (settings.mode === 'ultimate' && card.rank === 'RJ') return { valid: true };

  // Black Joker can only be played on the specific joker_card
  if (settings.mode === 'ultimate' && card.rank === 'BJ') {
    if (currentSuit === blackJokerTargetCard?.suit && currentRank === blackJokerTargetCard?.rank) {
      return { valid: true };
    }
    return { valid: false, reason: `Black Joker can only be played on ${blackJokerTargetCard?.rank} of ${blackJokerTargetCard?.suit}.` };
  }

  // Ace rules
  if (card.rank === 'A') {
    if (settings.mode === 'classic') return { valid: true }; // Ace any time in classic
    if (settings.mode === 'ultimate') {
      if (card.suit === currentSuit) return { valid: true };
      return { valid: false, reason: 'In Ultimate mode, Ace must match the current suit.' };
    }
  }

  // Standard matching
  if (card.suit === currentSuit || card.rank === currentRank) {
    return { valid: true };
  }

  return { valid: false, reason: 'Card must match suit or rank.' };
}
