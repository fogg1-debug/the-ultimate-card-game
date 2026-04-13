import { motion } from 'motion/react';
import { Card as CardType, Suit } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  card: CardType;
  onClick?: () => void;
  isFaceUp?: boolean;
  className?: string;
  isPlayable?: boolean;
  isCurrent?: boolean;
  noHover?: boolean;
  key?: string | number;
}

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  joker: '🃏',
};

const suitColors: Record<Suit, string> = {
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-slate-900',
  spades: 'text-slate-900',
  joker: 'text-purple-600',
};

export function Card({ card, onClick, isFaceUp = true, className, isPlayable, isCurrent, noHover }: CardProps) {
  const displaySuit = card.transformedToSuit || card.suit;
  const displayRank = card.transformedToRank || card.rank;
  
  const colorClass = suitColors[displaySuit];
  const symbol = suitSymbols[displaySuit];

  if (!isFaceUp) {
    return (
      <motion.div
        layoutId={card.id}
        whileHover={noHover ? {} : { y: -20, scale: 1.05 }}
        onClick={onClick}
        className={cn(
          "relative w-20 h-30 sm:w-24 sm:h-36 rounded-xl border-2 border-white shadow-lg cursor-pointer bg-blue-800",
          className
        )}
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <div className="absolute inset-2 border border-white/30 rounded-lg flex items-center justify-center">
          <div className="text-white/20 text-4xl font-bold rotate-45">SWITCH</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={card.id}
      whileHover={noHover ? {} : { y: -20, scale: 1.1, zIndex: 50 }}
      animate={isCurrent ? { scale: 1.05, boxShadow: "0 0 20px rgba(255,255,255,0.5)" } : {}}
      onClick={isPlayable ? onClick : undefined}
      className={cn(
        "relative w-20 h-30 sm:w-24 sm:h-36 bg-white rounded-lg sm:rounded-xl border sm:border-2 shadow-xl flex flex-col p-1 sm:p-2 select-none",
        isPlayable ? "cursor-pointer border-blue-400" : "border-slate-200",
        isCurrent && "border-yellow-400 border-2 sm:border-4",
        className
      )}
    >
      <div className={cn("flex justify-between items-start leading-none", colorClass)}>
        <div className="flex flex-col items-center">
          <span className="text-sm sm:text-lg font-bold">{displayRank}</span>
          <span className="text-xs sm:text-sm">{symbol}</span>
        </div>
      </div>

      <div className={cn("flex-1 flex items-center justify-center text-3xl sm:text-4xl", colorClass)}>
        {card.isJoker && !card.transformedToRank ? (
          <span className={card.jokerType === 'red' ? 'text-red-600' : 'text-slate-900'}>🃏</span>
        ) : (
          <span>{symbol}</span>
        )}
      </div>

      <div className={cn("flex justify-between items-end leading-none rotate-180", colorClass)}>
        <div className="flex flex-col items-center">
          <span className="text-sm sm:text-lg font-bold">{displayRank}</span>
          <span className="text-xs sm:text-sm">{symbol}</span>
        </div>
      </div>
      
      {card.isJoker && card.transformedToRank && (
        <div className="absolute top-1 right-1 text-[8px] font-black uppercase bg-red-500 text-white px-1 rounded">
          Joker
        </div>
      )}
      
      {!isPlayable && !isCurrent && <div className="absolute inset-0 bg-black/5 rounded-xl pointer-events-none" />}
    </motion.div>
  );
}
