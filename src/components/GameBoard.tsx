import React, { useState, useEffect } from 'react';
import { GameState, GameSettings, Card as CardType, Suit, Rank } from '../types';
import { Card } from './Card';
import { motion, AnimatePresence } from 'motion/react';
import { playCard, drawCard } from '../lib/gameEngine';
import { isValidMove, SUITS, RANKS, createDeck, getInitialGameState, shuffle, calculateCardScore } from '../lib/gameUtils';
import { ArrowRight, RotateCcw, Info, Trophy } from 'lucide-react';

interface GameBoardProps {
  gameState: GameState;
  settings: GameSettings;
  onUpdate: (newState: GameState) => void;
  onRestart: () => void;
}

export function GameBoard({ gameState, settings, onUpdate, onRestart }: GameBoardProps) {
  const [showSuitSelector, setShowSuitSelector] = useState(false);
  const [showRankSelector, setShowRankSelector] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showTurnTransition, setShowTurnTransition] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanTurn = !currentPlayer.isAI;

  // AI Logic
  useEffect(() => {
    if (gameState.gameStatus === 'playing' && currentPlayer.isAI && !isAiThinking && !showTurnTransition && !isDrawing) {
      setIsAiThinking(true);
      
      // Faster thinking for better pacing
      const thinkingTime = 400 + Math.random() * 400;
      
      const timer = setTimeout(() => {
        const playableCards = currentPlayer.hand.filter(c => isValidMove(c, gameState, settings).valid);
        
        let nextState: GameState;
        
        if (playableCards.length > 0) {
          let chosenCard = playableCards[0];

          // Difficulty Logic
          if (settings.difficulty === 'easy') {
            chosenCard = playableCards[Math.floor(Math.random() * playableCards.length)];
          } else if (settings.difficulty === 'normal') {
            const special = playableCards.find(c => ['2', '8', 'J', 'A'].includes(c.rank));
            chosenCard = special || playableCards[Math.floor(Math.random() * playableCards.length)];
          } else if (settings.difficulty === 'hard') {
            const sorted = [...playableCards].sort((a, b) => calculateCardScore(b) - calculateCardScore(a));
            const special = sorted.find(c => ['2', '8', 'J', 'A'].includes(c.rank));
            const opponentHasFewCards = gameState.players.some((p, i) => i !== gameState.currentPlayerIndex && !p.isEliminated && p.hand.length <= 2);
            chosenCard = (opponentHasFewCards && special) ? special : sorted[0];
          }

          // AI declares last card if needed
          let stateToUpdate = gameState;
          if (currentPlayer.hand.length === 2) {
            const newPlayers = [...gameState.players];
            newPlayers[gameState.currentPlayerIndex] = { 
              ...newPlayers[gameState.currentPlayerIndex], 
              hasDeclaredLastCard: true 
            };
            stateToUpdate = { ...gameState, players: newPlayers };
          }

          let chosenSuit: Suit | undefined;
          let chosenRank: Rank | undefined;
          
          if (chosenCard.rank === 'A' || chosenCard.rank === 'RJ') {
            // Pick suit
            if (settings.difficulty === 'hard') {
              const suitCounts: Record<string, number> = {};
              currentPlayer.hand.forEach(c => {
                if (c.suit !== 'joker') {
                  suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
                }
              });
              const bestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Suit;
              chosenSuit = bestSuit || SUITS[Math.floor(Math.random() * SUITS.length)];
            } else {
              chosenSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
            }

            // If Red Joker, also pick a rank
            if (chosenCard.rank === 'RJ') {
              if (settings.difficulty === 'hard') {
                // Hard AI picks a 2 if it has another 2 to stack, or a skip if opponent is low
                const hasAnotherTwo = currentPlayer.hand.some(c => c.rank === '2' && c.id !== chosenCard.id);
                const opponentLow = gameState.players.some((p, i) => i !== gameState.currentPlayerIndex && !p.isEliminated && p.hand.length <= 2);
                
                if (hasAnotherTwo) chosenRank = '2';
                else if (opponentLow) chosenRank = '8';
                else chosenRank = 'A';
              } else {
                chosenRank = RANKS[Math.floor(Math.random() * RANKS.length)];
              }
            }
          }
          nextState = playCard(stateToUpdate, gameState.currentPlayerIndex, chosenCard.id, settings, chosenSuit, chosenRank);
          setIsAiThinking(false);
          onUpdate(nextState);
        } else {
          // AI Draws
          setIsAiThinking(false);
          setIsDrawing(true);
          setTimeout(() => {
            onUpdate(drawCard(gameState, gameState.currentPlayerIndex));
            setIsDrawing(false);
          }, 600);
        }
      }, thinkingTime);
      
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.gameStatus, isAiThinking, showTurnTransition, isDrawing, settings.playMode]);

  // Local Mode: Show transition screen when turn changes
  useEffect(() => {
    if (settings.playMode === 'local' && gameState.gameStatus === 'playing') {
      setShowTurnTransition(true);
    }
  }, [gameState.currentPlayerIndex, settings.playMode]);

  const handleCardClick = (cardId: string) => {
    if (!isHumanTurn || gameState.gameStatus !== 'playing') return;

    const card = currentPlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    // Penalty check for Last Card
    let updatedGameState = gameState;
    if (currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard) {
      // In a real game, you'd have a window to click it. 
      // Here we'll just check if they clicked it before playing.
      // But let's make it more forgiving: if they have 2 cards and play one, 
      // they MUST have clicked the button first.
      // Actually, let's just add the button and if they don't click it, 
      // we'll apply penalty after the play.
    }

    if (card.rank === 'A' || card.rank === 'RJ') {
      setPendingCardId(cardId);
      setShowSuitSelector(true);
    } else {
      let nextState = playCard(gameState, gameState.currentPlayerIndex, cardId, settings);
      
      // Check if they forgot to declare Last Card
      if (currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard && nextState.players[gameState.currentPlayerIndex].hand.length === 1) {
        // Penalty!
        const penaltyState = drawCard(nextState, gameState.currentPlayerIndex);
        const finalState = drawCard(penaltyState, gameState.currentPlayerIndex);
        onUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
      } else {
        onUpdate(nextState);
      }
    }
  };

  const handleDeclareLastCard = () => {
    if (!isHumanTurn || currentPlayer.hand.length !== 2) return;
    const newPlayers = [...gameState.players];
    newPlayers[gameState.currentPlayerIndex] = { ...newPlayers[gameState.currentPlayerIndex], hasDeclaredLastCard: true };
    onUpdate({ ...gameState, players: newPlayers, lastActionMessage: `${currentPlayer.name} declared Last Card!` });
  };

  const handleSuitSelect = (suit: Suit) => {
    if (pendingCardId) {
      const card = currentPlayer.hand.find(c => c.id === pendingCardId);
      if (card?.rank === 'RJ') {
        setSelectedSuit(suit);
        setShowSuitSelector(false);
        setShowRankSelector(true);
      } else {
        let nextState = playCard(gameState, gameState.currentPlayerIndex, pendingCardId, settings, suit);
        
        // Check if they forgot to declare Last Card
        if (currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard && nextState.players[gameState.currentPlayerIndex].hand.length === 1) {
          const penaltyState = drawCard(nextState, gameState.currentPlayerIndex);
          const finalState = drawCard(penaltyState, gameState.currentPlayerIndex);
          onUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
        } else {
          onUpdate(nextState);
        }
        
        setPendingCardId(null);
        setShowSuitSelector(false);
      }
    }
  };

  const handleRankSelect = (rank: Rank) => {
    if (pendingCardId && selectedSuit) {
      let nextState = playCard(gameState, gameState.currentPlayerIndex, pendingCardId, settings, selectedSuit, rank);
      
      // Check if they forgot to declare Last Card
      if (currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard && nextState.players[gameState.currentPlayerIndex].hand.length === 1) {
        const penaltyState = drawCard(nextState, gameState.currentPlayerIndex);
        const finalState = drawCard(penaltyState, gameState.currentPlayerIndex);
        onUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
      } else {
        onUpdate(nextState);
      }
      
      setPendingCardId(null);
      setSelectedSuit(null);
      setShowRankSelector(false);
    }
  };

  const handleDraw = () => {
    if (!isHumanTurn || gameState.gameStatus !== 'playing' || isDrawing) return;
    
    setIsDrawing(true);
    setTimeout(() => {
      onUpdate(drawCard(gameState, gameState.currentPlayerIndex));
      setIsDrawing(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-emerald-900 text-white p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black tracking-tighter">SWITCH</h2>
          <div className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold uppercase tracking-widest">
            {settings.mode} Mode
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase opacity-50 font-bold">Round</div>
            <div className="text-xl font-black leading-none">{gameState.roundNumber}</div>
          </div>
          <button 
            onClick={onRestart}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Scoreboard / Players */}
      <div className="flex justify-center gap-4 mb-8 overflow-x-auto no-scrollbar py-2">
        {gameState.players.map((player, idx) => (
          <div key={player.id} className={`flex flex-col items-center transition-all min-w-[80px] ${idx === gameState.currentPlayerIndex ? 'scale-110' : 'opacity-60'}`}>
            <div className={`relative w-16 h-24 rounded-lg border-2 ${idx === gameState.currentPlayerIndex ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'border-white/20'} bg-slate-800 flex items-center justify-center overflow-hidden`}>
              <div className="text-2xl font-bold">{player.hand.length}</div>
              
              {/* AI Thinking Indicator */}
              {player.isAI && idx === gameState.currentPlayerIndex && isAiThinking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-blue-500/40 flex items-center justify-center"
                >
                  <div className="flex gap-1">
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                </motion.div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-[8px] text-center py-0.5 font-bold uppercase">Cards</div>
            </div>
            <div className="mt-2 text-center">
              <div className="text-[10px] font-bold truncate w-20 flex flex-col items-center">
                <span className="flex items-center gap-1">
                  {player.name}
                  {idx === 0 && settings.playMode === 'computer' && <span className="text-[8px] text-blue-400">(You)</span>}
                </span>
                {player.isAI && (
                  <span className="text-[7px] px-1 bg-blue-500/20 rounded border border-blue-500/30 uppercase">
                    {settings.difficulty}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-emerald-300 font-black">{player.score} pts</div>
            </div>
          </div>
        ))}
      </div>

      {/* Center Area */}
      <div className="flex-1 flex items-center justify-center gap-12 relative">
        {/* Black Joker Target (Ultimate Mode) */}
        {settings.mode === 'ultimate' && gameState.blackJokerTargetCard && (
          <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center bg-purple-900/40 p-4 rounded-2xl border border-purple-500/30 backdrop-blur-sm">
            <div className="text-[10px] uppercase font-black text-purple-300 mb-2 tracking-widest">Joker Target</div>
            <div className="scale-90 shadow-2xl">
              <Card card={gameState.blackJokerTargetCard} isFaceUp={true} />
            </div>
            <div className="mt-2 text-[8px] text-purple-200/60 font-bold text-center max-w-[80px]">
              Play Black Joker only on this card
            </div>
          </div>
        )}

        {/* Draw Pile */}
        <div className="relative group">
          <Card 
            card={{ id: 'draw', suit: 'spades', rank: 'A' }} 
            isFaceUp={false} 
            onClick={handleDraw}
            className={isHumanTurn && gameState.drawStackCount === 0 && !isDrawing ? "hover:shadow-blue-500/50" : ""}
          />
          {isDrawing && (
            <motion.div
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ 
                x: 0, 
                y: 250, 
                opacity: 0,
                scale: 0.5,
                rotate: 20
              }}
              transition={{ duration: 0.4, ease: "easeIn" }}
              className="absolute inset-0 z-[50]"
            >
              <Card card={{ id: 'anim', suit: 'spades', rank: 'A' }} isFaceUp={false} />
            </motion.div>
          )}
          {gameState.drawStackCount > 0 && (
            <div className="absolute -top-4 -right-4 bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black shadow-lg animate-bounce">
              +{gameState.drawStackCount}
            </div>
          )}
          <div className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold uppercase opacity-50">Draw</div>
        </div>

        {/* Discard Pile */}
        <div className="relative">
          <AnimatePresence mode="popLayout">
            <Card 
              key={gameState.discardPile[0].id}
              card={gameState.discardPile[0]} 
              isCurrent
              className="z-10"
            />
          </AnimatePresence>
          <div className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold uppercase opacity-50">Discard</div>
          
          {/* Current Suit Indicator */}
          <div className="absolute -right-16 top-1/2 -translate-y-1/2 flex flex-col items-center">
             <div className="text-[8px] uppercase font-black opacity-50 mb-1">Suit</div>
             <div className={`text-3xl ${gameState.currentSuit === 'hearts' || gameState.currentSuit === 'diamonds' ? 'text-red-500' : 'text-slate-900'}`}>
                {gameState.currentSuit === 'hearts' && '♥'}
                {gameState.currentSuit === 'diamonds' && '♦'}
                {gameState.currentSuit === 'clubs' && '♣'}
                {gameState.currentSuit === 'spades' && '♠'}
             </div>
          </div>
        </div>

        {/* Direction Indicator */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 transition-transform duration-1000 ${gameState.direction === -1 ? 'rotate-180' : ''}`}>
           <RotateCcw className="text-white/20" size={120} />
        </div>
      </div>

      {/* Action Message */}
      <div className="h-12 flex items-center justify-center mb-4">
        <AnimatePresence mode="wait">
          <motion.div 
            key={isAiThinking ? 'thinking' : gameState.lastActionMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-black/30 px-6 py-2 rounded-full text-sm font-medium border border-white/10"
          >
            {isAiThinking ? (
              <span className="flex items-center gap-2 text-blue-300">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                {currentPlayer.name} is thinking...
              </span>
            ) : (
              gameState.lastActionMessage
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Player Hand */}
      <div className="relative pb-8">
        <div className="flex justify-center items-end -space-x-8 px-12 h-48 overflow-x-auto no-scrollbar">
          {currentPlayer.hand.map((card, idx) => (
            <Card 
              key={card.id}
              card={card}
              isPlayable={isHumanTurn && !showTurnTransition && isValidMove(card, gameState, settings).valid}
              onClick={() => handleCardClick(card.id)}
              className="transition-transform hover:z-50"
            />
          ))}
        </div>
        
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <div className="px-4 py-1 bg-emerald-800 rounded-full border border-white/20 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest">{currentPlayer.name} Score:</span>
            <span className="text-lg font-black text-yellow-400">{currentPlayer.score}</span>
          </div>
          {currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard && isHumanTurn && (
            <button 
              onClick={handleDeclareLastCard}
              className="px-4 py-1 bg-orange-500 hover:bg-orange-400 rounded-full font-black text-xs uppercase shadow-lg transition-all"
            >
              Declare Last Card
            </button>
          )}
          {currentPlayer.hasDeclaredLastCard && currentPlayer.hand.length <= 2 && (
            <div className="px-4 py-1 bg-blue-600 rounded-full font-black text-xs uppercase">
              Last Card Declared
            </div>
          )}
        </div>
      </div>

      {/* Turn Transition Modal */}
      <AnimatePresence>
        {showTurnTransition && settings.playMode === 'local' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900 z-[400] flex items-center justify-center p-4"
          >
            <div className="text-center">
              <div className="text-sm uppercase tracking-widest text-slate-400 mb-2">Pass the device to</div>
              <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">{currentPlayer.name}</h2>
              
              <div className="bg-black/20 p-4 rounded-2xl mb-8 max-w-xs mx-auto border border-white/5">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Last Action</div>
                <div className="text-sm italic text-slate-300">"{gameState.lastActionMessage}"</div>
              </div>

              <button
                onClick={() => setShowTurnTransition(false)}
                className="bg-white text-slate-900 px-12 py-4 rounded-full font-black text-xl shadow-2xl hover:bg-blue-50 transition-all active:scale-95"
              >
                I AM READY
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suit Selector Modal */}
      <AnimatePresence>
        {showSuitSelector && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 max-w-xs w-full text-center">
              <h3 className="text-xl font-black mb-6 uppercase tracking-tighter">Choose Next Suit</h3>
              <div className="grid grid-cols-2 gap-4">
                {SUITS.map(suit => (
                  <button
                    key={suit}
                    onClick={() => handleSuitSelect(suit)}
                    className="p-6 bg-slate-700 rounded-2xl hover:bg-slate-600 transition-colors flex flex-col items-center gap-2"
                  >
                    <span className={`text-4xl ${suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-white'}`}>
                      {suit === 'hearts' && '♥'}
                      {suit === 'diamonds' && '♦'}
                      {suit === 'clubs' && '♣'}
                      {suit === 'spades' && '♠'}
                    </span>
                    <span className="text-[10px] font-bold uppercase opacity-50">{suit}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rank Selector Modal (Red Joker) */}
      <AnimatePresence>
        {showRankSelector && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 max-w-md w-full text-center">
              <h3 className="text-xl font-black mb-6 uppercase tracking-tighter">Transform Red Joker Into...</h3>
              <div className="grid grid-cols-4 gap-2">
                {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(rank => (
                  <button
                    key={rank}
                    onClick={() => handleRankSelect(rank as Rank)}
                    className="p-4 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors font-black text-lg"
                  >
                    {rank}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round End Modal */}
      <AnimatePresence>
        {gameState.gameStatus === 'round-end' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          >
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 max-w-md w-full text-center">
              <Trophy className="mx-auto text-yellow-400 mb-4" size={48} />
              <h3 className="text-3xl font-black mb-2 uppercase tracking-tighter">Round Finished!</h3>
              <p className="text-slate-400 mb-8">Scores have been updated based on remaining cards.</p>
              
              <div className="space-y-4 mb-8">
                {gameState.players.map(player => (
                  <div key={player.id} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${player.isEliminated ? 'bg-red-500' : 'bg-emerald-500'}`} />
                      <span className="font-bold">{player.name}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xl font-black">{player.score}</span>
                      {player.isEliminated && <span className="text-[10px] text-red-400 font-bold uppercase">Eliminated</span>}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  // Start next round
                  const newSettings = { ...settings };
                  const playerNames = gameState.players.map(p => p.name);
                  const nextRoundState = {
                    ...getInitialGameState(newSettings, playerNames),
                    players: gameState.players.map(p => {
                      // Reset hands but keep scores
                      return { ...p, hand: [], hasDeclaredLastCard: false };
                    }),
                    roundNumber: gameState.roundNumber + 1
                  };
                  
                  // Re-deal
                  const includeJokers = settings.mode === 'ultimate';
                  let deck = shuffle(createDeck(settings.numDecks, includeJokers));
                  const updatedPlayers = nextRoundState.players.map(p => {
                    if (p.isEliminated) return p;
                    const hand = [];
                    for (let i = 0; i < settings.cardsPerPlayer; i++) {
                      const card = deck.pop();
                      if (card) hand.push(card);
                    }
                    return { ...p, hand };
                  });

                  let firstDiscard = deck.pop()!;
                  while (['2', '8', 'J', 'A'].includes(firstDiscard.rank) || firstDiscard.isJoker) {
                    deck.unshift(firstDiscard);
                    deck = shuffle(deck);
                    firstDiscard = deck.pop()!;
                  }

                  onUpdate({
                    ...nextRoundState,
                    players: updatedPlayers,
                    drawPile: deck,
                    discardPile: [firstDiscard],
                    currentSuit: firstDiscard.suit,
                    currentRank: firstDiscard.rank,
                  });
                }}
                className="w-full bg-white text-slate-900 py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2"
              >
                NEXT ROUND
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Modal */}
      <AnimatePresence>
        {gameState.gameStatus === 'game-over' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[300] flex items-center justify-center p-4"
          >
            <div className="text-center">
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Trophy className="mx-auto text-yellow-400 mb-6" size={80} />
              </motion.div>
              <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">WINNER!</h1>
              <p className="text-2xl text-emerald-400 font-bold mb-12">
                {gameState.players.find(p => p.id === gameState.winnerId)?.name} is the champion!
              </p>
              
              <button
                onClick={onRestart}
                className="bg-white text-slate-900 px-12 py-4 rounded-full font-black text-2xl shadow-2xl hover:bg-emerald-50 transition-colors"
              >
                PLAY AGAIN
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
