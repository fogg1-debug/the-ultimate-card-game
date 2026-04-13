import Foundation
import SwiftUI

class GameEngine: ObservableObject {
    @Published var players: [Player] = []
    @Published var currentPlayerIndex: Int = 0
    @Published var drawPile: [Card] = []
    @Published var discardPile: [Card] = []
    @Published var currentSuit: Suit = .spades
    @Published var currentRank: Rank = .ace
    @Published var drawStackCount: Int = 0
    @Published var direction: Int = 1
    @Published var gameStatus: GameStatus = .menu
    @Published var blackJokerTarget: Card?
    @Published var lastActionMessage: String = ""
    @Published var settings: GameSettings = GameSettings()
    
    enum GameStatus { case menu, playing, roundEnd, gameOver }

    func startNewGame(settings: GameSettings, playerNames: [String]) {
        self.settings = settings
        var deck = createDeck(numDecks: settings.numDecks, includeJokers: settings.mode == .ultimate)
        deck.shuffle()
        
        var newPlayers: [Player] = []
        for (index, name) in playerNames.enumerated() {
            var hand: [Card] = []
            for _ in 0..<settings.cardsPerPlayer {
                if let card = deck.popLast() { hand.append(card) }
            }
            newPlayers.append(Player(id: UUID().uuidString, name: name, hand: hand, score: settings.startingScore, isAI: settings.playMode == .computer && index > 0, isEliminated: false, hasDeclaredLastCard: false))
        }
        
        // Initial discard (ensure it's not a special card)
        var firstDiscard = deck.popLast()!
        while ["2", "8", "J", "A"].contains(firstDiscard.rank.rawValue) || firstDiscard.isJoker {
            deck.insert(firstDiscard, at: 0)
            deck.shuffle()
            firstDiscard = deck.popLast()!
        }
        
        self.players = newPlayers
        self.drawPile = deck
        self.discardPile = [firstDiscard]
        self.currentSuit = firstDiscard.suit
        self.currentRank = firstDiscard.rank
        self.gameStatus = .playing
        self.lastActionMessage = "Game Started! \(players[0].name)'s turn."
        
        // Ultimate Mode Target
        if settings.mode == .ultimate {
            let randomSuit = Suit.allCases.filter { $0 != .joker }.randomElement()!
            let randomRank = Rank.allCases.filter { !["2", "8", "J", "A", "RJ", "BJ"].contains($0.rawValue) }.randomElement()!
            self.blackJokerTarget = Card(id: "target", suit: randomSuit, rank: randomRank)
        }
    }
    
    private func createDeck(numDecks: Int, includeJokers: Bool) -> [Card] {
        var deck: [Card] = []
        let suits: [Suit] = [.hearts, .diamonds, .clubs, .spades]
        let ranks: [Rank] = [.ace, .two, .three, .four, .five, .six, .seven, .eight, .nine, .ten, .jack, .queen, .king]
        
        for d in 0..<numDecks {
            for suit in suits {
                for rank in ranks {
                    deck.append(Card(id: "\(d)-\(suit)-\(rank)", suit: suit, rank: rank))
                }
            }
            if includeJokers {
                deck.append(Card(id: "\(d)-RJ", suit: .joker, rank: .redJoker, isJoker: true))
                deck.append(Card(id: "\(d)-BJ", suit: .joker, rank: .blackJoker, isJoker: true))
            }
        }
        return deck
    }
    
    func isValidMove(_ card: Card) -> Bool {
        if drawStackCount > 0 {
            return card.rank == .two || (settings.mode == .ultimate && card.rank == .redJoker)
        }
        
        if settings.mode == .ultimate && card.rank == .redJoker { return true }
        
        if settings.mode == .ultimate && card.rank == .blackJoker {
            return currentSuit == blackJokerTarget?.suit && currentRank == blackJokerTarget?.rank
        }
        
        if card.rank == .ace {
            if settings.mode == .classic { return true }
            return card.suit == currentSuit
        }
        
        return card.suit == currentSuit || card.rank == currentRank
    }
    
    func playCard(cardId: String, chosenSuit: Suit? = nil, chosenRank: Rank? = nil) {
        let playerIndex = currentPlayerIndex
        guard let cardIndex = players[playerIndex].hand.firstIndex(where: { $0.id == cardId }) else { return }
        let card = players[playerIndex].hand[cardIndex]
        
        guard isValidMove(card) else { return }
        
        // Ultimate mode finish check
        if settings.mode == .ultimate && players[playerIndex].hand.count == 1 {
            if ["2", "8", "J", "A"].contains(card.rank.rawValue) || card.isJoker {
                lastActionMessage = "Cannot finish on a special card!"
                return
            }
        }
        
        var finalCard = card
        if card.rank == .redJoker {
            finalCard.transformedToRank = chosenRank ?? .ace
            finalCard.transformedToSuit = chosenSuit ?? .hearts
        }
        
        players[playerIndex].hand.remove(at: cardIndex)
        discardPile.insert(finalCard, at: 0)
        
        currentSuit = finalCard.transformedToSuit ?? finalCard.suit
        currentRank = finalCard.transformedToRank ?? finalCard.rank
        
        // Special Logic
        var skipNext = false
        if currentRank == .two { drawStackCount += 2 }
        else if currentRank == .eight { skipNext = true }
        else if currentRank == .jack { 
            direction *= -1 
            if players.count == 2 { skipNext = true }
        } else if currentRank == .ace {
            currentSuit = chosenSuit ?? currentSuit
        }
        
        if players[playerIndex].hand.isEmpty {
            endRound(winnerIndex: playerIndex)
            return
        }
        
        advanceTurn(skip: skipNext)
    }
    
    func drawCard() {
        let playerIndex = currentPlayerIndex
        let count = drawStackCount > 0 ? drawStackCount : 1
        
        for _ in 0..<count {
            if drawPile.isEmpty {
                let top = discardPile.removeFirst()
                drawPile = discardPile.shuffled()
                discardPile = [top]
            }
            if let card = drawPile.popLast() {
                players[playerIndex].hand.append(card)
            }
        }
        
        drawStackCount = 0
        advanceTurn()
    }
    
    private func advanceTurn(skip: Bool = false) {
        var nextIndex = (currentPlayerIndex + (skip ? direction * 2 : direction) + players.count) % players.count
        while players[nextIndex].isEliminated {
            nextIndex = (nextIndex + direction + players.count) % players.count
        }
        currentPlayerIndex = nextIndex
    }
    
    private func endRound(winnerIndex: Int) {
        for i in 0..<players.count {
            if i == winnerIndex { continue }
            let penalty = players[i].hand.reduce(0) { $0 + $1.rank.scoreValue }
            players[i].score = max(0, players[i].score - penalty)
            if players[i].score <= 0 { players[i].isEliminated = true }
        }
        
        let active = players.filter { !$0.isEliminated }
        if active.count <= 1 {
            gameStatus = .gameOver
        } else {
            gameStatus = .roundEnd
        }
    }
}
