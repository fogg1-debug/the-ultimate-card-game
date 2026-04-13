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

const SUITS_ICONS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  joker: '🃏'
};

export function GameBoard({ gameState, settings, onUpdate, onRestart }: GameBoardProps) {
  const [showSuitSelector, setShowSuitSelector] = useState(false);
  const [showRankSelector, setShowRankSelector] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showTurnTransition, setShowTurnTransition] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawTarget, setDrawTarget] = useState<{ x: number, y: number } | null>(null);
  const [aiPlayAnimation, setPlayAnimation] = useState<{ card: CardType, start: { x: number, y: number } } | null>(null);
  const playerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const handRef = useRef<HTMLDivElement>(null);
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
    
    if (isDisplayPlayer && handRef.current && discardPileRef.current) {
      const hRect = handRef.current.getBoundingClientRect();
      const dRect = discardPileRef.current.getBoundingClientRect();
      return { x: hRect.left + hRect.width/2 - dRect.left, y: hRect.top - dRect.top };
    }
    
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
    
    if (isDisplayPlayer && handRef.current && drawPileRef.current) {
      const hRect = handRef.current.getBoundingClientRect();
      const dRect = drawPileRef.current.getBoundingClientRect();
      return { x: hRect.left + hRect.width/2 - dRect.left, y: hRect.top - dRect.top };
    }
    
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
    // Update locally first for responsiveness
    onUpdate(newState);
    
    if (settings.playMode === 'online' && settings.lobbyId) {
      updateDoc(doc(db, 'lobbies', settings.lobbyId), {
        gameState: newState
      });
    }
  };

  // Online Sync Logic
  useEffect(() => {
    if (settings.playMode === 'online' && settings.lobbyId) {
      const unsubscribe = onSnapshot(doc(db, 'lobbies', settings.lobbyId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.gameState) {
            onUpdate(data.gameState);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [settings.lobbyId, settings.playMode, onUpdate]);

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
            if (gameState.drawStackCount > 0) {
              chosenRank = '2';
            } else if (settings.difficulty === 'hard') {
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

  const getCardColor = () => {
    if (settings.playMode === 'online') return 'bg-red-600';
    return settings.mode === 'classic' ? 'bg-blue-600' : 'bg-purple-600';
  };

  const getGlowColor = () => {
    if (settings.playMode === 'online') return 'card-glow-red';
    return settings.mode === 'classic' ? 'card-glow-blue' : 'card-glow-purple';
  };

  const getAccentColor = () => {
    if (settings.playMode === 'online') return 'text-red-400';
    return settings.mode === 'classic' ? 'text-blue-400' : 'text-purple-400';
  };

  const getAccentBg = () => {
    if (settings.playMode === 'online') return 'bg-red-500/20';
    return settings.mode === 'classic' ? 'bg-blue-500/20' : 'bg-purple-500/20';
  };

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex flex-col overflow-hidden select-none">
      {/* Background Decorative Cards */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatePresence>
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={`bg-card-${i}`}
              initial={{ opacity: 0 }}
              animate={{ 
                x: (i - 2) * 300, 
                y: (i % 2 === 0 ? -300 : 300), 
                rotate: (i - 2) * 15,
                opacity: 0.05
              }}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-96 ${getCardColor()} rounded-3xl border border-white/10 card-pattern`}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Main Card Container */}
      <div className={`absolute inset-2 sm:inset-6 ${getCardColor()} rounded-[1.5rem] sm:rounded-[2.5rem] p-1 shadow-2xl ${getGlowColor()} card-pattern flex flex-col`}>
        <div className="absolute inset-3 border-2 border-white/10 rounded-[1.2rem] sm:rounded-[2.2rem] pointer-events-none" />
        
        <div className="flex-1 bg-slate-900/90 backdrop-blur-xl rounded-[1.4rem] sm:rounded-[2.4rem] flex flex-col relative">
          <div className="flex-1 flex flex-col p-2 sm:p-4 max-w-6xl mx-auto w-full relative z-10">
            {/* Header (Minimal) */}
            <div className="flex justify-between items-center h-6 mb-1 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tighter italic opacity-30">SWITCH</h2>
                <div className={`px-1.5 py-0.5 ${getAccentBg()} ${getAccentColor()} rounded-full text-[6px] font-black uppercase tracking-widest border border-white/5`}>
                  {settings.mode}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-[6px] uppercase opacity-20 font-black tracking-widest">Round</div>
                  <div className="text-xs font-black leading-none italic opacity-30">{gameState.roundNumber}</div>
                </div>
                <button 
                  onClick={onRestart}
                  className="p-1 hover:bg-white/10 rounded-lg transition-all border border-white/5 opacity-30"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>

            {/* Top Section: Scoreboard / Players (Smaller) */}
            <div className="h-[10%] md:h-[12%] flex justify-center gap-2 sm:gap-4 mb-2 overflow-x-auto no-scrollbar py-1 shrink-0">
              {gameState.players.map((player, idx) => {
                const isCurrentPlayer = idx === gameState.currentPlayerIndex;
                const isLastCard = player.hand.length === 1;
                const showPulse = isLastCard && !isCurrentPlayer;
                const isUser = (settings.playMode === 'computer' && idx === 0) || (settings.playMode === 'online' && player.id === auth.currentUser?.uid);
                const showCount = settings.mode === 'classic' || isUser;

                return (
                  <div 
                    key={player.id} 
                    ref={el => playerRefs.current[idx] = el}
                    className={`flex flex-col items-center transition-all min-w-[50px] sm:min-w-[70px] ${isCurrentPlayer ? 'scale-105' : 'opacity-20'}`}
                  >
                    <div className={`relative w-10 h-14 sm:w-12 sm:h-16 rounded-lg border bg-slate-800/50 backdrop-blur-md flex items-center justify-center overflow-hidden transition-all ${
                      isCurrentPlayer ? `border-white shadow-lg` : "border-white/10"
                    } ${showPulse ? "animate-purple-pulse border-purple-500" : ""}`}>
                      <div className="text-lg sm:text-xl font-black italic">
                        {showCount ? player.hand.length : '?'}
                      </div>
                    
                    {/* AI Thinking Indicator */}
                    {player.isAI && idx === gameState.currentPlayerIndex && isAiThinking && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`absolute inset-0 ${getAccentBg()} flex flex-col items-center justify-center gap-1`}
                      >
                        <div className="flex gap-1">
                          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                        <div className="text-[6px] font-black uppercase tracking-tighter text-white/40">Thinking</div>
                      </motion.div>
                    )}
                  </div>
                  <div className="mt-0.5 text-center">
                    <div className="text-[7px] font-black truncate w-12 sm:w-16 flex flex-col items-center uppercase tracking-tighter opacity-60">
                      <span className="flex items-center gap-0.5 italic">
                        {player.name}
                        {isUser && <span className={getAccentColor()}>(You)</span>}
                      </span>
                    </div>
                    <div className={`text-[8px] ${getAccentColor()} font-black italic opacity-60`}>{player.score} PTS</div>
                  </div>
                </div>
              );
            })}
            </div>

          {/* Middle Section: Gameplay Area (Draw/Discard) */}
          <div className="flex-1 flex items-center justify-center gap-6 sm:gap-20 relative min-h-0">
            {/* Black Joker Target (Minimalist) */}
            {settings.mode === 'ultimate' && gameState.blackJokerTargetCard && (
              <div className="absolute left-2 sm:left-10 top-1/2 -translate-y-1/2 flex flex-col items-center bg-slate-800/20 p-1.5 rounded-xl border border-white/5 backdrop-blur-sm scale-75 shadow-lg">
                <div className="text-[6px] uppercase font-black text-white/20 mb-1 tracking-widest">Target</div>
                <div className="scale-[0.4] origin-center">
                  <Card card={gameState.blackJokerTargetCard} isFaceUp={true} noHover />
                </div>
              </div>
            )}

            {/* Draw Pile */}
            <div ref={drawPileRef} className="relative group scale-[0.6] sm:scale-[0.8] md:scale-100 lg:scale-110">
              {/* Stack effect */}
              {Array.from({ length: Math.min(3, Math.ceil(gameState.drawPile.length / 15)) }).map((_, i) => (
                <div 
                  key={`draw-stack-${i}`}
                  className={`absolute inset-0 ${getCardColor()} rounded-xl border border-white/10 shadow-sm card-pattern`}
                  style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)`, zIndex: -i }}
                />
              ))}
              
              <Card 
                card={{ id: 'draw', suit: 'spades', rank: 'A' }} 
                isFaceUp={false} 
                onClick={handleDraw}
                className={isHumanTurn && gameState.drawStackCount === 0 && !isDrawing ? `hover:shadow-2xl transition-all` : ""}
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
                <div className="absolute -top-3 -right-3 bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-xl animate-bounce z-20 border-2 border-white">
                  +{gameState.drawStackCount}
                </div>
              )}
              <div className="absolute -bottom-6 left-0 right-0 text-center text-[8px] font-black uppercase tracking-widest opacity-30 italic">Draw ({gameState.drawPile.length})</div>
            </div>

            {/* Discard Pile */}
            <div ref={discardPileRef} className="relative scale-[0.6] sm:scale-[0.8] md:scale-100 lg:scale-110">
              {/* Stack effect */}
              {gameState.discardPile.length > 1 && (
                <div className="absolute inset-0 bg-slate-800 rounded-xl border border-white/10 shadow-sm translate-x-1 translate-y-1 -z-10" />
              )}
              
              <Card card={gameState.discardPile[0]} isFaceUp={true} noHover />
              
              {/* AI Play Animation */}
              {aiPlayAnimation && (
                <motion.div
                  initial={{ x: aiPlayAnimation.start.x, y: aiPlayAnimation.start.y, opacity: 1, rotate: -20 }}
                  animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.5, ease: "backOut" }}
                  className="absolute inset-0 z-[100] pointer-events-none"
                >
                  <Card card={aiPlayAnimation.card} isFaceUp={true} noHover />
                </motion.div>
              )}

              <div className="absolute -bottom-6 left-0 right-0 text-center text-[8px] font-black uppercase tracking-widest opacity-30 italic">Discard ({gameState.discardPile.length})</div>
              
              {/* Suit/Rank Indicator (Minimalist) */}
              <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-slate-800/60 backdrop-blur-md p-2 rounded-xl border border-white/5 shadow-xl">
                <div className={`text-lg font-black ${getAccentColor()} italic leading-none`}>{gameState.currentRank}</div>
                <div className="w-4 h-px bg-white/10" />
                <div className="text-xl leading-none">{SUITS_ICONS[gameState.currentSuit]}</div>
              </div>
            </div>
          </div>

          {/* Action Message */}
          <div className="h-8 flex justify-center items-center pointer-events-none shrink-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={gameState.lastActionMessage}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="bg-slate-800/50 backdrop-blur-sm px-4 py-1 rounded-full border border-white/5 shadow-lg text-[10px] font-black italic tracking-wider text-white/60"
              >
                {gameState.lastActionMessage}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Section: Player Hand */}
          <div className="h-[20%] md:h-[25%] p-1 sm:p-2 z-20 shrink-0">
            <div className="max-w-5xl mx-auto relative h-full flex flex-col justify-end">
              {/* Turn Indicator */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                <div className={`px-3 py-0.5 rounded-full font-black italic text-[8px] tracking-[0.2em] uppercase border transition-all ${
                  isHumanTurn 
                  ? `bg-white text-slate-900 border-white shadow-md scale-105` 
                  : "bg-slate-900/50 text-white/30 border-white/5 backdrop-blur-sm"
                }`}>
                  {isHumanTurn ? "Your Turn" : `${currentPlayer.name}'s Turn`}
                </div>
              </div>

              <div ref={handRef} className="flex justify-center items-end gap-1 sm:gap-2 overflow-x-visible pb-1 px-6 min-h-[80px] sm:min-h-[100px] md:min-h-[140px]">
                {displayPlayer.hand.map((card, i) => {
                  const moveInfo = isValidMove(card, gameState, settings);
                  const isPlayable = isHumanTurn && moveInfo.valid;
                  
                  return (
                    <motion.div
                      key={card.id}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      whileHover={{ y: -40, scale: 1.2, zIndex: 100 }}
                      transition={{ type: "spring", damping: 20, stiffness: 300 }}
                      className="relative shrink-0 -ml-10 sm:-ml-12 md:-ml-14 first:ml-0"
                    >
                      <Card 
                        card={card} 
                        isFaceUp={true} 
                        isPlayable={isPlayable}
                        onClick={() => handleCardClick(card.id)}
                        className={`scale-[0.7] sm:scale-[0.85] md:scale-100 origin-bottom ${!isPlayable && isHumanTurn ? 'opacity-40 grayscale-[0.8]' : ''} ${isPlayable ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
                      />
                    </motion.div>
                  );
                })}
              </div>

              {/* Controls */}
              {isHumanTurn && displayPlayer.hand.length === 2 && (
                <div className="absolute -top-16 right-0">
                  <button
                    onClick={handleDeclareLastCard}
                    className={`px-4 py-2 rounded-xl font-black italic text-[10px] shadow-xl transition-all ${
                      displayPlayer.hasDeclaredLastCard 
                      ? "bg-emerald-500 text-white" 
                      : "bg-white text-slate-900 hover:bg-yellow-400"
                    }`}
                  >
                    {displayPlayer.hasDeclaredLastCard ? "LAST CARD DECLARED!" : "DECLARE LAST CARD"}
                  </button>
                </div>
              )}
            </div>
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
