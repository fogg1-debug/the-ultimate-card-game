import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameSettings, Card as CardType, Suit, Rank } from '../types';
import { Card } from './Card';
import { motion, AnimatePresence } from 'motion/react';
import { playCard, drawCard } from '../lib/gameEngine';
import { isValidMove, SUITS, RANKS, createDeck, getInitialGameState, shuffle, calculateCardScore } from '../lib/gameUtils';
import { ArrowRight, RotateCcw, Info, Trophy } from 'lucide-react';

import { auth, db } from '../lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';

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
  const [drawTarget, setDrawTarget] = useState<{ x: number, y: number } | null>(null);
  const [aiPlayAnimation, setPlayAnimation] = useState<{ card: CardType, start: { x: number, y: number } } | null>(null);
  const playerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drawPileRef = useRef<HTMLDivElement>(null);
  const discardPileRef = useRef<HTMLDivElement>(null);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanTurn = settings.playMode === 'online' 
    ? (auth.currentUser?.uid === currentPlayer.id)
    : !currentPlayer.isAI;

  // In computer mode, always show the human player (index 0) at the bottom
  // In online mode, show the authenticated user at the bottom
  const displayPlayer = settings.playMode === 'computer' 
    ? gameState.players[0] 
    : (settings.playMode === 'online' 
        ? gameState.players.find(p => p.id === auth.currentUser?.uid) || currentPlayer
        : currentPlayer);

  const aiProcessingRef = React.useRef<string | null>(null);

  const getPlayStartPos = (index: number) => {
    const isDisplayPlayer = (settings.playMode === 'computer' && index === 0) || 
                           (settings.playMode === 'local') ||
                           (settings.playMode === 'online' && gameState.players[index].id === auth.currentUser?.uid);
    if (isDisplayPlayer) return { x: 0, y: 400 };
    
    const playerEl = playerRefs.current[index];
    const discardEl = discardPileRef.current;
    if (playerEl && discardEl) {
      const pRect = playerEl.getBoundingClientRect();
      const dRect = discardEl.getBoundingClientRect();
      return { x: pRect.left - dRect.left, y: pRect.top - dRect.top };
    }
    return { x: 0, y: -300 };
  };

  const getDrawTargetPos = (index: number) => {
    const isDisplayPlayer = (settings.playMode === 'computer' && index === 0) || 
                           (settings.playMode === 'local') ||
                           (settings.playMode === 'online' && gameState.players[index].id === auth.currentUser?.uid);
    if (isDisplayPlayer) return { x: 0, y: 400 };
    
    const playerEl = playerRefs.current[index];
    const drawEl = drawPileRef.current;
    if (playerEl && drawEl) {
      const pRect = playerEl.getBoundingClientRect();
      const dRect = drawEl.getBoundingClientRect();
      return { x: pRect.left - dRect.left, y: pRect.top - dRect.top };
    }
    return { x: 0, y: -300 };
  };

  const handleUpdate = (newState: GameState) => {
    if (settings.playMode === 'online' && settings.lobbyId) {
      updateDoc(doc(db, 'lobbies', settings.lobbyId), {
        gameState: newState
      });
    } else {
      onUpdate(newState);
    }
  };

  // Online Sync Logic
  useEffect(() => {
    if (settings.playMode === 'online' && settings.lobbyId) {
      const unsubscribe = onSnapshot(doc(db, 'lobbies', settings.lobbyId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.gameState) {
            // Only update if the incoming state is different to avoid loops
            // A simple way is to check if it's NOT our turn, or if the turn key changed
            onUpdate(data.gameState);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [settings.lobbyId, settings.playMode]);

  // AI Logic
  useEffect(() => {
    // Create a unique key for the current turn state
    // This includes player index, round, and the number of cards in piles to detect any change
    const turnKey = `${gameState.currentPlayerIndex}-${gameState.roundNumber}-${gameState.discardPile.length}-${gameState.drawPile.length}`;
    
    // Only run if it's an AI's turn and the game is active
    if (
      gameState.gameStatus !== 'playing' || 
      !currentPlayer.isAI || 
      showTurnTransition || 
      isDrawing ||
      aiProcessingRef.current === turnKey
    ) {
      return;
    }

    aiProcessingRef.current = turnKey;
    setIsAiThinking(true);
    
    // Natural thinking time (800ms to 1500ms)
    const thinkingTime = 800 + Math.random() * 700;
    
    const timer = setTimeout(() => {
      const playableCards = currentPlayer.hand.filter(c => isValidMove(c, gameState, settings).valid);
      
      if (playableCards.length > 0) {
        let chosenCard = playableCards[0];
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

        let stateToUpdate = gameState;
        if (currentPlayer.hand.length === 2) {
          const newPlayers = [...gameState.players];
          newPlayers[gameState.currentPlayerIndex] = { ...newPlayers[gameState.currentPlayerIndex], hasDeclaredLastCard: true };
          stateToUpdate = { ...gameState, players: newPlayers };
        }

        let chosenSuit: Suit | undefined;
        let chosenRank: Rank | undefined;
        if (chosenCard.rank === 'A' || chosenCard.rank === 'RJ') {
          const suitCounts: Record<string, number> = {};
          currentPlayer.hand.forEach(c => {
            if (c.suit !== 'joker' && c.id !== chosenCard.id) {
              suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
            }
          });
          const suits = Object.entries(suitCounts).sort((a, b) => b[1] - a[1]);
          chosenSuit = suits.length > 0 ? suits[0][0] as Suit : SUITS[Math.floor(Math.random() * SUITS.length)];
          if (chosenCard.rank === 'RJ') {
            if (settings.difficulty === 'hard') {
              const hasAnotherTwo = currentPlayer.hand.some(c => c.rank === '2' && c.id !== chosenCard.id);
              const opponentLow = gameState.players.some((p, i) => i !== gameState.currentPlayerIndex && !p.isEliminated && p.hand.length <= 2);
              if (hasAnotherTwo) chosenRank = '2';
              else if (opponentLow) chosenRank = '8';
              else chosenRank = 'A';
            } else {
              const otherRanks = currentPlayer.hand.filter(c => c.id !== chosenCard.id && c.rank !== 'RJ').map(c => c.rank);
              chosenRank = otherRanks.length > 0 ? otherRanks[0] : 'A';
            }
          }
        }
        
        // Calculate animation start from player icon
        setPlayAnimation({ 
          card: chosenCard, 
          start: getPlayStartPos(gameState.currentPlayerIndex)
        });

        setTimeout(() => {
          const nextState = playCard(stateToUpdate, gameState.currentPlayerIndex, chosenCard.id, settings, chosenSuit, chosenRank);
          setIsAiThinking(false);
          setPlayAnimation(null);
          handleUpdate(nextState);
        }, 600);
      } else {
        setIsAiThinking(false);
        setIsDrawing(true);
        setDrawTarget(getDrawTargetPos(gameState.currentPlayerIndex));

        setTimeout(() => {
          handleUpdate(drawCard(gameState, gameState.currentPlayerIndex));
          setIsDrawing(false);
          setDrawTarget(null);
        }, 600);
      }
    }, thinkingTime);
    
    return () => clearTimeout(timer);
  }, [gameState.currentPlayerIndex, gameState.roundNumber, gameState.discardPile.length, gameState.drawPile.length, gameState.gameStatus, showTurnTransition, isDrawing, settings.playMode, settings.difficulty, currentPlayer.isAI]);

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

    if (card.rank === 'A' || card.rank === 'RJ') {
      setPendingCardId(cardId);
      setShowSuitSelector(true);
    } else {
      setPlayAnimation({
        card,
        start: getPlayStartPos(gameState.currentPlayerIndex)
      });

      setTimeout(() => {
        let nextState = playCard(gameState, gameState.currentPlayerIndex, cardId, settings);
        setPlayAnimation(null);
        
        // Check if they forgot to declare Last Card
        if (currentPlayer.hand.length === 2 && !currentPlayer.hasDeclaredLastCard && nextState.players[gameState.currentPlayerIndex].hand.length === 1) {
          const penaltyState = drawCard(nextState, gameState.currentPlayerIndex);
          const finalState = drawCard(penaltyState, gameState.currentPlayerIndex);
          handleUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
        } else {
          handleUpdate(nextState);
        }
      }, 400);
    }
  };

  const handleDeclareLastCard = () => {
    if (!isHumanTurn || currentPlayer.hand.length !== 2) return;
    const newPlayers = [...gameState.players];
    newPlayers[gameState.currentPlayerIndex] = { ...newPlayers[gameState.currentPlayerIndex], hasDeclaredLastCard: true };
    handleUpdate({ ...gameState, players: newPlayers, lastActionMessage: `${currentPlayer.name} declared Last Card!` });
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
          handleUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
        } else {
          handleUpdate(nextState);
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
        handleUpdate({ ...finalState, lastActionMessage: `Penalty! ${currentPlayer.name} forgot to declare Last Card! (+2 cards)` });
      } else {
        handleUpdate(nextState);
      }
      
      setPendingCardId(null);
      setSelectedSuit(null);
      setShowRankSelector(false);
    }
  };

  const handleDraw = () => {
    if (!isHumanTurn || gameState.gameStatus !== 'playing' || isDrawing) return;
    
    setIsDrawing(true);
    setDrawTarget(getDrawTargetPos(gameState.currentPlayerIndex));
    
    setTimeout(() => {
      handleUpdate(drawCard(gameState, gameState.currentPlayerIndex));
      setIsDrawing(false);
      setDrawTarget(null);
    }, 600);
  };

  return (
    <div className="fixed inset-0 bg-emerald-900 text-white flex flex-col overflow-hidden select-none">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

      <div className="flex-1 flex flex-col p-4 max-w-5xl mx-auto w-full relative z-10 pb-48">
        {/* Header */}
        <div className="flex justify-between items-center mb-2 h-12">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black tracking-tighter">SWITCH</h2>
            <div className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">
              {settings.mode}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[8px] uppercase opacity-50 font-bold">Round</div>
              <div className="text-lg font-black leading-none">{gameState.roundNumber}</div>
            </div>
            <button 
              onClick={onRestart}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        {/* Scoreboard / Players */}
        <div className="flex justify-center gap-2 sm:gap-4 mb-4 overflow-x-auto no-scrollbar py-2 shrink-0">
          {gameState.players.map((player, idx) => {
            const isCurrentPlayer = idx === gameState.currentPlayerIndex;
            const isLastCard = player.hand.length === 1;
            const showPulse = isLastCard && !isCurrentPlayer;
            const isUser = idx === 0 && settings.playMode === 'computer';
            // Only show card count in classic mode OR if it's the user's own hand
            const showCount = settings.mode === 'classic' || isUser;

            return (
              <div 
                key={player.id} 
                ref={el => playerRefs.current[idx] = el}
                className={`flex flex-col items-center transition-all min-w-[70px] sm:min-w-[80px] ${isCurrentPlayer ? 'scale-105 sm:scale-110' : 'opacity-60'}`}
              >
                <div className={`relative w-14 h-20 sm:w-16 sm:h-24 rounded-lg border-2 bg-slate-800 flex items-center justify-center overflow-hidden transition-all ${
                  isCurrentPlayer ? "border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]" : "border-white/20"
                } ${showPulse ? "animate-purple-pulse border-purple-500" : ""}`}>
                  <div className="text-xl sm:text-2xl font-bold">
                    {showCount ? player.hand.length : '?'}
                  </div>
                
                {/* AI Thinking Indicator */}
                {player.isAI && idx === gameState.currentPlayerIndex && isAiThinking && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-blue-500/40 flex items-center justify-center"
                  >
                    <div className="flex gap-1">
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1 h-1 bg-white rounded-full" />
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1 h-1 bg-white rounded-full" />
                      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1 h-1 bg-white rounded-full" />
                    </div>
                  </motion.div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-[7px] text-center py-0.5 font-bold uppercase">Cards</div>
              </div>
              <div className="mt-1 text-center">
                <div className="text-[9px] font-bold truncate w-16 sm:w-20 flex flex-col items-center">
                  <span className="flex items-center gap-1">
                    {player.name}
                    {isUser && <span className="text-[7px] text-blue-400">(You)</span>}
                  </span>
                  {player.isAI && (
                    <span className="text-[6px] px-1 bg-blue-500/20 rounded border border-blue-500/30 uppercase">
                      {settings.difficulty}
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-emerald-300 font-black">{player.score} pts</div>
              </div>
            </div>
          );
        })}
        </div>

        {/* Center Area */}
        <div className="flex-1 flex items-center justify-center gap-6 sm:gap-12 relative min-h-[200px]">
          {/* Black Joker Target (Ultimate Mode) */}
          {settings.mode === 'ultimate' && gameState.blackJokerTargetCard && (
            <div className="absolute left-0 sm:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center bg-purple-900/40 p-2 sm:p-4 rounded-2xl border border-purple-500/30 backdrop-blur-sm scale-75 sm:scale-100">
              <div className="text-[8px] sm:text-[10px] uppercase font-black text-purple-300 mb-2 tracking-widest">Target</div>
              <div className="scale-75 sm:scale-90 shadow-2xl">
                <Card card={gameState.blackJokerTargetCard} isFaceUp={true} noHover />
              </div>
            </div>
          )}

          {/* Draw Pile */}
          <div ref={drawPileRef} className="relative group scale-90 sm:scale-100">
            {/* Stack effect */}
            {Array.from({ length: Math.min(5, Math.ceil(gameState.drawPile.length / 10)) }).map((_, i) => (
              <div 
                key={`draw-stack-${i}`}
                className="absolute inset-0 bg-blue-950 rounded-xl border border-white/10 shadow-sm"
                style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)`, zIndex: -i }}
              />
            ))}
            
            <Card 
              card={{ id: 'draw', suit: 'spades', rank: 'A' }} 
              isFaceUp={false} 
              onClick={handleDraw}
              className={isHumanTurn && gameState.drawStackCount === 0 && !isDrawing ? "hover:shadow-blue-500/50" : ""}
            />
            {isDrawing && drawTarget && (
              <motion.div
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ 
                  x: drawTarget.x, 
                  y: drawTarget.y, 
                  opacity: 0,
                  scale: 0.5,
                  rotate: 20
                }}
                transition={{ duration: 0.5, ease: "circOut" }}
                className="absolute inset-0 z-[50] pointer-events-none"
              >
                <Card card={{ id: 'anim', suit: 'spades', rank: 'A' }} isFaceUp={false} />
              </motion.div>
            )}
            {gameState.drawStackCount > 0 && (
              <div className="absolute -top-4 -right-4 bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black shadow-lg animate-bounce z-20">
                +{gameState.drawStackCount}
              </div>
            )}
            <div className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold uppercase opacity-50">Draw ({gameState.drawPile.length})</div>
          </div>

          {/* Discard Pile */}
          <div ref={discardPileRef} className="relative scale-90 sm:scale-100">
            {/* Stack effect */}
            {Array.from({ length: Math.min(5, Math.ceil(gameState.discardPile.length / 10)) }).map((_, i) => (
              <div 
                key={`discard-stack-${i}`}
                className="absolute inset-0 bg-slate-200 rounded-xl border border-slate-300 shadow-sm"
                style={{ transform: `translate(${i * 1.5}px, ${i * 1.5}px)`, zIndex: -i }}
              />
            ))}

            <AnimatePresence mode="popLayout">
              <Card 
                key={gameState.discardPile[0].id}
                card={gameState.discardPile[0]} 
                isCurrent
                noHover
                className="z-10"
              />
            </AnimatePresence>

            {/* Play Animation */}
            <AnimatePresence>
              {aiPlayAnimation && (
                <motion.div
                  initial={{ 
                    x: aiPlayAnimation.start.x, 
                    y: aiPlayAnimation.start.y, 
                    opacity: 1, 
                    scale: 1,
                    rotate: Math.random() * 20 - 10
                  }}
                  animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "circOut" }}
                  className="absolute inset-0 z-[60] pointer-events-none"
                >
                  <Card card={aiPlayAnimation.card} isFaceUp={true} noHover />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold uppercase opacity-50">Discard ({gameState.discardPile.length})</div>
            
            {/* Current Suit Indicator */}
            <div className="absolute -right-12 sm:-right-16 top-1/2 -translate-y-1/2 flex flex-col items-center">
               <div className="text-[8px] uppercase font-black opacity-50 mb-1">Suit</div>
               <div className={`text-2xl sm:text-3xl ${gameState.currentSuit === 'hearts' || gameState.currentSuit === 'diamonds' ? 'text-red-500' : 'text-slate-900'}`}>
                  {gameState.currentSuit === 'hearts' && '♥'}
                  {gameState.currentSuit === 'diamonds' && '♦'}
                  {gameState.currentSuit === 'clubs' && '♣'}
                  {gameState.currentSuit === 'spades' && '♠'}
               </div>
            </div>
          </div>
        </div>

        {/* Action Message */}
        <div className="h-10 flex items-center justify-center mb-2 shrink-0">
          <AnimatePresence mode="wait">
            <motion.div 
              key={isAiThinking ? 'thinking' : gameState.lastActionMessage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-black/30 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium border border-white/10"
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

        {/* Player Hand - Fixed to bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-md border-t border-white/10 pt-4 pb-8 z-50">
          <div className="max-w-5xl mx-auto relative">
            <div className="flex justify-center items-end -space-x-8 sm:-space-x-10 px-4 h-32 sm:h-40 overflow-x-auto no-scrollbar">
              {displayPlayer.hand.map((card, idx) => (
                <Card 
                  key={card.id}
                  card={card}
                  isPlayable={isHumanTurn && !showTurnTransition && isValidMove(card, gameState, settings).valid}
                  onClick={() => handleCardClick(card.id)}
                  className="transition-transform hover:z-50 scale-90 sm:scale-100 origin-bottom"
                />
              ))}
            </div>
            
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-4 w-full justify-center px-4">
              <div className="px-3 py-0.5 sm:px-4 sm:py-1 bg-emerald-800 rounded-full border border-white/20 flex items-center gap-2 whitespace-nowrap shadow-lg">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">{displayPlayer.name} Score:</span>
                <span className="text-sm sm:text-lg font-black text-yellow-400">{displayPlayer.score}</span>
              </div>
              {displayPlayer.hand.length === 2 && !displayPlayer.hasDeclaredLastCard && isHumanTurn && (
                <button 
                  onClick={handleDeclareLastCard}
                  className="px-3 py-1 sm:px-4 sm:py-1 bg-orange-500 hover:bg-orange-400 rounded-full font-black text-[10px] sm:text-xs uppercase shadow-lg transition-all whitespace-nowrap"
                >
                  Last Card!
                </button>
              )}
              {displayPlayer.hasDeclaredLastCard && displayPlayer.hand.length <= 2 && (
                <div className="px-3 py-1 sm:px-4 sm:py-1 bg-blue-600 rounded-full font-black text-[10px] sm:text-xs uppercase whitespace-nowrap shadow-lg">
                  Declared
                </div>
              )}
            </div>
          </div>
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

                  handleUpdate({
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
