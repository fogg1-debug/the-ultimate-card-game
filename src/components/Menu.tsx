import React, { useState, useEffect } from 'react';
import { GameMode, GameSettings, PlayMode, Difficulty } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Users, Layers, Monitor, User, Globe, Plus, LogIn, ArrowLeft, RefreshCw } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

import { getInitialGameState } from '../lib/gameUtils';

interface MenuProps {
  onStart: (settings: GameSettings, playerNames: string[], initialOnlineState?: any) => void;
}

export function Menu({ onStart }: MenuProps) {
  const [mode, setMode] = useState<GameMode>('classic');
  const [playMode, setPlayMode] = useState<PlayMode>('computer');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [numPlayers, setNumPlayers] = useState(2);
  const [numDecks, setNumDecks] = useState<1 | 2>(1);
  const [startingScore, setStartingScore] = useState(101);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(7);
  
  // Online States
  const [onlineView, setOnlineView] = useState<'main' | 'host' | 'join' | 'lobby'>('main');
  const [lobbies, setLobbies] = useState<any[]>([]);
  const [currentLobby, setCurrentLobby] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lobbyIdInput, setLobbyIdInput] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (playMode === 'online' && onlineView === 'join') {
      const q = query(collection(db, 'lobbies'), where('status', '==', 'waiting'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const lobbyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLobbies(lobbyList);
      });
      return () => unsubscribe();
    }
  }, [playMode, onlineView]);

  useEffect(() => {
    if (currentLobby) {
      const unsubscribe = onSnapshot(doc(db, 'lobbies', currentLobby.id), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setCurrentLobby({ id: doc.id, ...data });
          if (data.status === 'playing' && data.gameState) {
            const settingsWithLobby = { ...data.settings, lobbyId: doc.id };
            onStart(settingsWithLobby, data.players.map((p: any) => p.name), data.gameState);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [currentLobby?.id]);

  const handleStart = () => {
    const playerNames = playMode === 'computer' 
      ? ['You', ...Array.from({ length: numPlayers - 1 }, (_, i) => `AI ${i + 1}`)]
      : Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
    
    onStart(
      { mode, playMode, difficulty, numDecks, startingScore, cardsPerPlayer },
      playerNames
    );
  };

  const handleOnlineClick = async () => {
    setPlayMode('online');
    setOnlineView('main');
    if (!auth.currentUser) {
      setIsLoading(true);
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth failed", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const hostLobby = async () => {
    if (!auth.currentUser) return;
    setIsLoading(true);
    try {
      const lobbyData = {
        hostId: auth.currentUser.uid,
        hostName: `Player ${auth.currentUser.uid.slice(0, 4)}`,
        status: 'waiting',
        settings: { mode, playMode: 'online', difficulty, numDecks, startingScore, cardsPerPlayer },
        players: [{ id: auth.currentUser.uid, name: `Player ${auth.currentUser.uid.slice(0, 4)}`, isHost: true }],
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'lobbies'), lobbyData);
      setCurrentLobby({ id: docRef.id, ...lobbyData });
      setOnlineView('lobby');
    } catch (err) {
      console.error("Failed to host lobby", err);
    } finally {
      setIsLoading(false);
    }
  };

  const joinLobby = async (lobby: any) => {
    if (!auth.currentUser) return;
    if (lobby.players.length >= 4) {
      alert("Lobby is full");
      return;
    }
    
    // Check if I'm already in the lobby
    const isAlreadyIn = lobby.players.some((p: any) => p.id === auth.currentUser?.uid);
    
    if (!isAlreadyIn) {
      const updatedPlayers = [...lobby.players, { id: auth.currentUser.uid, name: `Player ${auth.currentUser.uid.slice(0, 4)}`, isHost: false }];
      await updateDoc(doc(db, 'lobbies', lobby.id), {
        players: updatedPlayers
      });
      setCurrentLobby({ ...lobby, players: updatedPlayers });
    } else {
      setCurrentLobby(lobby);
    }
    
    setOnlineView('lobby');
  };

  const joinLobbyById = async () => {
    if (!lobbyIdInput.trim() || !auth.currentUser) return;
    setIsLoading(true);
    try {
      const lobbyDoc = await getDocs(query(collection(db, 'lobbies'), where('status', '==', 'waiting')));
      const lobby = lobbyDoc.docs.find(d => d.id.toLowerCase().startsWith(lobbyIdInput.toLowerCase()));
      if (lobby) {
        await joinLobby({ id: lobby.id, ...lobby.data() });
      } else {
        alert("Lobby not found");
      }
    } catch (err) {
      console.error("Join by ID failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const startGameOnline = async () => {
    if (!currentLobby || currentLobby.hostId !== user.uid) return;
    
    const playerNames = currentLobby.players.map((p: any) => p.name);
    const initialGameState = getInitialGameState(currentLobby.settings, playerNames);
    
    // Assign correct IDs to players in the initial state
    initialGameState.players = initialGameState.players.map((p, i) => ({
      ...p,
      id: currentLobby.players[i].id,
      isAI: false // Online players are not AI
    }));

    await updateDoc(doc(db, 'lobbies', currentLobby.id), {
      status: 'playing',
      gameState: initialGameState
    });
  };

  const getCardColor = () => {
    if (playMode === 'online') return 'bg-red-600';
    return mode === 'classic' ? 'bg-blue-600' : 'bg-purple-600';
  };

  const getGlowColor = () => {
    if (playMode === 'online') return 'card-glow-red';
    return mode === 'classic' ? 'card-glow-blue' : 'card-glow-purple';
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
      {/* Background Decorative Cards */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatePresence mode="popLayout">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={`${mode}-${playMode}-${i}`}
              initial={{ 
                x: Math.random() * 1000 - 500, 
                y: Math.random() * 1000 + 500, 
                rotate: Math.random() * 360,
                opacity: 0 
              }}
              animate={{ 
                x: (i - 2) * 300, 
                y: (i % 2 === 0 ? -200 : 200), 
                rotate: (i - 2) * 15,
                opacity: 0.1
              }}
              exit={{ 
                x: Math.random() * 1000 - 500, 
                y: -1000, 
                rotate: Math.random() * 360,
                opacity: 0 
              }}
              transition={{ 
                type: "spring", 
                damping: 20, 
                stiffness: 50,
                delay: i * 0.05 
              }}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-96 ${getCardColor()} rounded-3xl border border-white/10 card-pattern`}
            />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={`${mode}-${playMode}-${onlineView}`}
          initial={{ opacity: 0, scale: 0.9, rotateY: 90 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          exit={{ opacity: 0, scale: 1.1, rotateY: -90 }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          className={`relative max-w-md w-full aspect-[2/3] ${getCardColor()} rounded-[2.5rem] p-1 shadow-2xl ${getGlowColor()} card-pattern`}
        >
          {/* Card Inner Border */}
          <div className="absolute inset-4 border-2 border-white/20 rounded-[1.8rem] pointer-events-none" />
          
          {/* Main Content Area */}
          <div className="h-full w-full bg-slate-900/90 backdrop-blur-md rounded-[2.3rem] p-8 flex flex-col">
            <div className="text-center mb-6">
              <motion.h1 
                layoutId="title"
                className="text-6xl font-black text-white mb-1 tracking-tighter italic"
              >
                SWITCH
              </motion.h1>
              <div className="h-1 w-24 bg-white/20 mx-auto rounded-full mb-2" />
              <p className="text-white/60 font-bold text-xs uppercase tracking-[0.2em]">
                {playMode === 'online' ? 'Online Multiplayer' : mode === 'classic' ? 'Classic Edition' : 'Ultimate Edition'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
              {playMode !== 'online' ? (
                <>
                  {/* Mode Selection */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setMode('classic'); setPlayMode('computer'); }}
                      className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all ${
                        mode === 'classic' && playMode !== 'online'
                        ? 'border-blue-400 bg-blue-500/20 text-white' 
                        : 'border-white/10 text-white/40 hover:border-white/20'
                      }`}
                    >
                      <div className="font-black text-lg italic">CLASSIC</div>
                    </button>
                    <button
                      onClick={() => { setMode('ultimate'); setPlayMode('computer'); }}
                      className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all ${
                        mode === 'ultimate' && playMode !== 'online'
                        ? 'border-purple-400 bg-purple-500/20 text-white' 
                        : 'border-white/10 text-white/40 hover:border-white/20'
                      }`}
                    >
                      <div className="font-black text-lg italic">ULTIMATE</div>
                    </button>
                  </div>

                  {/* Online Toggle */}
                    <button
                    onClick={handleOnlineClick}
                    className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                      playMode === 'online'
                      ? 'border-red-400 bg-red-500/20 text-white'
                      : 'border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={20} className={playMode === 'online' ? 'text-red-400' : 'text-white/40'} />
                      <div className="text-left">
                        <div className="font-black italic">ONLINE LOBBY</div>
                      </div>
                    </div>
                    <div className="px-2 py-1 bg-red-500/20 rounded text-[10px] font-black text-red-400">NEW</div>
                  </button>

                  {/* Settings */}
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between text-white/80">
                      <div className="flex items-center gap-2">
                        <Monitor size={16} className="text-white/40" />
                        <span className="text-xs font-black uppercase tracking-wider">Play Mode</span>
                      </div>
                      <div className="flex bg-white/5 p-1 rounded-xl">
                        {(['computer', 'local'] as PlayMode[]).map(m => (
                          <button
                            key={m}
                            onClick={() => setPlayMode(m)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                              playMode === m ? 'bg-white text-slate-900 shadow-lg' : 'text-white/40 hover:text-white/60'
                            }`}
                          >
                            {m === 'computer' ? 'VS CPU' : 'Local'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-white/80">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-white/40" />
                        <span className="text-xs font-black uppercase tracking-wider">Players</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => setNumPlayers(n)}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                              numPlayers === n ? 'bg-white text-slate-900' : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {mode === 'classic' ? (
                      <div className="flex items-center justify-between text-white/80">
                        <div className="flex items-center gap-2">
                          <Layers size={16} className="text-white/40" />
                          <span className="text-xs font-black uppercase tracking-wider">Cards</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[4, 7].map(n => (
                            <button
                              key={n}
                              onClick={() => setCardsPerPlayer(n)}
                              className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                                cardsPerPlayer === n ? 'bg-white text-slate-900' : 'bg-white/5 text-white/40 hover:bg-white/10'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-white text-[10px] font-black uppercase">
                            <div className="flex items-center gap-2">
                              <Layers size={14} className="text-white/40" />
                              <span>Cards Dealt</span>
                            </div>
                            <span className="text-purple-400">{cardsPerPlayer}</span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="12"
                            step="1"
                            value={cardsPerPlayer}
                            onChange={(e) => setCardsPerPlayer(parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-white text-[10px] font-black uppercase">
                            <div className="flex items-center gap-2">
                              <Plus size={14} className="text-white/40" />
                              <span>Starting Score</span>
                            </div>
                            <span className="text-purple-400">{startingScore}</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="300"
                            step="10"
                            value={startingScore}
                            onChange={(e) => setStartingScore(parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-white/80">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-white/40" />
                        <span className="text-xs font-black uppercase tracking-wider">Decks</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[1, 2].map(n => (
                          <button
                            key={n}
                            onClick={() => setNumDecks(n as 1 | 2)}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                              numDecks === n ? 'bg-white text-slate-900' : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {onlineView === 'main' && (
                    <div className="grid gap-3">
                      <button
                        onClick={() => setOnlineView('host')}
                        className="p-6 rounded-3xl bg-white/5 border-2 border-white/10 hover:border-red-400/50 hover:bg-red-500/10 transition-all group text-left"
                      >
                        <Plus className="text-red-400 mb-2 group-hover:scale-110 transition-transform" />
                        <div className="font-black text-xl text-white italic">HOST GAME</div>
                        <div className="text-xs text-white/40 font-bold">Create a new private lobby</div>
                      </button>
                      <button
                        onClick={() => setOnlineView('join')}
                        className="p-6 rounded-3xl bg-white/5 border-2 border-white/10 hover:border-red-400/50 hover:bg-red-500/10 transition-all group text-left"
                      >
                        <LogIn className="text-red-400 mb-2 group-hover:scale-110 transition-transform" />
                        <div className="font-black text-xl text-white italic">JOIN GAME</div>
                        <div className="text-xs text-white/40 font-bold">Find an existing lobby</div>
                      </button>
                      <button
                        onClick={() => setPlayMode('computer')}
                        className="mt-4 flex items-center justify-center gap-2 text-white/40 hover:text-white/60 transition-colors text-xs font-black uppercase"
                      >
                        <ArrowLeft size={14} /> Back to Offline
                      </button>
                    </div>
                  )}

                  {onlineView === 'host' && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-red-400 font-black italic">
                        <Globe size={18} /> LOBBY SETTINGS
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-white/80">
                          <span className="text-xs font-black uppercase tracking-wider">Mode</span>
                          <div className="flex bg-white/5 p-1 rounded-xl">
                            <button onClick={() => setMode('classic')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${mode === 'classic' ? 'bg-white text-slate-900' : 'text-white/40'}`}>Classic</button>
                            <button onClick={() => setMode('ultimate')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${mode === 'ultimate' ? 'bg-white text-slate-900' : 'text-white/40'}`}>Ultimate</button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-white/80">
                          <div className="flex items-center gap-2">
                            <Layers size={16} className="text-white/40" />
                            <span className="text-xs font-black uppercase tracking-wider">Decks</span>
                          </div>
                          <div className="flex gap-1.5">
                            {[1, 2].map(n => (
                              <button
                                key={n}
                                onClick={() => setNumDecks(n as 1 | 2)}
                                className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                                  numDecks === n ? 'bg-white text-slate-900' : 'bg-white/5 text-white/40'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>

                        {mode === 'ultimate' && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-white text-[10px] font-black uppercase">
                                <span>Starting Score</span>
                                <span className="text-red-400">{startingScore}</span>
                              </div>
                              <input
                                type="range"
                                min="50"
                                max="300"
                                step="10"
                                value={startingScore}
                                onChange={(e) => setStartingScore(parseInt(e.target.value))}
                                className="w-full accent-red-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-white text-[10px] font-black uppercase">
                                <span>Cards Dealt</span>
                                <span className="text-red-400">{cardsPerPlayer}</span>
                              </div>
                              <input
                                type="range"
                                min="4"
                                max="12"
                                step="1"
                                value={cardsPerPlayer}
                                onChange={(e) => setCardsPerPlayer(parseInt(e.target.value))}
                                className="w-full accent-red-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={hostLobby}
                        disabled={isLoading}
                        className="w-full py-4 bg-red-500 text-white rounded-2xl font-black italic text-lg shadow-xl shadow-red-500/20 hover:bg-red-400 transition-colors flex items-center justify-center gap-2"
                      >
                        {isLoading ? <RefreshCw className="animate-spin" /> : <Globe size={20} />}
                        CREATE LOBBY
                      </button>
                      <button onClick={() => setOnlineView('main')} className="w-full text-white/40 text-xs font-black uppercase">Cancel</button>
                    </div>
                  )}

                  {onlineView === 'join' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-red-400 font-black italic">
                          <LogIn size={18} /> JOIN GAME
                        </div>
                        <button onClick={() => setOnlineView('main')} className="text-white/40 text-[10px] font-black uppercase">Back</button>
                      </div>

                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="Enter Lobby ID..."
                          value={lobbyIdInput}
                          onChange={(e) => setLobbyIdInput(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm font-bold focus:outline-none focus:border-red-400/50"
                        />
                        <button 
                          onClick={joinLobbyById}
                          disabled={isLoading}
                          className="bg-red-500 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-red-400 disabled:opacity-50"
                        >
                          JOIN
                        </button>
                      </div>

                      <div className="h-px bg-white/5 my-2" />

                      <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">Available Lobbies</div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                        {lobbies.length === 0 ? (
                          <div className="py-12 text-center text-white/20 font-black italic">NO LOBBIES FOUND</div>
                        ) : (
                          lobbies.map(l => (
                            <button
                              key={l.id}
                              onClick={() => joinLobby(l)}
                              className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-red-400/50 flex items-center justify-between group transition-all"
                            >
                              <div className="text-left">
                                <div className="text-white font-black italic">{l.hostName}'s Game</div>
                                <div className="text-[10px] text-white/40 font-bold uppercase">{l.settings.mode} • {l.players.length}/4 Players</div>
                              </div>
                              <ArrowLeft className="rotate-180 text-white/20 group-hover:text-red-400 transition-colors" size={18} />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {onlineView === 'lobby' && currentLobby && (
                    <div className="space-y-6">
                      <div className="text-center">
                        <div className="text-red-400 font-black italic text-sm mb-1 tracking-widest">LOBBY READY</div>
                        <div className="text-white font-black text-2xl italic mb-1">{currentLobby.id.slice(0, 6).toUpperCase()}</div>
                        <div className="text-[8px] text-white/30 font-bold uppercase tracking-[0.3em]">Share this ID with friends</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Players Joined</div>
                        {currentLobby.players.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${p.id === user?.uid ? 'bg-green-400' : 'bg-red-400'}`} />
                              <span className="text-white font-bold italic">{p.name}</span>
                            </div>
                            {p.isHost && <span className="text-[8px] font-black bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded uppercase">Host</span>}
                          </div>
                        ))}
                        {Array.from({ length: 4 - currentLobby.players.length }).map((_, i) => (
                          <div key={i} className="p-3 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
                            <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">Waiting for player...</span>
                          </div>
                        ))}
                      </div>
                      {currentLobby.hostId === user?.uid ? (
                        <div className="space-y-2">
                          <button
                            onClick={startGameOnline}
                            className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black italic text-lg shadow-xl hover:bg-red-50 transition-colors"
                          >
                            START SESSION
                          </button>
                          <button 
                            onClick={() => { setCurrentLobby(null); setOnlineView('main'); }}
                            className="w-full text-white/20 text-[10px] font-black uppercase hover:text-white/40 transition-colors"
                          >
                            Cancel Lobby
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-center py-4 text-white/40 font-black italic animate-pulse">WAITING FOR HOST...</div>
                          <button 
                            onClick={() => { setCurrentLobby(null); setOnlineView('main'); }}
                            className="w-full text-white/20 text-[10px] font-black uppercase hover:text-white/40 transition-colors"
                          >
                            Leave Lobby
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {playMode !== 'online' && (
              <motion.button
                layoutId="start-btn"
                onClick={handleStart}
                className="w-full mt-6 bg-white text-slate-900 py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors shadow-xl"
              >
                <Play fill="currentColor" size={20} />
                START GAME
              </motion.button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
