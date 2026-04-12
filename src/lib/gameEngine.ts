import { Card, GameState, Player, GameSettings, Suit, Rank } from '../types';
import { shuffle, isValidMove, calculateCardScore } from './gameUtils';

export function playCard(gameState: GameState, playerIndex: number, cardId: string, settings: GameSettings, chosenSuit?: Suit, chosenRank?: Rank): GameState {
  const player = gameState.players[playerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return gameState;

  const card = player.hand[cardIndex];
  const moveValidation = isValidMove(card, gameState, settings);
  if (!moveValidation.valid) return { ...gameState, lastActionMessage: moveValidation.reason || 'Invalid move.' };

  // Ultimate mode: Cannot finish on a special card
  if (settings.mode === 'ultimate' && player.hand.length === 1) {
    if (['2', '8', 'J', 'A'].includes(card.rank) || card.isJoker) {
      return { ...gameState, lastActionMessage: 'Cannot finish on a special card in Ultimate mode!' };
    }
  }

  // Handle Red Joker transformation
  let finalCard = { ...card };
  if (card.rank === 'RJ') {
    finalCard.transformedToRank = chosenRank || 'A';
    finalCard.transformedToSuit = chosenSuit || 'hearts';
  }

  // Remove card from hand
  const newHand = [...player.hand];
  newHand.splice(cardIndex, 1);

  const newPlayers = [...gameState.players];
  newPlayers[playerIndex] = { ...player, hand: newHand };

  // Update discard pile and current state
  const newDiscardPile = [finalCard, ...gameState.discardPile];
  let newSuit = finalCard.transformedToSuit || finalCard.suit;
  let newRank = finalCard.transformedToRank || finalCard.rank;
  let newDrawStackCount = gameState.drawStackCount;
  let newDirection = gameState.direction;
  let skipNext = false;
  let message = `${player.name} played ${finalCard.rank === 'RJ' ? 'Red Joker' : finalCard.rank} of ${finalCard.suit}.`;

  // Handle Special Cards
  if (newRank === '2') {
    newDrawStackCount += 2;
    message = `${player.name} played a 2! Next player must play a 2 or draw ${newDrawStackCount}.`;
  } else if (newRank === '8') {
    skipNext = true;
    message = `${player.name} played an 8! Next player skips a turn.`;
  } else if (newRank === 'J') {
    newDirection = (gameState.direction === 1 ? -1 : 1) as 1 | -1;
    message = `${player.name} played a Jack! Direction reversed.`;
    // In 2 player game, Jack acts like a skip
    if (gameState.players.length === 2) {
      skipNext = true;
    }
  } else if (newRank === 'A') {
    newSuit = chosenSuit || newSuit;
    message = `${player.name} played an Ace and changed suit to ${newSuit}.`;
  }

  if (card.rank === 'RJ') {
    message = `${player.name} played Red Joker as ${newRank} of ${newSuit}!`;
  } else if (card.rank === 'BJ') {
    message = `${player.name} played Black Joker!`;
  }

  // Check for Last Card rule
  if (newHand.length === 1 && !player.hasDeclaredLastCard) {
    // Penalty for not declaring last card
    // In a real app, the player would click a button. 
    // For this logic, we'll assume they might forget if we were simulating, 
    // but here we'll just track if they did.
    // Let's add a penalty check in the next turn or here.
  }

  // Check for Round End
  if (newHand.length === 0) {
    return endRound(gameState, newPlayers, playerIndex);
  }

  // Advance turn
  return advanceTurn({
    ...gameState,
    players: newPlayers,
    discardPile: newDiscardPile,
    currentSuit: newSuit,
    currentRank: newRank,
    drawStackCount: newDrawStackCount,
    direction: newDirection,
    skipNextPlayer: skipNext,
    lastActionMessage: message,
  });
}

export function drawCard(gameState: GameState, playerIndex: number): GameState {
  const player = gameState.players[playerIndex];
  let newDrawPile = [...gameState.drawPile];
  let newDiscardPile = [...gameState.discardPile];
  const newPlayers = [...gameState.players];
  let message = '';

  // Handle draw stack (2s)
  if (gameState.drawStackCount > 0) {
    const cardsToDraw = gameState.drawStackCount;
    const drawnCards: Card[] = [];
    
    for (let i = 0; i < cardsToDraw; i++) {
      if (newDrawPile.length === 0) {
        // Reshuffle discard pile
        const topCard = newDiscardPile.shift()!;
        newDrawPile = shuffle(newDiscardPile);
        newDiscardPile = [topCard];
      }
      const card = newDrawPile.pop();
      if (card) drawnCards.push(card);
    }

    newPlayers[playerIndex] = {
      ...player,
      hand: [...player.hand, ...drawnCards],
      hasDeclaredLastCard: false,
    };

    message = `${player.name} drew ${drawnCards.length} cards from the stack.`;
    
    return advanceTurn({
      ...gameState,
      players: newPlayers,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      drawStackCount: 0,
      lastActionMessage: message,
    });
  }

  // Normal draw
  if (newDrawPile.length === 0) {
    const topCard = newDiscardPile.shift()!;
    newDrawPile = shuffle(newDiscardPile);
    newDiscardPile = [topCard];
  }

  const drawnCard = newDrawPile.pop();
  if (drawnCard) {
    newPlayers[playerIndex] = {
      ...player,
      hand: [...player.hand, drawnCard],
      hasDeclaredLastCard: false,
    };
    message = `${player.name} drew a card.`;
  }

  return advanceTurn({
    ...gameState,
    players: newPlayers,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    lastActionMessage: message,
  });
}

function advanceTurn(gameState: GameState): GameState {
  const { players, currentPlayerIndex, direction, skipNextPlayer } = gameState;
  let nextIndex = (currentPlayerIndex + direction + players.length) % players.length;
  
  // Skip logic
  if (skipNextPlayer) {
    nextIndex = (nextIndex + direction + players.length) % players.length;
  }

  // Ensure we don't land on an eliminated player
  while (players[nextIndex].isEliminated) {
    nextIndex = (nextIndex + direction + players.length) % players.length;
  }

  return {
    ...gameState,
    currentPlayerIndex: nextIndex,
    skipNextPlayer: false,
  };
}

function endRound(gameState: GameState, players: Player[], winnerIndex: number): GameState {
  const updatedPlayers = players.map((p, i) => {
    if (i === winnerIndex) return p;
    const penalty = p.hand.reduce((sum, card) => sum + calculateCardScore(card), 0);
    const newScore = Math.max(0, p.score - penalty);
    return {
      ...p,
      score: newScore,
      isEliminated: newScore <= 0,
    };
  });

  const activePlayers = updatedPlayers.filter(p => !p.isEliminated);
  if (activePlayers.length <= 1) {
    return {
      ...gameState,
      players: updatedPlayers,
      gameStatus: 'game-over',
      winnerId: activePlayers.length === 1 ? activePlayers[0].id : updatedPlayers[winnerIndex].id,
      lastActionMessage: `Game Over! ${activePlayers.length === 1 ? activePlayers[0].name : updatedPlayers[winnerIndex].name} wins the game!`,
    };
  }

  return {
    ...gameState,
    players: updatedPlayers,
    gameStatus: 'round-end',
    lastActionMessage: `${players[winnerIndex].name} won the round!`,
  };
}
