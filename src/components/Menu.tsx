import React, { useState } from 'react';
import { GameMode, GameSettings, PlayMode, Difficulty } from '../types';
import { motion } from 'motion/react';
import { Settings, Play, Users, Layers, Monitor, User } from 'lucide-react';

interface MenuProps {
  onStart: (settings: GameSettings, playerNames: string[]) => void;
}

export function Menu({ onStart }: MenuProps) {
  const [mode, setMode] = useState<GameMode>('classic');
  const [playMode, setPlayMode] = useState<PlayMode>('computer');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [numPlayers, setNumPlayers] = useState(2);
  const [numDecks, setNumDecks] = useState<1 | 2>(1);
  const [startingScore, setStartingScore] = useState(101);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(7);

  const handleStart = () => {
    const playerNames = playMode === 'computer' 
      ? ['You', ...Array.from({ length: numPlayers - 1 }, (_, i) => `AI ${i + 1}`)]
      : Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
    
    onStart(
      { mode, playMode, difficulty, numDecks, startingScore, cardsPerPlayer },
      playerNames
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700"
      >
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-white mb-2 tracking-tighter">SWITCH</h1>
          <p className="text-slate-400 font-medium">The Ultimate Card Game</p>
        </div>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setMode('classic');
                setStartingScore(101);
                setCardsPerPlayer(7);
              }}
              className={`p-4 rounded-2xl border-2 transition-all ${
                mode === 'classic' 
                ? 'border-blue-500 bg-blue-500/10 text-white' 
                : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-bold text-lg">Classic</div>
              <div className="text-xs opacity-60">Standard rules</div>
            </button>
            <button
              onClick={() => setMode('ultimate')}
              className={`p-4 rounded-2xl border-2 transition-all ${
                mode === 'ultimate' 
                ? 'border-purple-500 bg-purple-500/10 text-white' 
                : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-bold text-lg">Ultimate</div>
              <div className="text-xs opacity-60">Jokers & chaos</div>
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Monitor size={18} className="text-blue-400" />
                <span className="font-medium">Play Mode</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlayMode('computer')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all text-xs ${
                    playMode === 'computer' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  VS CPU
                </button>
                <button
                  onClick={() => setPlayMode('local')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all text-xs ${
                    playMode === 'local' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Local
                </button>
              </div>
            </div>

            {playMode === 'computer' && (
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-blue-400" />
                  <span className="font-medium">Difficulty</span>
                </div>
                <div className="flex items-center gap-2">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-2 py-1 rounded-lg font-bold transition-all text-[10px] uppercase ${
                        difficulty === d ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-400" />
                <span className="font-medium">Players</span>
              </div>
              <div className="flex items-center gap-3">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumPlayers(n)}
                    className={`w-8 h-8 rounded-lg font-bold transition-all ${
                      numPlayers === n ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-blue-400" />
                <span className="font-medium">Decks</span>
              </div>
              <div className="flex items-center gap-3">
                {[1, 2].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumDecks(n as 1 | 2)}
                    className={`w-8 h-8 rounded-lg font-bold transition-all ${
                      numDecks === n ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'classic' && (
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-blue-400" />
                  <span className="font-medium">Cards Dealt</span>
                </div>
                <div className="flex items-center gap-3">
                  {[4, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => setCardsPerPlayer(n)}
                      className={`w-8 h-8 rounded-lg font-bold transition-all ${
                        cardsPerPlayer === n ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'ultimate' && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-white text-sm font-medium">
                    <span>Starting Score</span>
                    <span className="text-purple-400">{startingScore}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="10"
                    value={startingScore}
                    onChange={(e) => setStartingScore(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-white text-sm font-medium">
                    <span>Cards Dealt</span>
                    <span className="text-purple-400">{cardsPerPlayer}</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="10"
                    value={cardsPerPlayer}
                    onChange={(e) => setCardsPerPlayer(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full mt-10 bg-white text-slate-900 py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors shadow-xl"
        >
          <Play fill="currentColor" size={20} />
          START GAME
        </button>
      </motion.div>
    </div>
  );
}
