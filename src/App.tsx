/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu } from './components/Menu';
import { GameBoard } from './components/GameBoard';
import { GameState, GameSettings } from './types';
import { getInitialGameState } from './lib/gameUtils';
import confetti from 'canvas-confetti';
import { auth } from './lib/firebase';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [winStreak, setWinStreak] = useState(() => {
    return parseInt(localStorage.getItem('switch_win_streak') || '0');
  });

  const handleStartGame = useCallback((newSettings: GameSettings, playerNames: string[], initialOnlineState?: GameState) => {
    setSettings(newSettings);
    if (initialOnlineState) {
      setGameState(initialOnlineState);
    } else {
      setGameState(getInitialGameState(newSettings, playerNames));
    }
  }, []);

  const handleUpdateGame = useCallback((newState: GameState) => {
    setGameState(newState);
    
    // Trigger confetti on win
    if (newState.gameStatus === 'game-over') {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#facc15', '#ef4444']
      });

      // Win Streak Logic
      const winner = newState.players.find(p => p.hand.length === 0);
      const isUserWinner = winner?.id === auth.currentUser?.uid || (settings?.playMode === 'computer' && newState.players.indexOf(winner!) === 0);
      
      if (isUserWinner) {
        const newStreak = winStreak + 1;
        setWinStreak(newStreak);
        localStorage.setItem('switch_win_streak', newStreak.toString());
      } else {
        setWinStreak(0);
        localStorage.setItem('switch_win_streak', '0');
      }
    }
  }, [winStreak, settings]);

  const handleRestart = useCallback(() => {
    setGameState(null);
    setSettings(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">
      <AnimatePresence mode="wait">
        {!gameState || !settings ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Menu onStart={handleStartGame} winStreak={winStreak} />
          </motion.div>
        ) : (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GameBoard 
              gameState={gameState} 
              settings={settings} 
              onUpdate={handleUpdateGame}
              onRestart={handleRestart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
