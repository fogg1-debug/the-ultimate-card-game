import SwiftUI

struct CardView: View {
    let card: Card
    let isFaceUp: Bool
    var isPlayable: Bool = false
    
    var body: some View {
        ZStack {
            if isFaceUp {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white)
                    .shadow(color: isPlayable ? .blue.opacity(0.5) : .black.opacity(0.2), radius: isPlayable ? 8 : 4)
                
                VStack {
                    HStack {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(card.displayRank.rawValue)
                                .font(.system(size: 16, weight: .black))
                            Text(card.displaySuit.symbol)
                                .font(.system(size: 14))
                        }
                        Spacer()
                    }
                    Spacer()
                    Text(card.displaySuit.symbol)
                        .font(.system(size: 36))
                    Spacer()
                    HStack {
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(card.displayRank.rawValue)
                                .font(.system(size: 16, weight: .black))
                            Text(card.displaySuit.symbol)
                                .font(.system(size: 14))
                        }
                    }.rotationEffect(.degrees(180))
                }
                .padding(6)
                .foregroundColor(card.displaySuit == .hearts || card.displaySuit == .diamonds ? .red : .black)
                
                if !isPlayable && isFaceUp {
                    Color.black.opacity(0.05).cornerRadius(12)
                }
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(LinearGradient(colors: [.blue, .blue.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.white.opacity(0.2), lineWidth: 2)
                            .padding(4)
                    )
                    .overlay(
                        Text("SWITCH")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(.white.opacity(0.2))
                            .rotationEffect(.degrees(-45))
                    )
                    .shadow(radius: 4)
            }
        }
        .frame(width: 80, height: 120)
    }
}

struct GameBoardView: View {
    @StateObject var engine = GameEngine()
    @State private var pulseScale: CGFloat = 1.0
    
    var body: some View {
        ZStack {
            // Casino Table Background
            RadialGradient(colors: [Color(red: 0.1, green: 0.4, blue: 0.2), Color(red: 0.05, green: 0.2, blue: 0.1)], center: .center, startRadius: 100, endRadius: 600)
                .ignoresSafeArea()
            
            VStack {
                // Top Bar: Players
                HStack(spacing: 15) {
                    ForEach(engine.players) { player in
                        VStack(spacing: 4) {
                            ZStack {
                                Circle()
                                    .stroke(player.hand.count == 1 ? Color.purple : (engine.players[engine.currentPlayerIndex].id == player.id ? Color.yellow : Color.white.opacity(0.2)), lineWidth: 3)
                                    .frame(width: 50, height: 50)
                                    .scaleEffect(player.hand.count == 1 ? pulseScale : 1.0)
                                
                                Text(engine.settings.mode == .ultimate && player.isAI ? "?" : "\(player.hand.count)")
                                    .font(.system(size: 18, weight: .black))
                            }
                            Text(player.name)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white.opacity(0.8))
                        }
                        .opacity(player.isEliminated ? 0.3 : 1.0)
                    }
                }
                .padding(.top)
                
                Spacer()
                
                // Center Area
                HStack(spacing: 40) {
                    // Draw Pile
                    VStack {
                        ZStack {
                            CardView(card: Card(id: "back", suit: .spades, rank: .ace), isFaceUp: false)
                                .onTapGesture { engine.drawCard() }
                            
                            if engine.drawStackCount > 0 {
                                Text("+\(engine.drawStackCount)")
                                    .font(.system(size: 20, weight: .black))
                                    .foregroundColor(.white)
                                    .padding(8)
                                    .background(Circle().fill(Color.red))
                                    .offset(x: 30, y: -40)
                            }
                        }
                        Text("DRAW").font(.system(size: 10, weight: .black)).opacity(0.5)
                    }
                    
                    // Discard Pile
                    VStack {
                        if let topCard = engine.discardPile.first {
                            CardView(card: topCard, isFaceUp: true)
                        }
                        Text("DISCARD").font(.system(size: 10, weight: .black)).opacity(0.5)
                    }
                }
                
                Spacer()
                
                // Action Message
                Text(engine.lastActionMessage)
                    .font(.system(size: 14, weight: .medium))
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color.black.opacity(0.3)))
                    .padding(.bottom, 20)
                
                // Player Hand
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: -30) {
                        ForEach(engine.players[engine.currentPlayerIndex].hand) { card in
                            CardView(card: card, isFaceUp: true, isPlayable: engine.isValidMove(card))
                                .onTapGesture { engine.playCard(cardId: card.id) }
                                .offset(y: engine.isValidMove(card) ? -10 : 0)
                        }
                    }
                    .padding(.horizontal, 50)
                    .padding(.bottom, 20)
                }
                .frame(height: 160)
            }
        }
        .onAppear {
            // Bootstrap a game for demo
            engine.startNewGame(settings: GameSettings(), playerNames: ["You", "CPU 1", "CPU 2"])
            
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                pulseScale = 1.2
            }
        }
    }
}
