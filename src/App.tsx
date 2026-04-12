/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu } from './components/Menu';
import { GameBoard } from './components/GameBoard';
import { GameState, GameSettings } from './types';
import { getInitialGameState } from './lib/gameUtils';
import confetti from 'canvas-confetti';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);

  const handleStartGame = (newSettings: GameSettings, playerNames: string[]) => {
    setSettings(newSettings);
    setGameState(getInitialGameState(newSettings, playerNames));
  };

  const handleUpdateGame = (newState: GameState) => {
    setGameState(newState);
    
    // Trigger confetti on win
    if (newState.gameStatus === 'game-over') {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#facc15', '#ef4444']
      });
    }
  };

  const handleRestart = () => {
    setGameState(null);
    setSettings(null);
  };

  if (!gameState || !settings) {
    return <Menu onStart={handleStartGame} />;
  }

  return (
    <GameBoard 
      gameState={gameState} 
      settings={settings} 
      onUpdate={handleUpdateGame}
      onRestart={handleRestart}
    />
  );
}
