import Foundation

/// "Now" for everything schedule-related. Debug builds can time-travel:
/// launch with `-roloTimeTravel 2026-09-26T13:00:00Z` to see the 8 AM rush at midnight.
nonisolated enum AppClock {
    static let offset: TimeInterval = {
        #if DEBUG
        if let raw = UserDefaults.standard.string(forKey: "roloTimeTravel"),
           let date = try? Date(raw, strategy: .iso8601) {
            return date.timeIntervalSinceNow
        }
        #endif
        return 0
    }()

    static var now: Date { Date().addingTimeInterval(offset) }

    /// Shift a wall-clock date (e.g. a TimelineView tick) onto the app clock.
    static func shift(_ date: Date) -> Date { date.addingTimeInterval(offset) }
}
