import Foundation

enum Suit: String, CaseIterable, Codable {
    case hearts, diamonds, clubs, spades, joker
    
    var symbol: String {
        switch self {
        case .hearts: return "♥"
        case .diamonds: return "♦"
        case .clubs: return "♣"
        case .spades: return "♠"
        case .joker: return "🃏"
        }
    }
}

enum Rank: String, CaseIterable, Codable {
    case ace = "A", two = "2", three = "3", four = "4", five = "5", six = "6", seven = "7", eight = "8", nine = "9", ten = "10", jack = "J", queen = "Q", king = "K", redJoker = "RJ", blackJoker = "BJ"
    
    var scoreValue: Int {
        switch self {
        case .redJoker, .blackJoker: return 25
        case .ace: return 11
        case .two: return 15
        case .jack, .queen, .king: return 10
        default: return Int(self.rawValue) ?? 0
        }
    }
}

struct Card: Identifiable, Codable, Equatable {
    let id: String
    let suit: Suit
    let rank: Rank
    var isJoker: Bool = false
    var transformedToRank: Rank?
    var transformedToSuit: Suit?
    
    var displaySuit: Suit { transformedToSuit ?? suit }
    var displayRank: Rank { transformedToRank ?? rank }
}

enum GameMode: String, Codable {
    case classic, ultimate
}

enum PlayMode: String, Codable {
    case local, computer
}

enum Difficulty: String, Codable {
    case easy, normal, hard
}

struct Player: Identifiable, Codable {
    let id: String
    var name: String
    var hand: [Card]
    var score: Int
    var isAI: Bool
    var isEliminated: Bool
    var hasDeclaredLastCard: Bool
}

struct GameSettings: Codable {
    var mode: GameMode = .classic
    var playMode: PlayMode = .computer
    var difficulty: Difficulty = .normal
    var numDecks: Int = 1
    var startingScore: Int = 101
    var cardsPerPlayer: Int = 7
}
